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
eXide.namespace("eXide.edit.XQueryQuickFix");

/**
 * XQuery specific helper methods.
 */
eXide.edit.XQueryQuickFix = (function () {

    const quickFixes = [
        {
            regex: /Call to undeclared function/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                const matches = /undeclared function:\s+([\w\d\-_]+:[\w\d\-_]+)$/.exec(annotation.text);
                if (matches.length === 2) {
                    const prefix = matches[1].split(":")[0];
                    return [
                        {
                            action: "Create function \"" + matches[1] + "\"",
                            resolve: function(helper, editor, doc, annotation) {
                                const adder = new eXide.edit.PrologAdder(editor, doc);
                                const params = new eXide.edit.FunctionParameters(ast.getParent).getParameters();
                                adder.addFunction(matches[1], params);
                            }
                        },
                        {
                            action: "Import module \"" + prefix + "\"",
                            resolve: function(helper, editor, doc, annotation) {
                                const adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.importModule(prefix);
                            }
                        }
                    ];
                }
                return null;
            },
        },
        {
            regex: /unused namespace prefix/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                let action = "Remove namespace declaration";
                if (eXide.edit.XQueryUtils.findAncestor(ast, "ModuleImport")) {
                    action = "Remove module import";
                }
                return [
                    {
                        resolve: unusedNamespaceFix,
                        action: action
                    }
                ];
            }
        },
        {
            regex: /No namespace defined|XPST0081/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                const matches = /for prefix (\w+)/.exec(annotation.text) ||
                              /\[XPST0081\] "(\w+)"/.exec(annotation.text);
                if (matches && matches.length === 2) {
                    if (ast && ast.getParent.name === "FunctionCall") {
                        return [{
                            resolve: function(helper, editor, doc, annotation) {
                                const prefix = matches[1];
                                helper.parent.validator.setEnabled(false);

                                function doImport(mod) {
                                    const adder = new eXide.edit.PrologAdder(editor, doc);
                                    if (mod) {
                                        let at = mod.at;
                                        if (at && at.indexOf("java:") === 0) at = null;
                                        adder.importModule(prefix, mod.uri, at);
                                    } else {
                                        adder.importModule(prefix);
                                    }
                                    helper.parseXQuery(doc);
                                    helper.parent.validator.setEnabled(true);
                                }

                                const mod = staticAnalysis.getModuleByPrefix(prefix);
                                if (mod) {
                                    doImport(mod);
                                } else {
                                    eXide.app.refreshModuleCache().then(function () {
                                        doImport(staticAnalysis.getModuleByPrefix(prefix));
                                    });
                                }
                            },
                            action: "Import module \"" + matches[1] + "\""
                        }];
                    } else if (ast && (ast.name === "EQName" || ast.getParent.name === "ElementTest"
                        || ast.getParent.name === "OptionDecl")) {
                        return [{
                            resolve: function(helper, editor, doc, annotation) {
                                helper.parent.validator.setEnabled(false);
                                const adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.declareNamespace(matches[1]);
                                helper.parseXQuery(doc);
                                helper.parent.validator.setEnabled(true);
                            },
                            action: "Declare namespace \"" + matches[1] + "\""
                        }];
                    }
                }
            }
        },
        {
            regex: /variable.*not set|undeclared variable/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                if (ast.getParent.name === "VarName") {
                    return [
                        {
                            resolve: function(helper, editor, doc, annotation) {
                                const adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.declareVariable(ast.value);
                            },
                            action: "Declare global variable \"" + ast.value + "\""
                        },
                        {
                            resolve: function(helper, editor, doc, annotation) {
                                let template;
                                let contextNode = eXide.edit.XQueryUtils.findAncestor(ast, ["IntermediateClause", "InitialClause", "ReturnClause"]);
                                if (contextNode) {
                                    template = "let \\$" + ast.value + " := ${1:()}";
                                } else {
                                    contextNode = eXide.edit.XQueryUtils.findAncestor(ast, "StatementsAndOptionalExpr");
                                    contextNode = eXide.edit.XQueryUtils.findChild(contextNode, "Expr");
                                    if (!contextNode) {
                                        eXide.util.error("Extract variable: unable to determine context. Giving up.")
                                        return;
                                    }
                                    template = "let \\$" + ast.value + " := ${1:()}" + "\nreturn";
                                }
                                helper.parent.validator.setEnabled(false);
                                console.log("extract variable: context: %o", contextNode);
                                const view = editor.editor;
                                editorUtils.gotoLine(view, contextNode.pos.sl + 1, contextNode.pos.sc);
                                const pos = view.state.selection.main.head;
                                view.dispatch({ changes: { from: pos, insert: "\n" }, selection: { anchor: pos + 1 } });
                                editorUtils.gotoLine(view, contextNode.pos.sl + 1, contextNode.pos.sc);
                                editorUtils.insertSnippet(view, template);
                                view.focus();
                                helper.parent.validator.setEnabled(true);
                            },
                            action: "Create let statement"
                        }
                    ];
                }
            }
        }
    ];


    function unusedNamespaceFix(helper, editor, doc, annotation) {
        const nsNode = eXide.edit.XQueryUtils.findNode(doc.ast, {line: annotation.row, col: annotation.column + 1});
        const nsDecl = nsNode.getParent;
        const separator = eXide.edit.XQueryUtils.findNext(nsDecl, "Separator");

        const pos = {
            sl: annotation.pos.sl,
            sc: annotation.pos.sc,
            el: separator ? separator.pos.el : annotation.pos.el,
            ec: separator ? separator.pos.ec : annotation.pos.ec
        };
        const view = editor.editor;
        const lineNum = pos.el + 1;
        const lastLine = (lineNum >= 1 && lineNum <= view.state.doc.lines) ? view.state.doc.line(lineNum).text : "";
        let from, to;
        if (pos.ec === lastLine.length) {
            from = editorUtils.rowColToOffset(view.state, pos.sl, pos.sc);
            to = editorUtils.rowColToOffset(view.state, pos.el + 1, 0);
        } else {
            from = editorUtils.rowColToOffset(view.state, pos.sl, pos.sc);
            to = editorUtils.rowColToOffset(view.state, pos.el, pos.ec);
        }

        view.dispatch({ changes: { from: from, to: to } });
    }

    function getResolutions(helper, editor, doc, annotation) {
        const resolutions = [];
        for (let i = 0; i < quickFixes.length; i++) {
            if (quickFixes[i].regex.test(annotation.text)) {
                const ast = eXide.edit.XQueryUtils.findNode(doc.ast, {line: annotation.row, col: annotation.column + 1});
                const fixes = quickFixes[i].getResolutions(helper, editor, doc, annotation, ast);
                if (fixes != null) {
                    for (let j = 0; j < fixes.length; j++) {
                        resolutions.push(fixes[j]);
                    }
                }
            }
        }
        return resolutions;
    }

    return {
        "getResolutions": getResolutions
    };
}());

