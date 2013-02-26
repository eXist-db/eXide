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
eXide.namespace("eXide.edit.XQueryUtils");

/**
 * XQuery specific helper methods.
 */
eXide.edit.XQueryUtils = (function () {
    
    return {
        findNode: function(ast, pos) {
//            if (ast.pos) {
//                $.log("Search %d:%d in range %d:%d - %d:%d %s", pos.line, pos.col, ast.pos.sl, 
//                    ast.pos.sc, ast.pos.el, ast.pos.ec, ast.name);
//            } else
//                return null;
            var p = ast.pos;
            if(eXide.edit.XQueryUtils.inRange(p, pos, false) === true) {
                for(var i in ast.children) {
                    var child = ast.children[i];
                    var n = eXide.edit.XQueryUtils.findNode(child, pos);
                    if(n !== null)
                    return n;
                }
                return ast;
            } else {
                return null;
            }
        },
    
        findNodeForRange: function(ast, start, end) {
            var p = ast.pos;
            if(eXide.edit.XQueryUtils.inRange(p, start) === true && eXide.edit.XQueryUtils.inRange(p, end) === true) {
                for(var i in ast.children) {
                    var child = ast.children[i];
                    var n = eXide.edit.XQueryUtils.findNode(child, start, end);
                    if(n !== null) return n;
                }
                return ast;
            } else {
                return null;
            }
        },
        
        inRange: function(p, pos, exclusive) {
            if(p && p.sl <= pos.line && pos.line <= p.el) {
                if(p.sl < pos.line && pos.line < p.el)
                    return true;
                else if(p.sl == pos.line && pos.line < p.el)
                    return p.sc <= pos.col;
                else if(p.sl == pos.line && p.el === pos.line)
                    return p.sc <= pos.col && pos.col <= p.ec + (exclusive ? 1 : 0);
                else if(p.sl < pos.line && p.el === pos.line)
                    return pos.col <= p.ec + (exclusive ? 1 : 0);
            }
        },
        
        samePosition: function(pos1, pos2) {
            return pos1.sl == pos2.sl &&
                pos1.sc == pos2.sc &&
                pos1.el == pos2.el &&
                pos1.ec == pos2.ec;
        },
        
        findNext: function(node, type) {
            var children = node.getParent.children;
            for (var i = 0; i < children.length; i++) {
                if (children[i] == node) {
                    for (var j = i; j < children.length; j++) {
                        if (children[j].name == type) {
                            return children[j];
                        }
                    }
                }
            }
            return null;
        },
        
        findSibling: function(node, type) {
            var children = node.getParent.children;
            for (var i = 0; i < children.length; i++) {
                if (children[i].name == type) {
                    return children[i];
                }
            }
            return null;
        },
        
        findAncestor: function(node, type) {
            if (type instanceof Array) {
                while (node !== null) {
                    if ($.inArray(node.name, type) > -1) {
                        return node;
                    }
                    node = node.getParent;
                }
            } else {
                while (node !== null) {
                    if (node.name == type) {
                        return node;
                    }
                    node = node.getParent;
                }
            }
            return null;
        },
        
        findVariableContext: function(node, varName) {
            var parent = node.getParent;
            while (parent !== null) {
                if ((parent.name === "FLWORExpr" || parent.name === "FunctionDecl") &&
                    eXide.edit.XQueryUtils.findVarDecl(parent, varName) !== null) {
                    return parent;
                }
                if (parent.name === "FunctionDecl") {
                    return null;
                }
                parent = parent.getParent;
            }
            return null;
        },
        
        getValue: function(node) {
            var val = "";
            if (node.value) {
                val = node.value;
            } else {
                for (var i = 0; i < node.children.length; i++) {
                    val += eXide.edit.XQueryUtils.getValue(node.children[i]);
                }
            }
            return val;
        },
        
        findVarDecl: function(node, name) {
            var refs = new eXide.edit.VariableReferences(name, node).getReferences();
            for (var i = 0; i < refs.length; i++) {
                if (refs[i].getParent && (refs[i].getParent.name === "LetBinding") || 
                    refs[i].getParent.name === "Param") {
                    return refs[i];
                }
            }
            return null;
        }
    };
}());

eXide.namespace("eXide.edit.VariableReferences");

/**
 * XQuery specific helper methods.
 */
eXide.edit.VariableReferences = (function () {
    
    var Range = require("ace/range").Range;
    
    Constr = function(variable, ast) {
        this.variable = variable;
        this.references = [];
        this.visit(ast);
    };
    
    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);
    
    Constr.prototype.VarName = function(node) {
        var name = eXide.edit.XQueryUtils.getValue(node);
        if (name == this.variable) {
            this.references.push(node);
        }
    };
    
    Constr.prototype.Param = function(node) {
        for (var i = 0; i < node.children.length; i++) {
            if (node.children[i].value === this.variable) {
                this.references.push(node.children[i]);
            }
        }
    };
    
    Constr.prototype.getReferences = function() {
        return this.references;
    };
    
    return Constr;
}());