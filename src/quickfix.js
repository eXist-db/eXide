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
    
    var SnippetManager = require("ace/snippets").snippetManager;
    
    var quickFixes = [
        {
            regex: /Call to undeclared function/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                var matches = /undeclared function:\s+([\w\d\-_]+:[\w\d\-_]+)$/.exec(annotation.text);
                if (matches.length === 2) {
                    var prefix = matches[1].split(":")[0];
                    return [
                        {
                            action: "Create function \"" + matches[1] + "\"",
                            resolve: function(helper, editor, doc, annotation) {
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                var params = new eXide.edit.FunctionParameters(ast.getParent).getParameters();
                                adder.addFunction(matches[1], params);
                            }
                        },
                        {
                            action: "Import module \"" + prefix + "\"",
                            resolve: function(helper, editor, doc, annotation) {
                                var adder = new eXide.edit.PrologAdder(editor, doc);
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
                var action = "Remove namespace declaration";
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
            regex: /No namespace defined/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                var matches = /for prefix (\w+)/.exec(annotation.text);
                if (matches.length === 2) {
                    if (ast && ast.getParent.name === "FunctionCall") {
                        return [{
                            resolve: function(helper, editor, doc, annotation) {
                                helper.parent.validator.setEnabled(false);
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.importModule(matches[1]);
                                helper.xqlint(doc);
                                helper.autocomplete(doc);
                                helper.parent.validator.setEnabled(true);
                            },
                            action: "Import module \"" + matches[1] + "\""
                        }];
                    } else if (ast && (ast.name === "EQName" || ast.getParent.name === "ElementTest" 
                        || ast.getParent.name === "OptionDecl")) {
                        return [{
                            resolve: function(helper, editor, doc, annotation) {
                                helper.parent.validator.setEnabled(false);
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.declareNamespace(matches[1]);
                                helper.xqlint(doc);
                                helper.autocomplete(doc);
                                helper.parent.validator.setEnabled(true);
                            },
                            action: "Declare namespace \"" + matches[1] + "\""
                        }];
                    }
                }
            }
        },
        {
            regex: /variable.*not set/,
            getResolutions: function(helper, editor, doc, annotation, ast) {
                if (ast.getParent.name === "VarName") {
                    return [
                        {
                            resolve: function(helper, editor, doc, annotation) {
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.declareVariable(ast.value);
                            },
                            action: "Declare global variable \"" + ast.value + "\""
                        },
                        {
                            resolve: function(helper, editor, doc, annotation) {
                                var template;
                                var contextNode = eXide.edit.XQueryUtils.findAncestor(ast, ["IntermediateClause", "InitialClause", "ReturnClause"]);
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
                                $.log("extract variable: context: %o", contextNode);
                                editor.editor.gotoLine(contextNode.pos.sl + 1, contextNode.pos.sc);
                                editor.editor.insert("\n");
                                editor.editor.gotoLine(contextNode.pos.sl + 1, contextNode.pos.sc);
                                SnippetManager.insertSnippet(editor.editor, template);
                                editor.editor.focus();
                                helper.parent.validator.setEnabled(true);
                            },
                            action: "Create let statement"
                        }
                    ];
                }
            }
        }
    ];
    
    var Compiler = require("lib/Compiler").Compiler;
    var Range = require("ace/range").Range;
    
    function unusedNamespaceFix(helper, editor, doc, annotation) {
        var nsNode = eXide.edit.XQueryUtils.findNode(doc.ast, {line: annotation.row, col: annotation.column + 1});
        var nsDecl = nsNode.getParent;
        var separator = eXide.edit.XQueryUtils.findNext(nsDecl, "Separator");
        
        var pos = {
            sl: annotation.pos.sl,
            sc: annotation.pos.sc,
            el: separator ? separator.pos.el : annotation.pos.el,
            ec: separator ? separator.pos.ec : annotation.pos.ec
        };
        var range;
        var lastLine = editor.editor.getSession().getLine(pos.el);
        if (pos.ec == lastLine.length) {
            range = new Range(pos.sl, pos.sc, pos.el + 1, 0);
        } else {
            range = new Range(pos.sl, pos.sc, pos.el, pos.ec);
        }
        
        editor.editor.getSession().remove(range);
    }
    
    function getResolutions(helper, editor, doc, annotation) {
        var resolutions = [];
        for (var i = 0; i < quickFixes.length; i++) {
            if (quickFixes[i].regex.test(annotation.text)) {
                var ast = eXide.edit.XQueryUtils.findNode(doc.ast, {line: annotation.row, col: annotation.column + 1});
                var fixes = quickFixes[i].getResolutions(helper, editor, doc, annotation, ast);
                if (fixes != null) {
                    for (var j = 0; j < fixes.length; j++) {
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
    
    var Range = require("ace/range").Range;
    var SnippetManager = require("ace/snippets").snippetManager;
    
    Constr = function(editor, doc) {
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
        var row = 0;
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
        var template = "declare function " + name + "(";
        if (params) {
            for (var i = 0; i < params.length; i++) {
                if (i > 0) {
                    template += ", ";
                }
                template += "$${" + (i + 1) + ":" + params[i] + "}";
            }
        }
        template += ") {\n\t${" + (arguments.length + 1) + ":()}\n};";
        SnippetManager.insertSnippet(this.editor.editor, template);
    };
    
    Constr.prototype.createFunction = function(params, code, insertRow) {
        var row = this.prepareFunction(insertRow);

        var fn = "declare function (";
        for (var i = 0; i < params.length; i++) {
            if (i > 0) {
                fn += ", ";
            }
            fn += "$" + params[i];
        }
        fn += ") {\n\t" + code + "\n};";
        
        this.editor.editor.insert(fn);
        this.editor.editor.gotoLine(row, 17);
    };

    Constr.prototype.prepareFunction = function(insertRow) {
        var row = insertRow || this.getInsertionPoint();

        this.editor.editor.gotoLine(row + 1);
        this.editor.editor.navigateLineEnd();
        this.editor.editor.insert("\n\n");
        this.editor.editor.gotoLine(row + 3, 0);

        return row + 3;
    };
    
    Constr.prototype.importModule = function(name, namespace, location) {
        var prefix = name.indexOf(":") > -1 ? name.substring(0, name.indexOf(":")) : name;
        var row = 0;
        if (this.decl) {
            row = this.decl.pos.el;
        }
        for (var i = 0; i < this.prolog.children.length; i++) {
            if (this.prolog.children[i].name === "Import") {
                row = this.prolog.children[i].pos.sl - 1;
                break;
            }
        }
        row = row < 0 ? 0 : row;
        
        this.editor.editor.gotoLine(row + 1);
        this.editor.editor.navigateLineEnd();
        this.editor.editor.insert("\n\n");
        this.editor.editor.gotoLine(row + 3, 0);
        
        var template;
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
        SnippetManager.insertSnippet(this.editor.editor, template);
        this.editor.editor.gotoLine(row + 3, 26 + prefix.length);
    };
    
    Constr.prototype.declareNamespace = function(prefix) {
        var row = 0;
        if (this.decl) {
            row = this.decl.pos.el;
        }
        for (var i = 0; i < this.prolog.children.length; i++) {
            if (this.prolog.children[i].name === "NamespaceDecl") {
                row = this.prolog.children[i].pos.sl - 1;
                break;
            }
        }
        row = row < 0 ? 0 : row;
        
        this.editor.editor.gotoLine(row + 1);
        this.editor.editor.navigateLineEnd();
        this.editor.editor.insert("\n\n");
        this.editor.editor.gotoLine(row + 3, 0);
        
        var template = "declare namespace " + prefix + "=\"${1}\";";
        SnippetManager.insertSnippet(this.editor.editor, template);
    };
    
    Constr.prototype.declareVariable = function(name) {
        $.log("prolog: %o", this.prolog);
        var row = -1;
        for (var i = 0; i < this.prolog.children.length; i++) {
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
        
        $.log("Inserting at %d", row);
        
        this.editor.editor.gotoLine(row + 1);
        this.editor.editor.navigateLineEnd();
        this.editor.editor.insert("\n\n");
        this.editor.editor.gotoLine(row + 3, 0);
        
        var template = "declare variable \\$" + name + " := ${1:expression};";
        SnippetManager.insertSnippet(this.editor.editor, template);
    };
    
    return Constr;
}());