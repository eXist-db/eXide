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

eXide.namespace("eXide.edit.ModeHelper");

/**
 * Base class for helper methods needed by specific editing modes (like XQuery, XML...)
 */
eXide.edit.ModeHelper = (function () {
	
    var SnippetManager = require("ace/snippets").snippetManager;
    var Range = require("ace/range").Range;
    
	Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
		
		this.commands = {};
        this.addCommand("locate", this.locate);
	}
	
	Constr.prototype = {

        activate: function() {
        },
        
        deactivate: function() {
        },
        
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
        
        validate: function(doc, code, onComplete) {
            if (onComplete)
                onComplete(doc);
        },
        
        /**
         * Parse the document and add functions to the
         * document for the outline view.
         */
        createOutline: function(doc, onComplete) {
            // implemented by subclasses
            d3.select("#outline").selectAll("li")
                .transition()
                    .duration(400)
                    .style("opacity",0)
                    .remove();
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
        },
        
        /**
         * General autocomplete method: shows template popup.
         */
        autocomplete : function(doc, alwaysShow) {
            var self = this;
            var range;
            if (alwaysShow === undefined) {
                alwaysShow = true;
            }
            
            function apply(selected) {
                if (range) {
                    self.editor.getSession().remove(range);
                }
                SnippetManager.insertSnippet(self.editor, selected.template);
            }
            
            if (alwaysShow === undefined) {
                alwaysShow = true;
            }
            
            var sel   = this.editor.getSelection();
            var lead = sel.getSelectionLead();
            var pos = this.editor.renderer.textToScreenCoordinates(lead.row, lead.column);
            var token;
            if (sel.isEmpty()) {
                var row = lead.row;
                var line = this.editor.getSession().getDisplayLine(lead.row);
                var start = lead.column - 1;
                var end = lead.column;
                while (start >= 0) {
                   var ch = line.substring(start, end);
                   if (ch.match(/^\$[\w:\-_\.]+$/)) {
                       break;
                   }
                   if (!ch.match(/^[\w:\-_\.]+$/)) {
                       start++;
                       break;
                   }
                   start--;
                }
                token = line.substring(start, end);
                end++;
                
                if (token === "" && !alwaysShow) {
                    return false;
                } else {
                    range = new Range(row, start, row, end);
                }
            } else if (!alwaysShow) {
                return false;
            }
            
            eXide.util.Popup.position(pos);
    
            var popupItems = this.getTemplates(doc, token, []);
            if (popupItems.length == 0) {
                return false;
            } else if (popupItems.length > 1) {
                eXide.util.Popup.show(popupItems, function(selected) {
                    if (selected) {
                        apply(selected);
                    }
                });
            } else if (popupItems.length == 1) {
                apply(popupItems[0]);
            }
            return true;
        },
        
        getTemplates: function (doc, prefix, popupItems) {
            var templates = eXide.util.Snippets.getTemplates(doc, prefix);
        	// add templates
    		for (var i = 0; i < templates.length; i++) {
    			var item = {
    				type: "template",
    				label: "[S] " + templates[i].name,
    				template: templates[i].template,
                    completion: templates[i].completion
    			};
    			popupItems.push(item);
    		}
            return popupItems;
    	}
	};
	
	return Constr;
}());