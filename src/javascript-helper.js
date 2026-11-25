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

    const RE_FUNC_NAME = /^[\$\w\-_]+/;

    const Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("gotoDefinition", this.gotoDefinition);
        this.addCommand("locate", this.locate);
        this.addCommand("gotoSymbol", this.gotoSymbol);
        this.addCommand("format", this.format);
    }

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.createOutline = function(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        tree.iterate({
            enter: function(node) {
                const type = eXide.edit.Document.TYPE_FUNCTION;
                let name = null, sig = null;
                if (node.name === "FunctionDeclaration") {
                    const vn = node.node.getChild("VariableDefinition");
                    if (vn) name = state.sliceDoc(vn.from, vn.to);
                    if (name) sig = state.sliceDoc(node.from, Math.min(node.to, node.from + 80)).split("{")[0].trim();
                } else if (node.name === "ClassDeclaration") {
                    const cn = node.node.getChild("VariableDefinition");
                    if (cn) name = state.sliceDoc(cn.from, cn.to);
                    if (name) sig = "class " + name;
                } else if (node.name === "MethodDeclaration") {
                    const pn = node.node.getChild("PropertyDefinition");
                    if (pn) name = state.sliceDoc(pn.from, pn.to);
                    if (name) sig = state.sliceDoc(node.from, Math.min(node.to, node.from + 80)).split("{")[0].trim();
                } else if (node.name === "VariableDeclaration") {
                    let child = node.node.firstChild;
                    const keyword = child ? state.sliceDoc(child.from, child.to) : "var";
                    child = child ? child.nextSibling : null;
                    while (child) {
                        if (child.name === "VariableDefinition") {
                            const vname = state.sliceDoc(child.from, child.to);
                            const nextSib = child.nextSibling;
                            if (nextSib && (nextSib.name === "ArrowFunction" || nextSib.name === "FunctionExpression")) {
                                name = vname;
                                sig = keyword + " " + vname + " = " + (nextSib.name === "ArrowFunction" ? "() => …" : "function(…)");
                            }
                        }
                        child = child.nextSibling;
                    }
                }
                if (name) {
                    const line = state.doc.lineAt(node.from);
                    doc.functions.push({
                        type: type,
                        name: name,
                        signature: sig || name,
                        sort: name,
                        row: line.number - 1,
                        from: node.from,
                        to: node.to
                    });
                    if (node.name === "ClassDeclaration") return true;
                    return false;
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    };

    Constr.prototype.gotoSymbol = function(doc) {
        const self = this;
        // Ensure outline is populated
        if (!doc.functions || doc.functions.length === 0) {
            doc.functions = [];
            this.createOutline(doc, function() {
                self._showSymbolPicker(doc);
            });
        } else {
            this._showSymbolPicker(doc);
        }
    };

    Constr.prototype._showSymbolPicker = function(doc) {
        const self = this;
        if (!doc.functions || doc.functions.length === 0) {
            eXide.util.message("No symbols found.");
            return;
        }
        const items = doc.functions.map(function(f) {
            return {
                label: f.signature || f.name,
                name: f.name,
                row: f.row,
                from: f.from
            };
        });
        eXide.util.QuickPicker.show(items, function (selected) {
            if (selected) {
                self.parent.history.push(doc.getPath(), doc.getCurrentLine());
                if (selected.from !== undefined) {
                    self.editor.dispatch({ selection: { anchor: selected.from } });
                    self.editor.dispatch({
                        effects: CM6.EditorView.scrollIntoView(selected.from, { y: "center" })
                    });
                    editorUtils.flashLine(self.editor, selected.from);
                    self.editor.focus();
                } else {
                    editorUtils.gotoLine(self.editor, selected.row + 1);
                }
            }
        }, { placeholder: "Go to symbol\u2026", parentEditor: self.editor });
    };

    Constr.prototype.gotoDefinition = function (doc) {
        const lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        const funcName = this.getFunctionAtCursor(lead);
        if (funcName) {
            this.locate(doc, null, funcName);
        }
    };

    Constr.prototype.locate = function(doc, type, name) {
        if (typeof name === "number") {
            editorUtils.gotoLine(this.editor, name + 1);
        } else {
            const func = this.parent.outline.findDefinition(doc, name);
            if (func && func.row) {
                this.parent.history.push(doc.getPath(), doc.getCurrentLine());
                editorUtils.gotoLine(this.editor, func.row + 1);
            }
        }
    };

    Constr.prototype.getFunctionAtCursor = function (lead) {
        const row = lead.row;
        const lineNum = row + 1;
        const line = (lineNum >= 1 && lineNum <= this.editor.state.doc.lines) ? this.editor.state.doc.line(lineNum).text : "";
        let start = lead.column;
        do {
            start--;
        } while (start >= 0 && line.charAt(start).match(RE_FUNC_NAME));
        start++;
        let end = lead.column;
        while (end < line.length && line.charAt(end).match(RE_FUNC_NAME)) {
            end++;
        }
        return line.substring(start, end);
    };

    return Constr;
}());