eXide.namespace("eXide.edit.PrologAdder");

/**
 * XQuery specific helper methods.
 */
eXide.edit.PrologAdder = (function () {

    /**
     * Navigate to end of a row, insert two newlines, then position cursor
     * on the new blank line. Used by prepareFunction, importModule,
     * declareNamespace, and declareVariable.
     *
     * @param {EditorView} view - CM6 editor view
     * @param {number} row - 0-indexed row number
     * @returns {number} the 1-indexed line number of the new insertion point
     */
    function insertBlankLinesAfterRow(view, row) {
        editorUtils.gotoLine(view, row + 1);
        const lineNum = row + 1;
        const line = (lineNum >= 1 && lineNum <= view.state.doc.lines) ? view.state.doc.line(lineNum).text : "";
        const offset = editorUtils.rowColToOffset(view.state, row, line.length);
        view.dispatch({ selection: { anchor: offset } });
        const pos = view.state.selection.main.head;
        view.dispatch({ changes: { from: pos, insert: "\n\n" }, selection: { anchor: pos + 2 } });
        editorUtils.gotoLine(view, row + 3, 0);
        return row + 3;
    }

    const Constr = function(editor, doc) {
        this.editor = editor;
        this.doc = doc;
        this.prolog = null;
        this.program = null;

        this.visit(doc.ast);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);

    Constr.prototype.Prolog = function(prolog) {
        this.prolog = prolog;
    };

    Constr.prototype.VersionDecl = function(decl) {
        this.decl = decl;
    };

    Constr.prototype.getInsertionPoint = function(func) {
        let row = 0;
        if (func) {
            func = eXide.edit.XQueryUtils.findAncestor(func, "FunctionDecl");
            if (func) {
                row = func.pos.el;
            }
        } else {
            if (this.prolog.children.length > 0) {
                row = this.prolog.pos.el;
            } else if (this.decl) {
                row = this.decl.pos.el;
            }
        }
        return row;
    };

    Constr.prototype.addFunction = function(name, params) {
        this.prepareFunction();
        let template = "declare function " + name + "(";
        if (params) {
            for (let i = 0; i < params.length; i++) {
                if (i > 0) {
                    template += ", ";
                }
                template += "$${" + (i + 1) + ":" + params[i] + "}";
            }
        }
        template += ") {\n\t${" + (arguments.length + 1) + ":()}\n};";
        editorUtils.insertSnippet(this.editor.editor, template);
    };

    Constr.prototype.createFunction = function(params, code, insertRow) {
        const row = this.prepareFunction(insertRow);
        const view = this.editor.editor;

        let fn = "declare function (";
        for (let i = 0; i < params.length; i++) {
            if (i > 0) {
                fn += ", ";
            }
            fn += "$" + params[i];
        }
        fn += ") {\n\t" + code + "\n};";

        const pos = view.state.selection.main.head;
        view.dispatch({ changes: { from: pos, insert: fn }, selection: { anchor: pos + fn.length } });
        editorUtils.gotoLine(view, row, 17);
    };

    Constr.prototype.prepareFunction = function(insertRow) {
        const row = insertRow || this.getInsertionPoint();
        return insertBlankLinesAfterRow(this.editor.editor, row);
    };

    Constr.prototype.importModule = function(name, namespace, location) {
        const prefix = name.indexOf(":") > -1 ? name.substring(0, name.indexOf(":")) : name;
        let row = 0;
        if (this.decl) {
            row = this.decl.pos.el;
        }
        for (let i = 0; i < this.prolog.children.length; i++) {
            if (this.prolog.children[i].name === "Import") {
                row = this.prolog.children[i].pos.sl - 1;
                break;
            }
        }
        row = row < 0 ? 0 : row;

        insertBlankLinesAfterRow(this.editor.editor, row);

        let template;
        if (namespace) {
            template = "import module namespace " + prefix + "=\"" + namespace + "\"";
            if (location) {
                template += " at \"" + location + "\";";
            } else {
                template += ";"
            }
        } else {
            template = "import module namespace " + prefix + "=\"${1}\";";
        }
        editorUtils.insertSnippet(this.editor.editor, template);
        editorUtils.gotoLine(this.editor.editor, row + 3, 26 + prefix.length);
    };

    Constr.prototype.declareNamespace = function(prefix) {
        let row = 0;
        if (this.decl) {
            row = this.decl.pos.el;
        }
        for (let i = 0; i < this.prolog.children.length; i++) {
            if (this.prolog.children[i].name === "NamespaceDecl") {
                row = this.prolog.children[i].pos.sl - 1;
                break;
            }
        }
        row = row < 0 ? 0 : row;

        insertBlankLinesAfterRow(this.editor.editor, row);

        const template = "declare namespace " + prefix + "=\"${1}\";";
        editorUtils.insertSnippet(this.editor.editor, template);
    };

    Constr.prototype.declareVariable = function(name) {
        console.log("prolog: %o", this.prolog);
        let row = -1;
        for (let i = 0; i < this.prolog.children.length; i++) {
            if (this.prolog.children[i].name === "AnnotatedDecl") {
                row = this.prolog.children[i].pos.sl - 1;
                break;
            }
        }
        if (row < 0) {
            if (this.prolog.children.length > 0) {
                row = this.prolog.children[this.prolog.children.length - 1].pos.el;
            } else if (this.decl) {
                row = this.decl.pos.el;
            } else {
                row = 0;
            }
        }

        console.log("Inserting at %d", row);

        insertBlankLinesAfterRow(this.editor.editor, row);

        const template = "declare variable \\$" + name + " := ${1:expression};";
        editorUtils.insertSnippet(this.editor.editor, template);
    };

    return Constr;
}());