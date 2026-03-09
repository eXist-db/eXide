/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2024 Wolfgang Meier
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
eXide.namespace("eXide.edit.JsonModeHelper");

/**
 * JSON specific helper methods.
 */
eXide.edit.JsonModeHelper = (function () {

    Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
        this.addCommand("format", this.format);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.createOutline = function(doc, onComplete) {
        var tree = CM6.syntaxTree(this.editor.state);
        var state = this.editor.state;
        var depth = 0;
        tree.iterate({
            enter: function(node) {
                if (node.name === "Property") {
                    var nameNode = node.node.getChild("PropertyName");
                    if (nameNode && depth < 3) {
                        var name = state.sliceDoc(nameNode.from, nameNode.to);
                        if (name.charAt(0) === '"') name = name.slice(1, -1);
                        var line = state.doc.lineAt(node.from);
                        var valNode = nameNode.nextSibling;
                        var valType = valNode ? valNode.name : "";
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
                            name: name,
                            indent: depth,
                            source: doc.getPath(),
                            signature: name + ": " + valType.toLowerCase(),
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    depth++;
                    return true;
                }
            },
            leave: function(node) {
                if (node.name === "Property") {
                    depth--;
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    };

    return Constr;
}());
