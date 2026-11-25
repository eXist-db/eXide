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

import { namespace } from "./namespace.js";
import { Visitor } from "./visitor.js";

/**
 * XQuery specific helper methods.
 */
export const XQueryUtils = (function () {
    
    return {
        findNode(ast, pos) {
            const p = ast.pos;
            if(XQueryUtils.inRange(p, pos, false) === true) {
                for(const i in ast.children) {
                    const child = ast.children[i];
                    const n = XQueryUtils.findNode(child, pos);
                    if(n !== null)
                    return n;
                }
                return ast;
            } else {
                return null;
            }
        },
    
        findNodeForRange(ast, start, end) {
            const p = ast.pos;
            if(XQueryUtils.inRange(p, start) === true && XQueryUtils.inRange(p, end) === true) {
                for(const i in ast.children) {
                    const child = ast.children[i];
                    const n = XQueryUtils.findNode(child, start, end);
                    if(n !== null) return n;
                }
                return ast;
            } else {
                return null;
            }
        },
        
        inRange(p, pos, exclusive) {
            if(p && p.sl <= pos.line && pos.line <= p.el) {
                if(p.sl < pos.line && pos.line < p.el)
                    return true;
                else if(p.sl === pos.line && pos.line < p.el)
                    return p.sc <= pos.col;
                else if(p.sl === pos.line && p.el === pos.line)
                    return p.sc <= pos.col && pos.col <= p.ec + (exclusive ? 1 : 0);
                else if(p.sl < pos.line && p.el === pos.line)
                    return pos.col <= p.ec + (exclusive ? 1 : 0);
            }
        },
        
        samePosition(pos1, pos2) {
            return pos1.sl === pos2.sl &&
                pos1.sc === pos2.sc &&
                pos1.el === pos2.el &&
                pos1.ec === pos2.ec;
        },
        
        findNext(node, type) {
            const children = node.getParent.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i] === node) {
                    for (let j = i + 1; j < children.length; j++) {
                        if (children[j].name === type) {
                            return children[j];
                        }
                    }
                }
            }
            return null;
        },
        
        findChild(node, type) {
            const children = node.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i].name === type) {
                    return children[i];
                }
            }
            return null;
        },
        
        findSibling(node, type) {
            const children = node.getParent.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i].name === type) {
                    return children[i];
                }
            }
            return null;
        },
        
        findSiblings(node, type) {
            const children = node.getParent.children;
            const siblings = [];
            for (let i = 0; i < children.length; i++) {
                if (children[i] !== node && children[i].name === type) {
                    siblings.push(children[i]);
                }
            }
            return siblings;
        },
        
        findAncestor(node, type) {
            if (type instanceof Array) {
                while (node !== null) {
                    if (type.indexOf(node.name) > -1) {
                        return node;
                    }
                    node = node.getParent;
                }
            } else {
                while (node !== null) {
                    if (node.name === type) {
                        return node;
                    }
                    node = node.getParent;
                }
            }
            return null;
        },
        
        findVariableContext(node, varName) {
            let parent = node.getParent;
            while (parent !== null) {
                if ((parent.name === "FLWORExpr" || parent.name === "FunctionDecl") &&
                    XQueryUtils.findVarDecl(parent, varName) !== null) {
                    return parent;
                }
                if (parent.name === "FunctionDecl") {
                    return null;
                }
                parent = parent.getParent;
            }
            return null;
        },
        
        getValue(node) {
            let val = "";
            if (node.value) {
                val = node.value;
            } else {
                for (let i = 0; i < node.children.length; i++) {
                    val += XQueryUtils.getValue(node.children[i]);
                }
            }
            return val;
        },
        
        findVarDecl(node, name) {
            const refs = new VariableReferences(name, node).getReferences();
            for (let i = 0; i < refs.length; i++) {
                if (refs[i].getParent && (refs[i].getParent.name === "LetBinding") || 
                    refs[i].getParent.name === "ForBinding" || refs[i].getParent.name === "Param") {
                    return refs[i];
                }
            }
            return null;
        },
        
        getPath(node) {
            const parts = [ node.name ];
            node = node.getParent;
            while (node) {
                parts.push(node.name);
                node = node.getParent;
            }
            return parts.reverse().join("/");
        }
    };
}());

/**
 * XQuery specific helper methods.
 */
export class VariableReferences extends Visitor {
    constructor(variable, ast) {
        super();
        this.variable = variable;
        this.references = [];
        this.visit(ast);
    }

    VarName(node) {
        const name = XQueryUtils.getValue(node);
        if (name === this.variable) {
            this.references.push(node);
        }
    }

