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
eXide.namespace("eXide.edit.commands");

/**
 * Register editor commands to be called from keybindings.
 */
eXide.edit.commands = (function () {

	var useragent = require("ace/lib/useragent");
	var bindings = {};
    
	function bindKey(bindings) {
	    return {
	        win: bindings[0],
	        mac: bindings[1],
	        sender: "editor"
	    };
	}
	
    function createMap(editor) {
        var commands = editor.editor.commands;
        for (key in commands.commands)  {
            var command = commands.commands[key];
            var bind;
            if (command.bindKey) {
    			if (useragent.isMac)
				    bind = command.bindKey.mac;
				else
					bind = command.bindKey.win;
            }
            bindings[command.name] = bind;
        }
    }
    
	return {
		
		init: function (editor) {
            commands = editor.editor.commands;
            $.ajax({
                url: "keybindings.js",
                dataType: 'json',
                async: false,
                success: function(bindings) {
                    commands.addCommand({
                        name: "gotoLine",
                        bindKey: bindKey(bindings.gotoLine),
                        exec: function(env, args, request) {
                            editor.gotoLine();
                        }
                    });
                    commands.addCommand({
            			name: "fold",
        			    bindKey: bindKey(bindings.fold),
        			    exec: function(env, args, request) { 
        					env.editor.session.toggleFold(false);
        				},
        			    readOnly: true
        			});
        			commands.addCommand({
        				name: "unfold",
        			    bindKey: bindKey(bindings.unfold),
        			    exec: function(env, args, request) { 
        					env.editor.session.toggleFold(true);
        				},
        			    readOnly: true
        			});
        		    commands.addCommand({
        		    	name: "saveDocument",
        		    	bindKey: bindKey(bindings.saveDocument),
        		    	exec: function (env, args, request) {
        		    		eXide.app.saveDocument();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "runQuery",
        		    	bindKey: bindKey(bindings.runQuery),
        		    	exec: function (env, args, request) {
        		    		eXide.app.runQuery();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "openDocument",
        		    	bindKey: bindKey(bindings.openDocument),
        		    	exec: function (env, args, request) {
        		    		eXide.app.openDocument();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "newDocumentFromTemplate",
        		    	bindKey: bindKey(bindings.newDocumentFromTemplate),
        		    	exec: function (env, args, request) {
        		    		eXide.app.newDocumentFromTemplate();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "closeDocument",
        		    	bindKey: bindKey(bindings.closeDocument),
        		    	exec: function (env, args, request) {
        		    		eXide.app.closeDocument();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "autocomplete",
        		    	bindKey: bindKey(bindings.autocomplete),
        		    	exec: function(env, args, request) {
        		    		editor.autocomplete();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "nextTab",
        		    	bindKey: bindKey(bindings.nextTab),
        		    	exec: function(env, args, request) {
        		    		editor.nextTab();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "previousTab",
        		    	bindKey: bindKey(bindings.previousTab),
        		    	exec: function(env, args, request) {
        		    		editor.previousTab();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "functionDoc",
        		    	bindKey: bindKey(bindings.functionDoc),
        		    	exec: function(env, args, request) {
        		    		editor.exec("showFunctionDoc");
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "gotoDefinition",
        		    	bindKey: bindKey(bindings.gotoDefinition),
        		    	exec: function(env, args, request) {
        		    		editor.exec("gotoDefinition");
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "searchIncremental",
        		    	bindKey: bindKey(bindings.searchIncremental),
        		    	exec: function(env, args, request) {
        		    		editor.quicksearch.start();
        		    	}
        		    });
                    commands.addCommand({
                    	name: "searchReplace",
        		    	bindKey: bindKey(bindings.searchReplace),
        		    	exec: function(env, args, request) {
        		    		editor.search.open();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "findModule",
        		    	bindKey: bindKey(bindings.findModule),
        		    	exec: function(env, args, request) {
                            var doc = editor.getActiveDocument();
        		    		eXide.find.Modules.select(doc.syntax);
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "indentOrParam",
        		    	bindKey: bindKey(bindings.indentOrParam),
        		    	exec: function(env, args, request) {
        		    		// if there's active template code in the document, tab will
        		    		// cycle through the template's params. Otherwise, it calls indent.
        		    		var doc = editor.getActiveDocument();
        		    		if (!(doc.template && doc.template.nextParam())) {
        		    			editor.editor.indent();
        		    		}
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "escape",
        		    	bindKey: bindKey(bindings.escape),
        		    	exec: function(env, args, request) {
        		    		var doc = editor.getActiveDocument();
        		    		doc.template = null;
        		    		editor.editor.clearSelection();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "dbManager",
        		    	bindKey: bindKey(bindings.dbManager),
        		    	exec: function (env, args, request) {
        		    		eXide.app.manage();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "toggleComment",
        		    	bindKey: bindKey(bindings.toggleComment),
        		    	exec: function (env, args, request) {
        		    		editor.editor.toggleCommentLines();
        		    	}
        		    });
                    commands.addCommand({
                        name: "synchronize",
                        bindKey: bindKey(bindings.synchronize),
                        exec: function(env, args, request) {
                            eXide.app.synchronize();
                        }
                    });
                    commands.addCommand({
                        name: "preferences",
                        bindKey: bindKey(bindings.preferences),
                        exec: function(env, args, request) {
                            eXide.app.showPreferences();
                        }
                    });
                    commands.addCommand({
                        name: "openApp",
                        bindKey: bindKey(bindings.openApp),
                        exec: function(env, args, request) {
                            eXide.app.openApp();
                        }
                    });
    			    createMap(editor);
                }
            });
		},
		
		help: function (container, editor) {
			$(container).find("table").each(function () {
				this.innerHTML = "";
                var commands = editor.editor.commands;
                for (key in commands.commands)  {
                    var command = commands.commands[key];
    				var tr = document.createElement("tr");
					var td = document.createElement("td");
					td.appendChild(document.createTextNode(command.name));
					tr.appendChild(td);
					td = document.createElement("td");
                    if (command.bindKey) {
    					if (useragent.isMac)
    						td.appendChild(document.createTextNode(command.bindKey.mac));
    					else
    						td.appendChild(document.createTextNode(command.bindKey.win));
                    }
					tr.appendChild(td);
					this.appendChild(tr);
                }
			});
		},
        
        getShortcut: function(key) {
            return bindings[key];
        }
        
	};
}());