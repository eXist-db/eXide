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

    const Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
        this.addCommand("gotoSymbol", this.gotoSymbol);
        this.addCommand("format", this.format);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.createOutline = function(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        tree.iterate({
            enter: function(node) {
                if (node.name === "RuleSet") {
                    let blockStart = node.to;
                    let child = node.node.firstChild;
                    while (child) {
                        if (child.name === "Block") { blockStart = child.from; break; }
                        child = child.nextSibling;
                    }
                    const selector = state.sliceDoc(node.from, blockStart).trim();
                    if (selector) {
                        const line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
                            name: selector,
                            source: doc.getPath(),
                            signature: selector,
                            sort: selector,
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    return false;
                }
                if (node.name === "MediaStatement" || node.name === "KeyframesStatement") {
                    let text = state.sliceDoc(node.from, node.to);
                    const braceIdx = text.indexOf("{");
                    if (braceIdx >= 0) text = text.substring(0, braceIdx).trim();
                    if (text.length > 60) text = text.substring(0, 60) + "…";
                    const line = state.doc.lineAt(node.from);
                    doc.functions.push({
                        type: eXide.edit.Document.TYPE_FUNCTION,
                        name: text,
                        source: doc.getPath(),
                        signature: text,
                        sort: text,
                        row: line.number - 1,
                        from: node.from,
                        to: node.to
                    });
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    };

    Constr.prototype.gotoSymbol = function(doc) {
        const self = this;
        const items = [];
        for (let i = 0; i < doc.functions.length; i++) {
            if (doc.functions[i].name !== "") {
                items.push({
                    label: doc.functions[i].name,
                    name: doc.functions[i].name,
                    type: doc.functions[i].type,
                    row: doc.functions[i].row
                });
            }
        }
        if (items.length > 0) {
            eXide.util.QuickPicker.show(items, function (selected) {
                if (selected) {
                    self.parent.history.push(doc.getPath(), doc.getCurrentLine());
                    editorUtils.gotoLine(self.editor, selected.row + 1);
                }
            }, { placeholder: "Go to symbol\u2026", parentEditor: self.editor });
        }
    };

    return Constr;
}());