    Param(node) {
        for (let i = 0; i < node.children.length; i++) {
            if (node.children[i].value === this.variable) {
                this.references.push(node.children[i]);
            }
        }
    }

    getReferences() {
        return this.references;
    }
}

/**
 * XQuery specific helper methods.
 */
export class InScopeVariables extends Visitor {
    constructor(root, node) {
        super();
        this.node = node;
        this.stack = [];
        this.variables = null;
        this.visit(root);
    }

    FLWORExpr(node) {
        const pos = this.stack.length;
        this.visitChildren(node);
        this.stack.length = pos;
        return true;
    }

    VarName(node) {
        if (node === this.node) {
            this.variables = this.deepCopy(this.stack);
            return true;
        }
        if (node.getParent.name === "ForBinding" || node.getParent.name === "LetBinding") {
            const name = XQueryUtils.getValue(node);
            this.stack.push(name);
        }
    }

    VarRef(node) {
        if (node === this.node) {
            this.variables = this.deepCopy(this.stack);
            return true;
        }
        return false;
    }

    VarDecl(node) {
        const self = this;
        this.visitChildren(node, {
            VarName(node) {
                const value = XQueryUtils.getValue(node);
                self.stack.push(value);
                return true;
            },
            VarValue(node) {
                return true; // skip
            }
        });
        return true;
    }

    FunctionDecl(node) {
        const saved = this.deepCopy(this.stack);
        this.visitChildren(node);
        this.stack = saved;
        return true;
    }

    Param(node) {
        const self = this;
        this.visitChildren(node, {
            EQName(node) {
                self.stack.push(node.value);
            }
        });
        return true;
    }

    deepCopy(arr) {
        const copy = [];
        for (let i = 0; i < arr.length; i++) {
            copy.push(arr[i]);
        }
        return copy;
    }

    getStack() {
        return this.variables;
    }
}

/**
 * XQuery specific helper methods.
 */
export class FunctionParameters extends Visitor {
    constructor(root) {
        super();
        this.parameters = [];
        this.visit(root);
    }

    Argument(node) {
        let name;
        this.visitChildren(node, {
            VarName(node) {
                name = XQueryUtils.getValue(node);
                return false;
            }
        });
        if (name) {
            this.parameters.push(name);
        } else {
            this.parameters.push(`argument${this.parameters.length}`);
        }
        return true;
    }

    getParameters() {
        return this.parameters;
    }
}

/**
 * XQuery specific helper methods.
 */
export class FunctionCalls extends Visitor {
    constructor(funcName, arity, ast) {
        super();
        this.name = funcName;
        this.arity = arity;
        this.references = [];
        this.declaration = null;
        this.visit(ast);
    }

    FunctionCall(node) {
        if (node.arity !== this.arity) {
            return false;
        }
        const name = node.children[0].value;
        if (name === this.name) {
            this.references.push(node.children[0]);
        }
        return false;
    }

    FunctionDecl(node) {
        const self = this;
        if (parseInt(node.arity) === this.arity) {
            this.visitChildren(node, {
                EQName(node) {
                    if (node.value === self.name) {
                        self.declaration = node;
                        return true;
                    }
                }
            });
        }
        return false;
    }

    getReferences() {
        return this.references;
    }
}

export class ModuleInfo extends Visitor {
    constructor(ast) {
        super();
        this.modulePrefix = null;
        this.moduleNamespace = null;
        this.annotations = {};
        this.functions = [];
        this.prolog = null;
        this.visit(ast);
    }

    isModule() {
        return this.moduleNamespace !== null;
    }

    hasTests() {
        for (const anno in this.annotations) {
            if (/test:/.test(anno)) {
                return true;
            }
        }
        return false;
    }

    Prolog(prolog) {
        this.prolog = prolog;
    }

    FunctionDecl(node) {
        this.functions.push(node);
    }

    ModuleDecl(node) {
        const self = this;
        this.visitChildren(node, {
            NCName(node) {
                self.modulePrefix = XQueryUtils.getValue(node);
                return false;
            },

            URILiteral(node) {
                self.moduleNamespace = node.value;
                return false;
            }
        });
        return false;
    }

    Annotation(node) {
        const self = this;
        this.visitChildren(node, {
            EQName(node) {
                self.annotations[node.value] = 1;
                return false;
            }
        });
        return false;
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").XQueryUtils = XQueryUtils;
namespace("eXide.edit").VariableReferences = VariableReferences;
namespace("eXide.edit").InScopeVariables = InScopeVariables;
namespace("eXide.edit").FunctionParameters = FunctionParameters;
namespace("eXide.edit").FunctionCalls = FunctionCalls;
namespace("eXide.edit").ModuleInfo = ModuleInfo;
