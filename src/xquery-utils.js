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
            if(eXide.edit.XQueryUtils.inRange(p, pos) === true) {
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
            while (node != null) {
                if (node.name == type) {
                    return node;
                }
                node = node.getParent;
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
        }
    };
}());