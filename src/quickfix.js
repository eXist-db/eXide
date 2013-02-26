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
    
    var quickFixes = [
        {
            regex: /Call to undeclared function/,
            getResolutions: function(editor, doc, annotation, ast) {
                var matches = /undeclared function:\s+([\w\d\-_]+:[\w\d\-_]+)$/.exec(annotation.text);
                if (matches.length === 2) {
                    var prefix = matches[1].split(":")[0];
                    return [
                        {
                            action: "Create function \"" + matches[1] + "\"",
                            resolve: function(editor, doc, annotation) {
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.addFunction(matches[1]);
                            }
                        },
                        {
                            action: "Import module \"" + prefix + "\"",
                            resolve: function(editor, doc, annotation) {
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
            getResolutions: function(editor, doc, annotation, ast) {
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
            getResolutions: function(editor, doc, annotation, ast) {
                var matches = /for prefix (\w+)$/.exec(annotation.text);
                if (matches.length === 2) {
                    if (ast && ast.getParent.name === "FunctionCall") {
                        return [{
                            resolve: function(editor, doc, annotation) {
                                doc.getModeHelper().afterValidate(editor, editor.autocomplete);
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.importModule(matches[1]);
                            },
                            action: "Import module \"" + matches[1] + "\""
                        }];
                    } else if (ast && ast.name === "EQName") {
                        return [{
                            resolve: function(editor, doc, annotation) {
                                doc.getModeHelper().afterValidate(editor, editor.autocomplete);
                                var adder = new eXide.edit.PrologAdder(editor, doc);
                                adder.declareNamespace(matches[1]);
                            },
                            action: "Declare namespace \"" + matches[1] + "\""
                        }];
                    }
                }
            }
        }
    ];
    
    var Compiler = require("lib/Compiler").Compiler;
    var Range = require("ace/range").Range;
    
    function unusedNamespaceFix(editor, doc, annotation) {
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
    
    function getResolutions(editor, doc, annotation) {
        var resolutions = [];
        for (var i = 0; i < quickFixes.length; i++) {
            if (quickFixes[i].regex.test(annotation.text)) {
                var ast = eXide.edit.XQueryUtils.findNode(doc.ast, {line: annotation.row, col: annotation.column + 1});
                var fixes = quickFixes[i].getResolutions(editor, doc, annotation, ast);
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
    
    Constr.prototype.addFunction = function(name) {
        var row = 0;
        if (this.prolog.children.length > 0) {
            row = this.prolog.pos.el;
        } else if (this.decl) {
            row = this.decl.pos.el;
        }
        
        this.editor.editor.gotoLine(row + 1);
        this.editor.editor.navigateLineEnd();
        this.editor.editor.insert("\n\n");
        this.editor.editor.gotoLine(row + 3, 0);
        
        var templates = this.editor.outline.getTemplates("fun");
        if (templates.length > 0) {
            var subst = templates[0].template.replace("␣", name);
            this.doc.template = new eXide.edit.Template(this.editor, null, subst, "template");
			this.doc.template.insert();
        }
    };
    
    Constr.prototype.importModule = function(name) {
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
        
        var template = "import module namespace " + prefix + "=\"␣\";";
        this.doc.template = new eXide.edit.Template(this.editor, null, template, "template");
        this.doc.template.insert();
    };
    
    Constr.prototype.declareNamespace = function(prefix) {
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
        
        var template = "declare namespace " + prefix + "=\"␣\";";
        this.doc.template = new eXide.edit.Template(this.editor, null, template, "template");
        this.doc.template.insert();
    };
    
    return Constr;
}());