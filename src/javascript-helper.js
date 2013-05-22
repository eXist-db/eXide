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
 * XML specific helper methods.
 */
eXide.edit.JavascriptModeHelper = (function () {
    
    var RE_FUNC_NAME = /^[\$\w\-_]+/;
    
    var TokenIterator = require("ace/token_iterator").TokenIterator;
    
    Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
        this.addCommand("gotoDefinition", this.gotoDefinition);
        this.addCommand("locate", this.locate);
        this.addCommand("gotoSymbol", this.gotoSymbol);
	}
	
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
    
    Constr.prototype.createOutline = function(doc, onComplete) {
        var iterator = new TokenIterator(doc.getSession(), 0, 0);
        var next = iterator.stepForward();
        while (next != null) {
            if (next.type == "entity.name.function") {
                doc.functions.push({
            		type: eXide.edit.Document.TYPE_FUNCTION,
    				name: next.value,
    				signature: next.value,
                    sort: next.value,
                    row: iterator.getCurrentTokenRow(),
                    column: iterator.getCurrentTokenColumn()
    			});
            }
            next = iterator.stepForward();
        }
        if (onComplete)
            onComplete(doc);
    };
    
    Constr.prototype.gotoSymbol = function(doc) {
        var self = this;
        var popupItems = [];
        for (var i = 0; i < doc.functions.length; i++) {
            item = { 
                label: doc.functions[i].name,
                name: doc.functions[i].name,
                type: doc.functions[i].type,
                row: doc.functions[i].row
            };
            popupItems.push(item);
        };
        if (popupItems.length > 1) {
            var left = this.parent.getOffset().left;
            eXide.util.Popup.position({pageX: left, pageY: 20});
            eXide.util.Popup.show(popupItems, function (selected) {
                if (selected) {
                    self.editor.gotoLine(selected.row + 1);
                }
                self.editor.focus();
            });
        }
    };

    Constr.prototype.gotoDefinition = function (doc) {
    	var sel = this.editor.getSelection();
		var lead = sel.getSelectionLead();
		var funcName = this.getFunctionAtCursor(lead);
		if (funcName) {
			this.locate(doc, null, funcName);
		}
	};
    
    Constr.prototype.locate = function(doc, type, name) {
        if (typeof name == "number") {
            this.editor.gotoLine(name + 1);
        } else {
        	var func = this.parent.outline.findDefinition(doc, name);
            if (func && func.row) {
                this.editor.gotoLine(func.row + 1);
            }
        }
	};
    
    Constr.prototype.getFunctionAtCursor = function (lead) {
    	var row = lead.row;
	    var session = this.editor.getSession();
		var line = session.getDisplayLine(row);
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