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
	
	function bindKey(win, mac) {
	    return {
	        win: win,
	        mac: mac,
	        sender: "editor"
	    };
	}
	
	return {
		
		init: function (editor) {
            var commands = editor.editor.commands;
            $.log("commands: %o", commands);
		    commands.addCommand({
		    	name: "saveDocument",
		    	bindKey: bindKey("Ctrl-Shift-S", "Command-Shift-S"),
		    	exec: function (env, args, request) {
		    		eXide.app.saveDocument();
		    	}
		    });
		    commands.addCommand({
		    	name: "runQuery",
		    	bindKey: bindKey("Ctrl-Return", "Command-Return"),
		    	exec: function (env, args, request) {
		    		eXide.app.runQuery();
		    	}
		    });
		    commands.addCommand({
		    	name: "openDocument",
		    	bindKey: bindKey("Ctrl-Shift-O", "Command-Shift-O"),
		    	exec: function (env, args, request) {
		    		eXide.app.openDocument();
		    	}
		    });
		    commands.addCommand({
		    	name: "newDocument",
		    	bindKey: bindKey("Ctrl-Shift-N", "Command-Shift-N"),
		    	exec: function (env, args, request) {
		    		eXide.app.newDocument();
		    	}
		    });
		    commands.addCommand({
		    	name: "closeDocument",
		    	bindKey: bindKey("Ctrl-Shift-W", "Command-Shift-W"),
		    	exec: function (env, args, request) {
		    		eXide.app.closeDocument();
		    	}
		    });
		    commands.addCommand({
		    	name: "autocomplete",
		    	bindKey: bindKey("Ctrl-Space", "Ctrl-Space"),
		    	exec: function(env, args, request) {
		    		editor.autocomplete();
		    	}
		    });
		    commands.addCommand({
		    	name: "nextTab",
		    	bindKey: bindKey("Ctrl-Shift-PageDown", "Command-Shift-PageDown"),
		    	exec: function(env, args, request) {
		    		editor.nextTab();
		    	}
		    });
		    commands.addCommand({
		    	name: "previousTab",
		    	bindKey: bindKey("Ctrl-Shift-PageUp", "Command-Shift-PageUp"),
		    	exec: function(env, args, request) {
		    		editor.previousTab();
		    	}
		    });
		    commands.addCommand({
		    	name: "functionDoc",
		    	bindKey: bindKey("F1", "F1"),
		    	exec: function(env, args, request) {
		    		editor.exec("showFunctionDoc");
		    	}
		    });
		    commands.addCommand({
		    	name: "gotoDefinition",
		    	bindKey: bindKey("F3", "F3"),
		    	exec: function(env, args, request) {
		    		editor.exec("gotoDefinition");
		    	}
		    });
            commands.addCommand({
    	    	name: "searchIncremental",
		    	bindKey: bindKey("Ctrl-F", "Command-F"),
		    	exec: function(env, args, request) {
		    		editor.quicksearch.start();
		    	}
		    });
            commands.addCommand({
    	    	name: "findModule",
		    	bindKey: bindKey("F4", "F4"),
		    	exec: function(env, args, request) {
                    var doc = editor.getActiveDocument();
		    		eXide.find.Modules.select(doc.syntax);
		    	}
		    });
		    commands.addCommand({
		    	name: "indentOrParam",
		    	bindKey: bindKey("Tab", "Tab"),
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
		    	bindKey: bindKey("Esc", "Esc"),
		    	exec: function(env, args, request) {
		    		var doc = editor.getActiveDocument();
		    		doc.template = null;
		    		editor.editor.clearSelection();
		    	}
		    });
		    commands.addCommand({
		    	name: "dbManager",
		    	bindKey: bindKey("Ctrl-Shift-M", "Command-Shift-M"),
		    	exec: function (env, args, request) {
		    		eXide.app.manage();
		    	}
		    })
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
		}
	};
}());