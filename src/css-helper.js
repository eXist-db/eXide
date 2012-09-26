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
eXide.namespace("eXide.edit.CssModeHelper");

/**
 * XML specific helper methods.
 */
eXide.edit.CssModeHelper = (function () {
    
    var TokenIterator = require("ace/token_iterator").TokenIterator;
    
    Constr = function(editor) {
    	this.parent = editor;
		this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
	}
	
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
    
    Constr.prototype.createOutline = function(doc, onComplete) {
        var iterator = new TokenIterator(doc.getSession(), 0, 0);
        var next = iterator.stepForward();
        var lastVar = "";
        while (next != null) {
//            $.log("type: %o value: %s", next.type, next.value);
            if (next.type == "variable" || next.type == "keyword") {
                if (lastVar.length > 0) {
                    lastVar += " ";
                }
                lastVar += next.value;
            } else if (next.type == "paren.lparen") {
                doc.functions.push({
                	type: eXide.edit.Document.TYPE_FUNCTION,
    				name: lastVar,
                    source: doc.getPath(),
    				signature: lastVar,
                    row: iterator.getCurrentTokenRow(),
                    column: iterator.getCurrentTokenColumn()
    			});
                lastVar = "";
            }
            next = iterator.stepForward();
        }
        if (onComplete)
            onComplete(doc);
    };
    
    return Constr;
}());