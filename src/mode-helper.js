/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2013 Wolfgang Meier
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

eXide.namespace("eXide.edit.ModeHelper");

/**
 * Base class for helper methods needed by specific editing modes (like XQuery, XML...)
 */
eXide.edit.ModeHelper = (function () {

    Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;

        this.commands = {};
        this.addCommand("locate", this.locate);
        this.addCommand("format", this.format);
    }

    Constr.prototype = {

        activate: function() {
        },

        deactivate: function() {
        },

        addCommand: function (name, func) {
            if (!this.commands) {
                this.commands = {};
            }
            this.commands[name] = func;
        },

        exec: function (command, doc, args) {
            if (this.commands && this.commands[command]) {
                var nargs = [doc];
                for (var i = 0; i < args.length; i++) {
                    nargs.push(args[i]);
                }
                this.commands[command].apply(this, nargs);
            } else {
                eXide.util.message(command + " not supported in this mode.")
            }
        },

        validate: function(doc, code, onComplete) {
            if (onComplete)
                onComplete(doc);
        },

        createOutline: function(doc, onComplete) {
            var outline = document.getElementById("outline");
            if (outline) outline.innerHTML = "";
        },

        collectErrors: function(doc) {
            var tree = CM6.syntaxTree(this.editor.state);
            var state = this.editor.state;
            tree.iterate({
                enter: function(node) {
                    if (node.type.isError) {
                        var line = state.doc.lineAt(node.from);
                        var context = state.sliceDoc(
                            Math.max(0, node.from - 10),
                            Math.min(state.doc.length, node.to + 20)
                        ).replace(/\n/g, " ").trim();
                        if (context.length > 40) context = context.substring(0, 40) + "…";
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
                            name: "Error at line " + line.number,
                            outlineClass: "outline-error",
                            source: doc.getPath(),
                            signature: "Syntax error near: " + context,
                            sort: "000000",
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                        return false;
                    }
                }
            });
        },

        documentSaved: function(doc) {
        },

        locate: function(doc, type, row) {
            if (typeof row == "number") {
                editorUtils.gotoLine(this.editor, row + 1);
                this.editor.focus();
            }
            return false;
        },

        format: function(doc) {
            if (typeof prettierFormat === "undefined") {
                eXide.util.message("format not supported in this mode.");
                return;
            }
            var self = this;
            var sel = this.editor.state.selection.main;
            var code = this.editor.state.sliceDoc(sel.from, sel.to);
            var isSelection = code.length > 0;
            if (!isSelection) {
                code = doc.getText();
            }
            var mode = doc.getSyntax();
            prettierFormat.format(code, mode).then(function (formatted) {
                formatted = formatted.replace(/\n$/, "");
                if (isSelection) {
                    self.editor.dispatch({
                        changes: { from: sel.from, to: sel.to, insert: formatted }
                    });
                } else {
                    var cursorOffset = self.editor.state.selection.main.head;
                    self.editor.dispatch({
                        changes: { from: 0, to: self.editor.state.doc.length, insert: formatted },
                        selection: { anchor: Math.min(cursorOffset, formatted.length) }
                    });
                }
            }).catch(function (e) {
                console.log("Error formatting code: %s", e.message);
                eXide.util.error("Code could not be formatted: " + e.message);
            });
        },

        autocomplete : function(doc, alwaysShow) {
            var self = this;
            var removeFrom, removeTo;
            if (alwaysShow === undefined) {
                alwaysShow = true;
            }

            function apply(selected) {
                if (removeFrom !== undefined) {
                    self.editor.dispatch({ changes: { from: removeFrom, to: removeTo } });
                }
                editorUtils.insertSnippet(self.editor, selected.template);
            }

            if (alwaysShow === undefined) {
                alwaysShow = true;
            }

            var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
            var pos = editorUtils.textToScreenCoordinates(this.editor, lead.row, lead.column);
            var token;
            var isEmpty = this.editor.state.selection.main.empty;
            if (isEmpty) {
                var row = lead.row;
                var lineNum = row + 1;
                var line = (lineNum >= 1 && lineNum <= this.editor.state.doc.lines) ? this.editor.state.doc.line(lineNum).text : "";
                var start = lead.column - 1;
                var end = lead.column;
                while (start >= 0) {
                   var ch = line.substring(start, end);
                   if (ch.match(/^\$[\w:\-_\.]+$/)) {
                       break;
                   }
                   if (!ch.match(/^[\w:\-_\.]+$/)) {
                       start++;
                       break;
                   }
                   start--;
                }
                token = line.substring(start, end);
                end++;

                if (token === "" && !alwaysShow) {
                    return false;
                } else {
                    removeFrom = editorUtils.rowColToOffset(this.editor.state, row, start);
                    removeTo = editorUtils.rowColToOffset(this.editor.state, row, end);
                }
            } else if (!alwaysShow) {
                return false;
            }

            eXide.util.Popup.position(pos);

            var popupItems = this.getTemplates(doc, token, []);
            if (popupItems.length == 0) {
                return false;
            } else if (popupItems.length > 1) {
                eXide.util.Popup.show(popupItems, function(selected) {
                    if (selected) {
                        apply(selected);
                    }
                });
            } else if (popupItems.length == 1) {
                apply(popupItems[0]);
            }
            return true;
        },

        getTemplates: function (doc, prefix, popupItems) {
            var templates = eXide.util.Snippets.getTemplates(doc, prefix);
            for (var i = 0; i < templates.length; i++) {
                var item = {
                    type: "template",
                    label: "[S] " + templates[i].name,
                    template: templates[i].template,
                    completion: templates[i].completion
                };
                popupItems.push(item);
            }
            return popupItems;
        }
    };

    return Constr;
}());
