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

        this.menu = $("#menu-xml").hide();
        menubar.click("#menu-xml-rename", function() {
            self.rename(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-select-element", function() {
            self.selectElement(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-remove-tag", function() {
            self.deleteTags(editor.getActiveDocument());
        });
        this.addCommand("closeTag", this.closeTag);
        this.addCommand("removeTags", this.deleteTags);
        this.addCommand("suggest", this.suggest);
        this.addCommand("rename", this.rename);
        this.addCommand("expandSelection", this.selectElement);
        this.addCommand("format", this.format);
    }

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.activate = function(doc) {
        this.menu.show();
    };

    Constr.prototype.deactivate = function(doc) {
        this.menu.hide();
    };

    Constr.prototype.closeTag = function (doc, text, row) {
        var basePath = "xmldb:exist://" + doc.getBasePath();
        var $this = this;
        $.ajax({
            type: "PUT",
            url: "check/",
            data: text,
            contentType: "application/octet-stream",
            dataType: "json",
            success: function (data) {
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
            },
            error: function (xhr, status) {
            }
        });
    }

    Constr.prototype.validate = function(doc, code, onComplete) {
        var $this = this;
        $.ajax({
            type: "PUT",
            url: "modules/validate-xml.xq",
            data: code,
            contentType: "application/octet-stream",
            dataType: "json",
            success: function (data) {
                $this.compileError(data, doc);
                onComplete.call(this, true);
            },
            error: function (xhr, status) {
                onComplete.call(this, true);
                $.log("Compile error: %s - %s", status, xhr.responseText);
            }
        });
    }

    Constr.prototype.compileError = function(data, doc) {
        $.log("Validation returned %o", data);
        if (data.status && data.status == "invalid") {
            var messages;
            if (data.message instanceof Array)
                messages = data.message;
            else
                messages = [ data.message ];
            var annotations = [];
            for (var i = 0; i < messages.length; i++) {
                annotations.push({
                    row: parseInt(messages[i].line) - 1,
                    text: messages[i]["#text"],
                    type: "error"
                });
            }
            this.parent.updateStatus(messages[0]["#text"], doc.getPath() + "#" + messages[0].line);
            editorUtils.setAnnotations(this.editor, annotations);
        } else {
            this.parent.clearErrors();
            this.parent.updateStatus("");
        }
    };

    Constr.prototype.suggest = function(doc, text, row, column) {
        $.log("Getting suggestions for %s", text);
        $.ajax({
            type: "POST",
            url: "modules/validate-xml.xq",
            data: {
                xml: text,
                row: row,
                column: column
            },
            dataType: "json",
            success: function (data) {
                $this.compileError(data, doc);
                onComplete.call(this, true);
            },
            error: function (xhr, status) {
                onComplete.call(this, true);
                $.log("Compile error: %s - %s", status, xhr.responseText);
            }
        });
    }

    Constr.prototype.documentSaved = function(doc) {
        if (/.*\.xconf$/.test(doc.getName())) {
            var collection = doc.getBasePath();
            eXide.util.Dialog.input("Apply Configuration?", "You have saved a collection configuration file. Would you like to " +
                "apply it to collection " + collection.replace(/^\/db\/system\/config/, "") + " now?", function() {
                    eXide.util.message("Apply configuration and reindex...");
                    $.ajax({
                        type: "POST",
                        url: "modules/apply-config.xq",
                        data: {
                            collection: doc.getBasePath(),
                            config: doc.getName()
                        },
                        dataType: "json",
                        success: function(data) {
                            if (data.error) {
                                eXide.util.error("Failed to apply configuration: " + data.error);
                            } else {
                                eXide.util.success("Configuration applied.");
                            }
                        },
                        error: function(xhr, status) {
                            eXide.util.error("Failed to apply configuration: " + xhr.responseText);
                        }
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
