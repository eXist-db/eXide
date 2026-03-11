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
        var tree = CM6.syntaxTree(this.editor.state);
        var state = this.editor.state;
        tree.iterate({
            enter: function(node) {
                var name = null, type = eXide.edit.Document.TYPE_FUNCTION, sig = null;
                if (node.name === "FunctionDeclaration") {
                    var vn = node.node.getChild("VariableDefinition");
                    if (vn) name = state.sliceDoc(vn.from, vn.to);
                    if (name) sig = state.sliceDoc(node.from, Math.min(node.to, node.from + 80)).split("{")[0].trim();
                } else if (node.name === "ClassDeclaration") {
                    var cn = node.node.getChild("VariableDefinition");
                    if (cn) name = state.sliceDoc(cn.from, cn.to);
                    if (name) sig = "class " + name;
                } else if (node.name === "MethodDeclaration") {
                    var pn = node.node.getChild("PropertyDefinition");
                    if (pn) name = state.sliceDoc(pn.from, pn.to);
                    if (name) sig = state.sliceDoc(node.from, Math.min(node.to, node.from + 80)).split("{")[0].trim();
                } else if (node.name === "VariableDeclaration") {
                    var child = node.node.firstChild;
                    var keyword = child ? state.sliceDoc(child.from, child.to) : "var";
                    child = child ? child.nextSibling : null;
                    while (child) {
                        if (child.name === "VariableDefinition") {
                            var vname = state.sliceDoc(child.from, child.to);
                            var nextSib = child.nextSibling;
                            if (nextSib && (nextSib.name === "ArrowFunction" || nextSib.name === "FunctionExpression")) {
                                name = vname;
                                sig = keyword + " " + vname + " = " + (nextSib.name === "ArrowFunction" ? "() => …" : "function(…)");
                            }
                        }
                        child = child.nextSibling;
                    }
                }
                if (name) {
                    var line = state.doc.lineAt(node.from);
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
        var self = this;
        var items = [];
        for (var i = 0; i < doc.functions.length; i++) {
            items.push({
                label: doc.functions[i].name,
                name: doc.functions[i].name,
                type: doc.functions[i].type,
                row: doc.functions[i].row
            });
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
