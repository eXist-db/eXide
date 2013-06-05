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
                    for (var j = i + 1; j < children.length; j++) {
                        if (children[j].name == type) {
                            return children[j];
                        }
                    }
                }
            }
            return null;
        },
        
        findChild: function(node, type) {
            var children = node.children;
            for (var i = 0; i < children.length; i++) {
                if (children[i].name == type) {
                    return children[i];
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
        
        findSiblings: function(node, type) {
            var children = node.getParent.children;
            var siblings = [];
            for (var i = 0; i < children.length; i++) {
                if (children[i] != node && children[i].name == type) {
                    siblings.push(children[i]);
                }
            }
            return siblings;
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
                    refs[i].getParent.name === "ForBinding" || refs[i].getParent.name === "Param") {
                    return refs[i];
                }
            }
            return null;
        },
        
        getPath: function(node) {
            var parts = [ node.name ];
            node = node.getParent;
            while (node) {
                parts.push(node.name);
                node = node.getParent;
            }
            return parts.reverse().join("/");
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

eXide.namespace("eXide.edit.InScopeVariables");

/**
 * XQuery specific helper methods.
 */
eXide.edit.InScopeVariables = (function () {
    
    var Range = require("ace/range").Range;
    
    Constr = function(root, node) {
        this.node = node;
        this.stack = [];
        this.variables = null;
        this.visit(root);
    };
    
    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);
    
    Constr.prototype.FLWORExpr = function(node) {
        var pos = this.stack.length;
        this.visitChildren(node);
        this.stack.length = pos;
        return true;
    };
    
    Constr.prototype.VarName = function(node) {
        if (node == this.node) {
            this.variables = this.deepCopy(this.stack);
            return true;
        }
        if (node.getParent.name === "ForBinding" || node.getParent.name === "LetBinding") {
            var name = eXide.edit.XQueryUtils.getValue(node);
            this.stack.push(name);
        }
    };
    
    Constr.prototype.VarRef = function(node) {
        if (node == this.node) {
            this.variables = this.deepCopy(this.stack);
            return true;
        }
        return false;
    };
    
    Constr.prototype.VarDecl = function(node) {
        var self = this;
        this.visitChildren(node, {
            VarName: function(node) {
                var value = eXide.edit.XQueryUtils.getValue(node);
                self.stack.push(value);
                return true;
            },
            VarValue: function(node) {
                return true; // skip
            }
        });
        return true;
    };
    
    Constr.prototype.FunctionDecl = function(node) {
        var saved = this.deepCopy(this.stack);
        this.visitChildren(node);
        this.stack = saved;
        return true;
    };
    
    Constr.prototype.Param = function(node) {
        var self = this;
        this.visitChildren(node, {
            EQName: function(node) {
                self.stack.push(node.value);
            }
        });
        return true;
    };
    
    Constr.prototype.deepCopy = function(arr) {
        var copy = [];
        for (var i = 0; i < arr.length; i++) {
            copy.push(arr[i]);
        }
        return copy;
    };
    
    Constr.prototype.getStack = function() {
        return this.variables;
    };
    
    return Constr;
}());

eXide.namespace("eXide.edit.FunctionParameters");

/**
 * XQuery specific helper methods.
 */
eXide.edit.FunctionParameters = (function () {
    
    var Range = require("ace/range").Range;
    
    Constr = function(root) {
        this.parameters = [];
        this.visit(root);
    };
    
    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);
    
    Constr.prototype.Argument = function(node) {
        var name;
        this.visitChildren(node, {
            VarName: function(node) {
                name = eXide.edit.XQueryUtils.getValue(node);
                return false;
            }
        });
        if (name) {
            this.parameters.push(name);
        } else {
            this.parameters.push("argument" + this.parameters.length);
        }
        return true;
    };
    
    Constr.prototype.getParameters = function() {
        return this.parameters;
    };
    
    return Constr;
}());

eXide.namespace("eXide.edit.FunctionCalls");

/**
 * XQuery specific helper methods.
 */
eXide.edit.FunctionCalls = (function () {
    
    var Range = require("ace/range").Range;
    
    Constr = function(funcName, arity, ast) {
        this.name = funcName;
        this.arity = arity;
        this.references = [];
        this.declaration = null;
        this.visit(ast);
    };
    
    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);
    
    Constr.prototype.FunctionCall = function(node) {
        if (node.arity !== this.arity) {
            return false;
        }
        var name = node.children[0].value;
        if (name === this.name) {
            this.references.push(node.children[0]);
        }
        return false;
    };
    
    Constr.prototype.FunctionDecl = function(node) {
        var self = this;
        if (parseInt(node.arity) === this.arity) {
            this.visitChildren(node, {
                EQName: function(node) {
                    if (node.value === self.name) {
                        self.declaration = node;
                        return true;
                    }
                }
            });
        }
        return false;
    };
    
    Constr.prototype.getReferences = function() {
        return this.references;
    };
    
    return Constr;
}());

eXide.edit.ModuleInfo = (function () {
    
    Constr = function(ast) {
        this.modulePrefix = null;
        this.moduleNamespace = null;
        this.annotations = {};
        this.functions = [];
        this.prolog = null;
        this.visit(ast);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.Visitor);

    Constr.prototype.isModule = function() {
        return this.moduleNamespace !== null;
    };

    Constr.prototype.hasTests = function() {
        for (var anno in this.annotations) {
            if (/test\:/.test(anno)) {
                return true;
            }
        }
        return false;
    };

    Constr.prototype.Prolog = function(prolog) {
        this.prolog = prolog;
    };

    Constr.prototype.FunctionDecl = function(node) {
        this.functions.push(node);
    };

    Constr.prototype.ModuleDecl = function(node) {
        var self = this;
        this.visitChildren(node, {
            NCName: function(node) {
                self.modulePrefix = eXide.edit.XQueryUtils.getValue(node);
                return false;
            },

            URILiteral: function(node) {
                self.moduleNamespace = node.value;
                return false;
            }
        });
        return false;
    };
    
    Constr.prototype.Annotation = function(node) {
        var self = this;
        this.visitChildren(node, {
            EQName: function(node) {
                self.annotations[node.value] = 1;
                return false;
            }
        });
        return false;
    };
    
    return Constr;
}());