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
eXide.namespace("eXide.edit.XQueryModeHelper");

/**
 * XQuery specific helper methods.
 */
eXide.edit.XQueryModeHelper = (function () {
	
	var RE_FUNC_NAME = /^[\$\w:\-_\.]+/;
	
	Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
        // pre-compile regexp needed by this class
    	this.funcDefRe = /declare\s+((?:%[\w\:\-]+(?:\([^\)]*\))?\s*)*)function\s+([^\(]+)\(/g;
		this.varDefRe = /declare\s+(?:%\w+\s+)*variable\s+\$[^\s;]+/gm;
		this.varRe = /declare\s+(?:%\w+\s+)*variable\s+(\$[^\s;]+)/;
		this.parseImportRe = /import\s+module\s+namespace\s+[^=]+\s*=\s*["'][^"']+["']\s*at\s+["'][^"']+["']\s*;/g;
		this.moduleRe = /import\s+module\s+namespace\s+([^=\s]+)\s*=\s*["']([^"']+)["']\s*at\s+["']([^"']+)["']\s*;/;
		
		this.addCommand("showFunctionDoc", this.showFunctionDoc);
		this.addCommand("gotoDefinition", this.gotoDefinition);
		this.addCommand("locate", this.locate);
		this.addCommand("closeTag", this.closeTag);
        this.addCommand("importModule", this.importModule);
	}
	
	// extends ModeHelper
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
	
	Constr.prototype.closeTag = function (doc, text, row) {
		var basePath = "xmldb:exist://" + doc.getBasePath();
		var $this = this;
		$.ajax({
			type: "POST",
			url: "modules/compile.xql",
			data: {q: text, base: basePath},
			dataType: "json",
			success: function (data) {
				if (data.result == "fail") {
					var err = parseErrMsg(data.error);
					if (err.line <= row) {
						var tag = /constructor:\s(.*)$/.exec(err.msg);
						if (tag.length > 0) {
							$this.editor.insert(tag[1] + ">");
						}
					}
				}
			},
			error: function (xhr, status) {
			}
		});
	}
		
	Constr.prototype.validate = function(doc, code, onComplete) {
		$.log("Running validation...");
		var $this = this;
		var basePath = "xmldb:exist://" + doc.getBasePath();
		
		$.ajax({
			type: "POST",
			url: "modules/compile.xql",
			data: {q: code, base: basePath},
			dataType: "json",
			success: function (data) {
				$this.compileError(data, doc);
				onComplete.call(this, true);
			},
			error: function (xhr, status) {
				onComplete.call(this, true);
				$.log("Compile error: %s - %s", status, xhr.responseText);
			}
		});
	}
	
	/*
	 * { "result" : "fail", "error" : { "line" : "52", "column" : "43", "#text" : "XPDY0002
	 */
	Constr.prototype.compileError = function(data, doc) {
		if (data.result == "fail") {
			var err = parseErrMsg(data.error);
			var annotation = [{
				row: err.line,
				text: err.msg,
				type: "error"
			}];
			this.parent.updateStatus(err.msg, doc.getPath() + "#" + err.line);
			doc.getSession().setAnnotations(annotation);
		} else {
			this.parent.clearErrors();
			this.parent.updateStatus("");
		}
	}
	
	Constr.prototype.autocomplete = function(doc) {
		var lang = require("pilot/lang");
		var Range = require("ace/range").Range;
		
	    var sel   = this.editor.getSelection();
	    var session   = doc.getSession();
	    
		var lead = sel.getSelectionLead();
		var line = session.getDisplayLine(lead.row);
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
		var token = line.substring(start, end);
		$.log("completing token: %s", token);
		var range = new Range(lead.row, start, lead.row, end);

		var pos = this.editor.renderer.textToScreenCoordinates(lead.row, lead.column);
		var editorHeight = this.parent.getHeight();
		if (pos.pageY + 150 > editorHeight) {
			pos.pageY = editorHeight - 150;
			$.log("window height: %i, pageY: %i", editorHeight, pos.pageY);
		}
		$("#autocomplete-box").css({ left: pos.pageX + "px", top: (pos.pageY + 10) + "px" });
		$("#autocomplete-help").css({ left: (pos.pageX + 324) + "px", top: (pos.pageY + 10) + "px" });
		
		if (token.length == 0) {
			this.templateLookup(doc, token, range, true);
		} else {
			this.functionLookup(doc, token, range, true);
		}
		return true;
	}
	
	Constr.prototype.$localVars = function(prefix, wordrange, complete) {
		var variables = [];
		var stopRegex = /declare function|};/;
		var varRegex = /let \$[\w\:]+|for \$[\w\:]+|\$[\w\:]+\)/;
		var getVarRegex = /\$[\w\:]+/;
		var nameRegex = new RegExp("^\\" + prefix);
		var session = this.editor.getSession();
		var row = wordrange.start.row;
		while (row > -1) {
			var line = session.getDisplayLine(row);
			var m;
			if (m = line.match(varRegex)) {
				$.log("Var: %s", m[0]);
				var name = m[0].match(getVarRegex);
				if (name[0].match(nameRegex)) {
					variables.push({
						name: name[0],
						type: "variable"
					});
				}
			}
			if (line.match(stopRegex)) {
				$.log("Stop: %s", line);
				return variables;
			}
			row--;
		}
		return variables;
	}
	
	Constr.prototype.functionLookup = function(doc, prefix, wordrange, complete) {
		var $this = this;
		// Call docs.xql to retrieve declared functions and variables
		$.ajax({
			url: "modules/docs.xql",
			dataType: "text",
			type: "POST",
			data: { prefix: prefix},
			
			success: function (data) {
				data = $.parseJSON(data);
				
				var funcs = [];
				var regexStr;
				var isVar = prefix.substring(0, 1) == "$";
				
				if (isVar) {
					regexStr = "^\\" + prefix;
					funcs = $this.$localVars(prefix, wordrange, complete);
				} else {
					regexStr = "^" + prefix;
				}
				var regex = new RegExp(regexStr);
				
				// add local functions to the set
				var localFuncs = doc.functions;
				$.each(localFuncs, function (i, func) {
					if (func.name.match(regex)) {
						funcs.push(func);
					}
				});
				
				if (data)
					funcs = funcs.concat(data);
				
				// Create popup menu
				// add function defs
				var popupItems = [];
				for (var i = 0; i < funcs.length; i++) {
					var item = { 
							label: funcs[i].signature ? funcs[i].signature : funcs[i].name,
							type: funcs[i].type
					};
					if (funcs[i].help) {
						item.tooltip = funcs[i].help;
					}
					popupItems.push(item);
				}
				
				$this.$addTemplates(prefix, popupItems);
				
				$this.$showPopup(doc, wordrange, popupItems);
			},
			error: function(xhr, msg) {
				eXide.util.error(msg);
			}
		});
	}
	
	Constr.prototype.templateLookup = function(doc, prefix, wordrange, complete) {
		var popupItems = [];
		this.$addTemplates(prefix, popupItems);
		this.$showPopup(doc, wordrange, popupItems);
	}
	
	Constr.prototype.$addTemplates = function (prefix, popupItems) {
		// add templates
		var templates = this.parent.outline.getTemplates(prefix);
		for (var i = 0; i < templates.length; i++) {
			var item = {
					type: "template",
					label: "[S] " + templates[i].name,
					tooltip: templates[i].help,
					template: templates[i].template
			};
			popupItems.push(item);
		}
	}
	
	Constr.prototype.$showPopup = function (doc, wordrange, popupItems) {
		// display popup
		var $this = this;
		eXide.util.popup($("#autocomplete-box"), $("#autocomplete-help"), popupItems,
				function (selected) {
					if (selected) {
						var expansion = selected.label;
						if (selected.type == "template") {
							expansion = selected.template;
						} else if (selected.type == "function") {
							expansion = eXide.util.parseSignature(expansion);
						}
						
						doc.template = new eXide.edit.Template($this.parent, wordrange, expansion, selected.type);
						doc.template.insert();
					}
					$this.editor.focus();
				}
		);
	}
	
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
	}
	
	Constr.prototype.showFunctionDoc = function (doc) {
		var sel = this.editor.getSelection();
		var lead = sel.getSelectionLead();
		
		var pos = this.editor.renderer.textToScreenCoordinates(lead.row, lead.column);
		$("#autocomplete-box").css({ left: pos.pageX + "px", top: (pos.pageY + 20) + "px" });
		$("#autocomplete-help").css({ left: (pos.pageX + 324) + "px", top: (pos.pageY + 20) + "px" });
		var func = this.getFunctionAtCursor(lead);
		this.functionLookup(doc, func, null, false);
	}
	
	Constr.prototype.gotoDefinition = function (doc) {
		var sel = this.editor.getSelection();
		var lead = sel.getSelectionLead();
		var funcName = this.getFunctionAtCursor(lead);
		if (funcName) {
			this.parent.outline.gotoDefinition(doc, funcName);
		}
	}
	
	Constr.prototype.locate = function(doc, type, name) {
		switch (type) {
		case "function":
			this.gotoFunction(doc, name);
			break;
		default:
			this.gotoVarDecl(doc, name);
		}
	}
	
	Constr.prototype.gotoFunction = function (doc, name) {
		$.log("Goto function %s", name);
		var prefix = this.getModuleNamespacePrefix();
		if (prefix != null) {
			name = name.replace(/[^:]+:/, prefix + ":");
		}

		var regexp = new RegExp("function\\s+" + name + "\\s*\\(");
		var len = doc.$session.getLength();
		for (var i = 0; i < len; i++) {
			var line = doc.$session.getLine(i);
			if (line.match(regexp)) {
				this.editor.gotoLine(i + 1);
				this.editor.focus();
				return;
			}
		}
	}
	
	Constr.prototype.gotoVarDecl = function (doc, name) {
		var prefix = this.getModuleNamespacePrefix();
		if (prefix != null) {
			name = name.replace(/[^:]+:/, "$" + prefix + ":");
		}
		
		$.log("Goto variable declaration %s", name);
		var regexp = new RegExp("variable\\s+\\" + name);
		var len = doc.$session.getLength();
		for (var i = 0; i < len; i++) {
			var line = doc.$session.getLine(i);
			if (line.match(regexp)) {
				this.editor.gotoLine(i + 1);
				this.editor.focus();
				return;
			}
		}
	}
	
	Constr.prototype.getModuleNamespacePrefix = function () {
		var moduleRe = /^\s*module\s+namespace\s+([^=\s]+)\s*=/;
		var len = this.parent.getActiveDocument().$session.getLength();
		for (var i = 0; i < len; i++) {
			var line = this.parent.getActiveDocument().$session.getLine(i);
			var matches = line.match(moduleRe);
			if (matches) {
				return matches[1];
			}
		}
		return null;
	}
	
    Constr.prototype.importModule = function (doc, prefix, uri, location) {
        $.log("location = %s path = %s", location, doc.path);
        var base = doc.getBasePath();
        if (location.lastIndexOf(base, 0) === 0) {
            location = location.substring(base.length + 1);
        } else {
            location = "xmldb:exist://" + location;
        }
        var code = "import module namespace " + prefix + "=\"" + uri + "\" at \"" + location + "\";\n";
        this.editor.insert(code);
    }
    
    Constr.prototype.createOutline = function(doc, onComplete) {
        var code = doc.getText();
		this.$parseLocalFunctions(code, doc);
        if (onComplete)
            onComplete(doc);
		var imports = this.$parseImports(code);
		if (imports)
			this.$resolveImports(doc, imports, onComplete);
    }
    
    Constr.prototype.$sortFunctions = function(doc) {
		doc.functions.sort(function (a, b) {
			return(a.name == b.name) ? 0 : (a.name > b.name) ? 1 : -1;
		});
	}
    
    Constr.prototype.$parseLocalFunctions = function(text, doc) {
		doc.functions = [];
		
		while (true) {
			var funcDef = this.funcDefRe.exec(text);
			if (funcDef == null) {
				break;
			}
			var offset = this.funcDefRe.lastIndex;
			var end = this.$findMatchingParen(text, offset);
            var name = funcDef.length == 3 ? funcDef[2] : funcDef[1];
            var status = funcDef.length == 3 ? funcDef[1] : "public";
            if (status.indexOf("%private") !== -1)
                status = "private";
			doc.functions.push({
				type: eXide.edit.Document.TYPE_FUNCTION,
				name: name,
                visibility: status,
				signature: name + "(" + text.substring(offset, end) + ")"
			});
		}
		var varDefs = text.match(this.varDefRe);
		if (varDefs) {
			for (var i = 0; i < varDefs.length; i++) {
				var v = this.varRe.exec(varDefs[i]);
				doc.functions.push({
					type: eXide.edit.Document.TYPE_VARIABLE,
					name: v[1]
				});
			}
		}
        this.$sortFunctions(doc);
	}
	
	Constr.prototype.$findMatchingParen = function (text, offset) {
		var depth = 1;
		for (var i = offset; i < text.length; i++) {
			var ch = text.charAt(i);
			if (ch == ')') {
				depth -= 1;
				if (depth == 0)
					return i;
			} else if (ch == '(') {
				depth += 1;
			}
		}
		return -1;
	}
	
	Constr.prototype.$parseImports = function(code) {
		return code.match(this.parseImportRe);
	}
	
	Constr.prototype.$resolveImports = function(doc, imports, onComplete) {
		var $this = this;
		var functions = [];
		
		var params = [];
		for (var i = 0; i < imports.length; i++) {
			var matches = this.moduleRe.exec(imports[i]);
			if (matches != null && matches.length == 4) {
				params.push("prefix=" + encodeURIComponent(matches[1]));
				params.push("uri=" + encodeURIComponent(matches[2]));
				params.push("source=" + encodeURIComponent(matches[3]));
			}
		}

		var basePath = "xmldb:exist://" + doc.getBasePath();
		params.push("base=" + encodeURIComponent(basePath));

		$.ajax({
			url: "outline",
			dataType: "json",
			type: "POST",
			data: params.join("&"),
			success: function (data) {
				if (data != null) {
					var modules = data.modules;
					for (var i = 0; i < modules.length; i++) {
						var funcs = modules[i].functions;
						if (funcs) {
							for (var j = 0; j < funcs.length; j++) {
								functions.push({
									type: eXide.edit.Document.TYPE_FUNCTION,
									name: funcs[j].name,
									signature: funcs[j].signature,
                                    visibility: funcs[j].visibility,
									source: modules[i].source
								});
							}
						}
						var vars = modules[i].variables;
						if (vars) {
							for (var j = 0; j < vars.length; j++) {
								functions.push({
									type: eXide.edit.Document.TYPE_VARIABLE,
									name: "$" + vars[j],
									source: modules[i].source
								});
							}
						}
					}
					doc.functions = doc.functions.concat(functions);
					$this.$sortFunctions(doc);
                    if (onComplete)
                        onComplete(doc);
				}
			}
		});
		return functions;
	}
    
	var COMPILE_MSG_RE = /.*line:?\s(\d+)/i;
	
	function parseErrMsg(error) {
		var msg;
		if (error.line) {
			msg = error["#text"];
		} else {
			msg = error;
		}
		var str = COMPILE_MSG_RE.exec(msg);
		var line = -1;
		if (str) {
			line = parseInt(str[1]) - 1;
		} else if (error.line) {
			line = parseInt(error.line) - 1;
		}
		return { line: line, msg: msg };
	}
	
	return Constr;
}());