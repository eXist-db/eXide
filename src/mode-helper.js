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

eXide.namespace("eXide.edit.ModeHelper");

/**
 * Base class for helper methods needed by specific editing modes (like XQuery, XML...)
 */
eXide.edit.ModeHelper = (function () {
	
	Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
		
		this.commands = {};
        this.addCommand("locate", this.locate);
	}
	
	Constr.prototype = {

		/**
		 * Add a command which can be invoked dynamically by the editor
		 */
		addCommand: function (name, func) {
			if (!this.commands) {
				this.commands = {};
			}
			this.commands[name] = func;
		},
		
		/**
		 * Dynamically call a method of this class.
		 */
		exec: function (command, doc, args) {
			if (this.commands && this.commands[command]) {
				var nargs = [doc];
				for (var i = 0; i < args.length; i++) {
					nargs.push(args[i]);
				}
				$.log("Calling command %s ...", command);
				this.commands[command].apply(this, nargs);
			} else {
                eXide.util.message(command + " not supported in this mode.")
            }
		},
        
        /**
         * Parse the document and add functions to the
         * document for the outline view.
         */
        createOutline: function(doc, onComplete) {
            // implemented by subclasses
        },
        
        /**
         * Called after a document was saved.
         */
        documentSaved: function(doc) {
            // implemented by subclasses
        },
        
        locate: function(doc, type, row) {
            if (typeof row == "number") {
                this.editor.gotoLine(row + 1);
            	this.editor.focus();
            }
            return false;
        }
	};
	
	return Constr;
}());