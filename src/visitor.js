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
eXide.namespace("eXide.edit.Visitor");

/**
 * XQuery specific helper methods.
 */
eXide.edit.Visitor = (function () {

    Constr = function() {
    };
    
    Constr.prototype.visit = function(node, handler) {
        if (node) {
            var name = node.name;
            var skip = false;
            
            if (typeof this[name] === "function") skip = this[name](node) === true ? true : false;
            
            if (!skip) {
                this.visitChildren(node, handler);
            }
        }
    };

    Constr.prototype.visitChildren = function(node, handler) {
        if (node) {
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                if (handler !== undefined && typeof handler[child.name] === "function") {
                    handler[child.name](child);
                } else {
                    this.visit(child, handler);
                }
            }
        }
    };
    
    return Constr;
}());