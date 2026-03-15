/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2011 Wolfgang Meier
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
eXide.namespace("eXide.edit.XMLModeHelper");

/**
 * XML specific helper methods.
 */
eXide.edit.XMLModeHelper = (function () {

    Constr = function(editor, menubar) {
        var self = this;
        this.parent = editor;
        this.editor = this.parent.editor;

        this.menu = document.getElementById("menu-xml");
        this.menu.style.display = "none";
        menubar.click("#menu-xml-rename", function() {
            self.rename(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-select-element", function() {
            self.selectElement(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-remove-tag", function() {
            self.deleteTags(editor.getActiveDocument());
        });
        this.addCommand("locate", this.locate);
        this.addCommand("closeTag", this.closeTag);
        this.addCommand("removeTags", this.deleteTags);
        this.addCommand("suggest", this.suggest);
        this.addCommand("rename", this.rename);
        this.addCommand("expandSelection", this.selectElement);
        this.addCommand("format", this.format);
        this.addCommand("gotoSymbol", this.gotoSymbol);
    }

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.activate = function(doc) {
        this.menu.style.display = "";
    };

    Constr.prototype.deactivate = function(doc) {
        this.menu.style.display = "none";
    };

    var ATTR_PRIORITY = { "xml:id": 0, "id": 1, "n": 2, "class": 3 };

    function pickAttr(attrs) {
        if (attrs.length === 0) return null;
        if (attrs.length === 1) return attrs[0];
        var best = attrs[0];
        var bestRank = ATTR_PRIORITY[best.name] !== undefined ? ATTR_PRIORITY[best.name] : 99;
        for (var i = 1; i < attrs.length; i++) {
            var rank = ATTR_PRIORITY[attrs[i].name] !== undefined ? ATTR_PRIORITY[attrs[i].name] : 99;
            if (rank < bestRank) { best = attrs[i]; bestRank = rank; }
        }
        return best;
    }

    Constr.prototype.createOutline = function(doc, onComplete) {
        var state = this.editor.state;
        var tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        var depth = 0;
        var pathStack = [];    // track XPath steps with positional predicates
        var siblingStack = [{}]; // stack of { tagName: count } maps per depth
        tree.iterate({
            enter: function(node) {
                if (node.name === "Element" || node.name === "SelfClosingTag") {
                    var tagNameNode = null;
                    var attrs = [];
                    var child = node.node.firstChild;
                    while (child) {
                        if (child.name === "TagName") {
                            tagNameNode = child;
                        } else if (child.name === "OpenTag" || child.name === "SelfClosingTag") {
                            var gc = child.firstChild;
                            while (gc) {
                                if (gc.name === "TagName") tagNameNode = gc;
                                if (gc.name === "Attribute") {
                                    var an = gc.firstChild;
                                    var aname = null;
                                    var aval = null;
                                    while (an) {
                                        if (an.name === "AttributeName") aname = state.sliceDoc(an.from, an.to);
                                        if (an.name === "AttributeValue") {
                                            aval = state.sliceDoc(an.from, an.to);
                                            if (aval.charAt(0) === '"' || aval.charAt(0) === "'") aval = aval.slice(1, -1);
                                        }
                                        an = an.nextSibling;
                                    }
                                    if (aname) attrs.push({ name: aname, value: aval || "" });
                                }
                                gc = gc.nextSibling;
                            }
                        }
                        child = child.nextSibling;
                    }
                    if (tagNameNode) {
                        var tagName = state.sliceDoc(tagNameNode.from, tagNameNode.to);
                        // Track sibling position at current depth
                        var siblings = siblingStack[siblingStack.length - 1];
                        siblings[tagName] = (siblings[tagName] || 0) + 1;
                        var step = tagName + "[" + siblings[tagName] + "]";
                        pathStack.push(step);
                        siblingStack.push({}); // new sibling scope for children
                        var hint = "";
                        var chosen = pickAttr(attrs);
                        if (chosen) {
                            hint = chosen.value;
                            if (hint.length > 30) hint = hint.substring(0, 30) + "…";
                        }
                        var xpath = "/" + pathStack.join("/");
                        var line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
                            name: tagName,
                            indent: depth,
                            hint: hint,
                            outlineClass: "outline-element",
                            source: doc.getPath(),
                            signature: xpath,
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    } else {
                        pathStack.push("?");
                        siblingStack.push({});
                    }
                    depth++;
                } else if (node.name === "Comment") {
                    var text = state.sliceDoc(node.from, node.to);
                    text = text.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
                    if (text.length > 40) text = text.substring(0, 40) + "…";
                    if (text) {
                        var line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
                            name: text,
                            indent: depth,
                            outlineClass: "outline-comment",
                            source: doc.getPath(),
                            signature: state.sliceDoc(node.from, Math.min(node.to, node.from + 120)),
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    return false;
                }
            },
            leave: function(node) {
                if (node.name === "Element" || node.name === "SelfClosingTag") {
                    depth--;
                    pathStack.pop();
                    siblingStack.pop();
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    };

    Constr.prototype.closeTag = function (doc, text, row) {
        var basePath = "xmldb:exist://" + doc.getBasePath();
        var $this = this;
        fetch("check/", {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: text
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status && data.status == "invalid") {
                var line = parseInt(data.message.line) - 1;
                if (line <= row) {
                    var tag = /element type "([^"]+)"/.exec(data.message["#text"]);
                    if (tag && tag.length > 0) {
                        var pos = $this.editor.state.selection.main.head;
                        var text = tag[1] + ">";
                        $this.editor.dispatch({
                            changes: { from: pos, insert: text },
                            selection: { anchor: pos + text.length }
                        });
                    }
                }
            }
        })
        .catch(function() {});
    }

    Constr.prototype.validate = function(doc, code, onComplete) {
        var $this = this;
        fetch("api/editor/validate", {
            method: "POST",
            headers: { "Content-Type": "application/xml" },
            body: code
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            $this.compileError(data, doc);
            onComplete.call(null, true);
        })
        .catch(function(err) {
            onComplete.call(null, true);
            console.log("Compile error: %s", err);
        });
    }

    Constr.prototype.compileError = function(data, doc) {
        console.log("Validation returned %o", data);
        if (data.status && data.status == "invalid") {
            var errors = data.errors || [];
            var annotations = [];
            for (var i = 0; i < errors.length; i++) {
                annotations.push({
                    row: parseInt(errors[i].line) - 1,
                    text: errors[i].message,
                    type: "error"
                });
            }
            if (errors.length > 0) {
                this.parent.updateStatus(errors[0].message, doc.getPath() + "#" + errors[0].line);
            }
            editorUtils.setAnnotations(this.editor, annotations);
        } else {
            this.parent.clearErrors();
            this.parent.updateStatus("");
        }
    };

    Constr.prototype.suggest = function(doc, text, row, column) {
        console.log("Getting suggestions for %s", text);
        fetch("api/editor/validate?validate=false", {
            method: "POST",
            headers: { "Content-Type": "application/xml" },
            body: text
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            $this.compileError(data, doc);
            onComplete.call(null, true);
        })
        .catch(function(err) {
            onComplete.call(null, true);
            console.log("Compile error: %s", err);
        });
    }

    Constr.prototype.documentSaved = function(doc) {
        if (/.*\.xconf$/.test(doc.getName())) {
            var collection = doc.getBasePath();
            eXide.util.Dialog.input("Apply Configuration?", "You have saved a collection configuration file. Would you like to " +
                "apply it to collection " + collection.replace(/^\/db\/system\/config/, "") + " now?", function() {
                    eXide.util.message("Apply configuration and reindex...");
                    var basePath = doc.getBasePath();
                    // Extract app abbrev from /db/system/config/db/apps/{abbrev}/...
                    var pathParts = basePath.replace(/^\/db\/system\/config/, "").split("/").filter(Boolean);
                    var abbrev = pathParts.length >= 2 ? pathParts[1] : pathParts[0] || "unknown";
                    fetch("api/packages/" + encodeURIComponent(abbrev) + "/config", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ collection: basePath, config: doc.getName() })
                    })
                    .then(function(response) { return response.json(); })
                    .then(function(data) {
                        if (data.error) {
                            eXide.util.error("Failed to apply configuration: " + data.error);
                        } else {
                            eXide.util.success("Configuration applied.");
                        }
                    })
                    .catch(function(err) {
                        eXide.util.error("Failed to apply configuration: " + err);
                    });
            });
        }
    };

    /**
     * Find matching start/end tags using text-based search.
     * Replaces the TokenIterator-based approach.
     */
    Constr.prototype.findStartEndTags = function(doc) {
        var text = doc.getText();
        var cursorOffset = this.editor.state.selection.main.head;

        // Find all tags in the document
        var tagRe = /<\/?([a-zA-Z][\w:\-.]*)(?:\s[^>]*)?\/?>/g;
        var stack = [];
        var match;
        var startTag = null, endTag = null;

        while ((match = tagRe.exec(text)) !== null) {
            var tagStart = match.index;
            var tagEnd = tagStart + match[0].length;
            var isClose = match[0].charAt(1) === "/";
            var isSelfClose = match[0].charAt(match[0].length - 2) === "/";
            var tagName = match[1];

            if (isSelfClose) continue;

            if (!isClose) {
                var nameStart = tagStart + 1; // after '<'
                stack.push({
                    name: tagName,
                    nameOffset: nameStart,
                    offset: tagStart
                });
                if (cursorOffset >= tagStart && cursorOffset <= tagEnd) {
                    startTag = stack[stack.length - 1];
                }
            } else {
                var last = stack.pop();
                var nameStart = tagStart + 2; // after '</'
                if (startTag === last || (cursorOffset >= tagStart && cursorOffset <= tagEnd)) {
                    if (!startTag) startTag = last;
                    endTag = {
                        name: tagName,
                        nameOffset: nameStart,
                        offset: tagStart
                    };
                    break;
                }
                if (startTag && startTag === last) {
                    endTag = {
                        name: tagName,
                        nameOffset: nameStart,
                        offset: tagStart
                    };
                    break;
                }
            }
        }
        return { start: startTag, end: endTag };
    };

    Constr.prototype.selectElement = function(doc) {
        var tags = this.findStartEndTags(doc, false);
        if (!tags.start || !tags.end) return;

        var text = doc.getText();
        var startOffset = tags.start.offset;
        var endIdx = text.indexOf(">", tags.end.offset);
        if (endIdx < 0) return;
        var endOffset = endIdx + 1;

        this.editor.dispatch({
            selection: { anchor: startOffset, head: endOffset }
        });
    };

    Constr.prototype.rename = function(doc) {
        var tags = this.findStartEndTags(doc, true);
        if (!tags.start) return;

        var from = tags.start.nameOffset;
        var to = from + tags.start.name.length;
        this.editor.dispatch({
            selection: { anchor: from, head: to }
        });
        this.editor.focus();
    };

    Constr.prototype.deleteTags = function(doc) {
        var tags = this.findStartEndTags(doc, false);
        if (!tags.start || !tags.end) return;

        var text = doc.getText();
        // Remove end tag first (so offsets for start tag remain valid)
        var endStart = tags.end.offset;
        var endEnd = text.indexOf(">", endStart);
        if (endEnd >= 0) {
            this.editor.dispatch({
                changes: { from: endStart, to: endEnd + 1 }
            });
        }

        // Remove start tag (re-read text since doc changed)
        var startStart = tags.start.offset;
        var currentText = this.editor.state.doc.toString();
        var startEnd = currentText.indexOf(">", startStart);
        if (startEnd >= 0) {
            this.editor.dispatch({
                changes: { from: startStart, to: startEnd + 1 }
            });
        }
    };

    return Constr;
}());
