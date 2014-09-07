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
	var SnippetManager = require("ace/snippets").snippetManager;
	var bindings = {};
    
	function bindKey(bindings) {
		if (bindings) {
	    return {
	        win: bindings[0],
	        mac: bindings[1],
	        sender: "editor"
	    };
		}
	}
	
    function createMap(editor) {
        var commands = editor.editor.commands;
        for (key in commands.commands)  {
            var command = commands.commands[key];
            if (command.bindKey) {
    			if (useragent.isMac)
				    bindings[command.name] = command.bindKey.mac;
				else
					bindings[command.name] = command.bindKey.win;
            }
        }
    }
    
	return {
		
		init: function (parent) {
            var commands = parent.editor.commands;
            $.ajax({
                url: "keybindings.js",
                dataType: 'json',
                async: false,
                success: function(bindings) {
                    commands.addCommand({
                        name: "gotoLine",
                        bindKey: bindKey(bindings.gotoLine),
                        exec: function(editor) {
                            parent.gotoLine();
                        }
                    });
                    commands.addCommand({
                        name: "historyBack",
                        bindKey: bindKey(bindings.historyBack),
                        exec: function(editor) {
                            parent.historyBack();
                        }
                    });
                    commands.addCommand({
            			name: "fold",
        			    bindKey: bindKey(bindings.fold),
        			    exec: function(editor) {
        					editor.session.toggleFold(false);
        				},
        			    readOnly: true
        			});
                    commands.addCommand({
                        name: "selectMoreBefore",
                        exec: function(editor) { editor.selectMore(-1); },
                        bindKey: {win: "Ctrl-Alt-Left", mac: "Ctrl-Alt-Command-Left"},
                        readOnly: true
                    });
                    commands.addCommand({
                        name: "selectMoreAfter",
                        exec: function(editor) { editor.selectMore(1); },
                        bindKey: {win: "Ctrl-Alt-Right", mac: "Ctrl-Alt-Command-Right"},
                        readOnly: true
                    });
        			commands.addCommand({
        				name: "unfold",
        			    bindKey: bindKey(bindings.unfold),
        			    exec: function(editor) { 
        					editor.session.toggleFold(true);
        				},
        			    readOnly: true
        			});
        		    commands.addCommand({
        		    	name: "saveDocument",
        		    	bindKey: bindKey(bindings.saveDocument),
        		    	exec: function (editor) {
        		    		eXide.app.saveDocument();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "runQuery",
        		    	bindKey: bindKey(bindings.runQuery),
        		    	exec: function (editor) {
        		    		eXide.app.runQuery();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "runQueryOrApp",
        		    	bindKey: bindKey(bindings.runQueryOrApp),
        		    	exec: function (editor) {
        		    		eXide.app.runAppOrQuery();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "openDocument",
        		    	bindKey: bindKey(bindings.openDocument),
        		    	exec: function (editor) {
        		    		eXide.app.openDocument();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "newDocumentFromTemplate",
        		    	bindKey: bindKey(bindings.newDocumentFromTemplate),
        		    	exec: function (editor) {
        		    		eXide.app.newDocumentFromTemplate();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "closeDocument",
        		    	bindKey: bindKey(bindings.closeDocument),
        		    	exec: function (editor) {
        		    		eXide.app.closeDocument();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "closeAll",
        		    	bindKey: bindKey(bindings.closeAll),
        		    	exec: function (editor) {
        		    		eXide.app.closeAll();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "autocomplete",
        		    	bindKey: bindKey(bindings.autocomplete),
        		    	exec: function(editor) {
        		    		parent.autocomplete();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "nextTab",
        		    	bindKey: bindKey(bindings.nextTab),
        		    	exec: function(editor) {
        		    		parent.nextTab();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "previousTab",
        		    	bindKey: bindKey(bindings.previousTab),
        		    	exec: function(editor) {
        		    		parent.previousTab();
        		    	}
        		    });
                    commands.addCommand({
                        name: "xquery-format",
                        bindKey: bindKey(bindings.xqueryFormat),
                        exec: function(editor) {
                            parent.exec("format");
                        }
                    });
        		    commands.addCommand({
        		    	name: "functionDoc",
        		    	bindKey: bindKey(bindings.functionDoc),
        		    	exec: function(editor) {
        		    		parent.exec("showFunctionDoc");
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "gotoDefinition",
        		    	bindKey: bindKey(bindings.gotoDefinition),
        		    	exec: function(editor) {
        		    		parent.exec("gotoDefinition");
        		    	}
        		    });
                    commands.addCommand({
                        name: "gotoSymbol",
                        hint: "Goto symbol",
                        bindKey: bindKey(bindings.gotoSymbol),
                        exec: function(editor) {
                            parent.exec("gotoSymbol");
                        }
                    });
              //       commands.addCommand({
            	 //    	name: "searchIncremental",
        		    // 	bindKey: bindKey(bindings.searchIncremental),
        		    // 	exec: function(editor) {
        		    // 		parent.quicksearch.start();
        		    // 	}
        		    // });
                    commands.addCommand({
                    	name: "searchReplace",
        		    	bindKey: bindKey(bindings.searchReplace),
        		    	exec: function(editor) {
        		    		parent.search.open();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "findModule",
        		    	bindKey: bindKey(bindings.findModule),
        		    	exec: function(editor) {
                            var doc = parent.getActiveDocument();
        		    		eXide.find.Modules.select(doc.syntax);
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "escape",
        		    	bindKey: bindKey(bindings.escape),
        		    	exec: function(editor) {
        		    		var doc = parent.getActiveDocument();
        		    		doc.template = null;
        		    		editor.clearSelection();
        		    	}
        		    });
        		    commands.addCommand({
        		    	name: "dbManager",
        		    	bindKey: bindKey(bindings.dbManager),
        		    	exec: function (editor) {
        		    		eXide.app.manage();
        		    	}
        		    });
                    commands.addCommand({
            	    	name: "toggleComment",
        		    	bindKey: bindKey(bindings.toggleComment),
        		    	exec: function (editor) {
        		    		editor.toggleCommentLines();
        		    	}
        		    });
                    commands.addCommand({
                        name: "synchronize",
                        bindKey: bindKey(bindings.synchronize),
                        exec: function(editor) {
                            eXide.app.synchronize();
                        }
                    });
                    commands.addCommand({
                        name: "preferences",
                        bindKey: bindKey(bindings.preferences),
                        exec: function(editor) {
                            eXide.app.showPreferences();
                        }
                    });
                    commands.addCommand({
                        name: "openApp",
                        bindKey: bindKey(bindings.openApp),
                        exec: function(editor) {
                            eXide.app.openApp();
                        }
                    });
                    commands.addCommand({
                        name: "quickfix",
                        bindKey: bindKey(bindings.quickfix),
                        exec: function(editor) {
                            parent.exec("quickFix");
                        }
                    });
                    commands.addCommand({
                        name: "expandSelection",
                        bindKey: bindKey(bindings.expandSelection),
                        exec: function(editor) {
                            parent.exec("expandSelection");
                        }
                    });
                    commands.addCommand({
                        name: "renameSymbol",
                        bindKey: bindKey(bindings.renameSymbol),
                        exec: function(editor) {
                            parent.exec("rename");
                        }
                    });
                    commands.addCommand({
                        name: "removeTags",
                        bindKey: bindKey(bindings.removeTags),
                        exec: function(editor) {
                            parent.exec("removeTags");
                        }
                    });
                    commands.addCommand({
                        name: "extractFunction",
                        hint: "Extract Function",
                        bindKey: bindKey(bindings.extractFunction),
                        exec: function(editor) {
                            parent.exec("extractFunction");
                        }
                    });
                    commands.addCommand({
                        name: "extractVariable",
                        hint: "Extract Variable",
                        bindKey: bindKey(bindings.extractVariable),
                        exec: function(editor) {
                            parent.exec("extractVariable");
                        }
                    });
                    commands.addCommand({
                        name: "snippet",
                        hint: "code snippet",
                        bindKey: {mac: "Tab", win: "Tab"},
                        exec: function(editor) {
                            var success = SnippetManager.expandWithTab(editor);
                            if (!success) {
                                success = parent.autocomplete(false);
                            }
                            if (!success) {
                                editor.execCommand("indent");
                            }
                        }
                    });
                    commands.addCommand({
                        name: "openTab",
                        hint: "select open tab",
                        bindKey: bindKey(bindings.openTab),
                        exec: function(editor) {
                            parent.selectTab();
                        }
                    });
                    commands.addCommand({
                        name: "toggleQueryResults",
                        hint: "toggle query results panel",
                        bindKey: bindKey(bindings.toggleQueryResults),
                        exec: function(editor) {
                            eXide.app.toggleResultsPanel();
                        }
                    });
                    commands.addCommand({
                        name: "commandPalette",
                        hint: "Command Palette",
                        bindKey: bindKey(bindings.commandPalette),
                        exec: function(editor) {
                            eXide.app.getMenu().commandPalette();
                        }
                    });
                    commands.addCommand({
                        name: "findFiles",
                        hint: "Find in files",
                        bindKey: bindKey(bindings.findFiles),
                        exec: function(editor) {
                            eXide.app.findFiles();
                        }
                    });
                    
                    function createExec(tab) {
                        return function(editor) {
                            parent.selectTab(tab - 1);
                        };
                    }
                    
                    for (var i = 1; i < 10; i++) {
                        var tab = i;
                        commands.addCommand({
                            name: "gotoTab" + tab,
                            bindKey: bindKey(bindings["gotoTab"  + tab]),
                            exec: createExec(tab)
                        });
                    }
    			    createMap(parent);
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