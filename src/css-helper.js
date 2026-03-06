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
eXide.namespace("eXide.edit.CssModeHelper");

/**
 * CSS specific helper methods.
 */
eXide.edit.CssModeHelper = (function () {

    Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
        this.addCommand("gotoSymbol", this.gotoSymbol);
        this.addCommand("format", this.format);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.createOutline = function(doc, onComplete) {
        // Use regex-based approach instead of TokenIterator
        var lines = doc.getText().split("\n");
        var selectorParts = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var braceIdx = line.indexOf("{");
            if (braceIdx >= 0) {
                // Everything before the brace on this line is part of the selector
                var part = line.substring(0, braceIdx).trim();
                if (part) selectorParts.push(part);
                var selector = selectorParts.join(" ").trim();
                if (selector) {
                    doc.functions.push({
                        type: eXide.edit.Document.TYPE_FUNCTION,
                        name: selector,
                        source: doc.getPath(),
                        signature: selector,
                        sort: selector,
                        row: i,
                        column: braceIdx
                    });
                }
                selectorParts = [];
            } else if (line.indexOf("}") >= 0) {
                selectorParts = [];
            } else {
                var trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
                    selectorParts.push(trimmed);
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
            if (doc.functions[i].name !== "") {
                item = {
                    label: doc.functions[i].name,
                    name: doc.functions[i].name,
                    type: doc.functions[i].type,
                    row: doc.functions[i].row
                };
                popupItems.push(item);
            }
        };
        if (popupItems.length > 1) {
            var left = this.parent.getOffset().left;
            eXide.util.Popup.position({pageX: left, pageY: 40});
            eXide.util.Popup.show(popupItems, function (selected) {
                if (selected) {
                    self.parent.history.push(doc.getPath(), doc.getCurrentLine());
                    editorUtils.gotoLine(self.editor, selected.row + 1);
                }
            });
        }
    };

    return Constr;
}());
