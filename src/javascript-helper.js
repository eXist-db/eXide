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
eXide.namespace("eXide.edit.JavascriptModeHelper");

/**
 * JavaScript specific helper methods.
 */
eXide.edit.JavascriptModeHelper = (function () {

    var RE_FUNC_NAME = /^[\$\w\-_]+/;

    Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("gotoDefinition", this.gotoDefinition);
        this.addCommand("locate", this.locate);
        this.addCommand("gotoSymbol", this.gotoSymbol);
        this.addCommand("format", this.format);
    }

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.createOutline = function(doc, onComplete) {
        // Use regex to find function definitions instead of TokenIterator
        var lines = doc.getText().split("\n");
        var funcRe = /(?:function\s+(\w+)|(\w+)\s*[:=]\s*function|(\w+)\s*\(.*\)\s*\{)/;
        for (var i = 0; i < lines.length; i++) {
            var match = funcRe.exec(lines[i]);
            if (match) {
                var name = match[1] || match[2] || match[3];
                if (name) {
                    doc.functions.push({
                        type: eXide.edit.Document.TYPE_FUNCTION,
                        name: name,
                        signature: name,
                        sort: name,
                        row: i,
                        column: 0
                    });
                }
            }
        }
        if (onComplete)
            onComplete(doc);
    };

    Constr.prototype.gotoSymbol = function(doc) {
        var self = this;
        var popupItems = [];
        for (var i = 0; i < doc.functions.length; i++) {
            item = {
                label: doc.functions[i].name,
                name: doc.functions[i].name,
                type: doc.functions[i].type,
                row: doc.functions[i].row
            };
            popupItems.push(item);
        };
        if (popupItems.length > 1) {
            var left = this.parent.getOffset().left;
            eXide.util.Popup.position({pageX: left, pageY: 20});
            eXide.util.Popup.show(popupItems, function (selected) {
                if (selected) {
                    self.parent.history.push(doc.getPath(), doc.getCurrentLine());
                    editorUtils.gotoLine(self.editor, selected.row + 1);
                }
                self.editor.focus();
            });
        }
    };

    Constr.prototype.gotoDefinition = function (doc) {
        var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        var funcName = this.getFunctionAtCursor(lead);
        if (funcName) {
            this.locate(doc, null, funcName);
        }
    };

    Constr.prototype.locate = function(doc, type, name) {
        if (typeof name == "number") {
            editorUtils.gotoLine(this.editor, name + 1);
        } else {
            var func = this.parent.outline.findDefinition(doc, name);
            if (func && func.row) {
                this.parent.history.push(doc.getPath(), doc.getCurrentLine());
                editorUtils.gotoLine(this.editor, func.row + 1);
            }
        }
    };

    Constr.prototype.getFunctionAtCursor = function (lead) {
        var row = lead.row;
        var lineNum = row + 1;
        var line = (lineNum >= 1 && lineNum <= this.editor.state.doc.lines) ? this.editor.state.doc.line(lineNum).text : "";
        var start = lead.column;
        do {
            start--;
        } while (start >= 0 && line.charAt(start).match(RE_FUNC_NAME));
        start++;
        var end = lead.column;
        while (end < line.length && line.charAt(end).match(RE_FUNC_NAME)) {
            end++;
        }
        return line.substring(start, end);
    };

    return Constr;
}());
