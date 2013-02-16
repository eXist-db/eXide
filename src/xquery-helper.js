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
	
    var SemanticHighlighter = require("xqlint/visitors/SemanticHighlighter").SemanticHighlighter;
    var XQueryParser = require("xqlint/XQueryParser").XQueryParser;
    var JSONParseTreeHandler = require("xqlint/JSONParseTreeHandler").JSONParseTreeHandler;
    var Translator = require("xqlint/Translator").Translator;
    var CodeFormatter = require("xqlint/visitors/CodeFormatter").CodeFormatter;
        
	Constr = function(editor, menubar) {
		this.parent = editor;
		this.editor = this.parent.editor;
        this.xqDebugger = null;
        
        // pre-compile regexp needed by this class
    	this.funcDefRe = /declare\s+((?:%[\w\:\-]+(?:\([^\)]*\))?\s*)*)function\s+([^\(]+)\(/g;
		this.varDefRe = /declare\s+(?:%\w+\s+)*variable\s+\$[^\s;]+/gm;
		this.varRe = /declare\s+(?:%\w+\s+)*variable\s+(\$[^\s;]+)/;
		this.parseImportRe = /import\s+module\s+namespace\s+[^=]+\s*=\s*["'][^"']+["']\s*at\s+["'][^"']+["']\s*;/g;
		this.moduleRe = /import\s+module\s+namespace\s+([^=\s]+)\s*=\s*["']([^"']+)["']\s*at\s+["']([^"']+)["']\s*;/;
		// added to clean function name : 
        this.trimRe = /^[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+|[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
        
        this.addCommand("format", this.format);
		this.addCommand("showFunctionDoc", this.showFunctionDoc);
		this.addCommand("gotoDefinition", this.gotoDefinition);
		this.addCommand("locate", this.locate);
		this.addCommand("closeTag", this.closeTag);
        this.addCommand("importModule", this.importModule);
        this.addCommand("debug", this.initDebugger);
        this.addCommand("stepOver", this.stepOver);
        this.addCommand("stepInto", this.stepInto);
        
        var self = this;
        this.menu = $("#menu-xquery").hide();
        menubar.click("#menu-xquery-format", function() {
            self.format(editor.getActiveDocument());
        }, "formatCode");
        
        editor.addEventListener("change", function(doc) {
            
        });
	};
	
	// extends ModeHelper
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
	
    Constr.prototype.activate = function() {
        this.menu.show();
        this.parent.triggerCheck();
    };
    
    Constr.prototype.deactivate = function() {
        this.menu.hide();
    };
    
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
		$.log("Running validation on %s", doc.getName());
		var $this = this;
		var basePath = "xmldb:exist://" + doc.getBasePath();
		
		$.ajax({
			type: "POST",
			url: "modules/compile.xql",
			data: {q: code, base: basePath},
			dataType: "json",
			success: function (data) {
				$this.compileError(data, doc);
                $this.xqlint(doc);
                if (onComplete) {
				    onComplete.call(this, true);
                }
			},
			error: function (xhr, status) {
                if (onComplete) {
				    onComplete.call(this, true);
                }
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
			var annotation = {
				row: err.line,
				text: err.msg,
				type: "error"
			};
			this.parent.updateStatus(err.msg, doc.getPath() + "#" + err.line);
            var annotations = this.clearAnnotations(doc, "error");
            annotations.push(annotation);
			doc.getSession().setAnnotations(annotations);
		} else {
			doc.getSession().setAnnotations(this.clearAnnotations(doc, "error"));
			this.parent.updateStatus("");
		}
	};
	
    Constr.prototype.xqlint = function(doc) {
        var session = doc.getSession();
        var value = doc.getText();    
        var h = new JSONParseTreeHandler(value);
        var parser = new XQueryParser(value, h);
        try {
            parser.parse_XQuery();
            var ast = h.getParseTree();
            
            var highlighter = new SemanticHighlighter(ast, value);
      
            var mode = doc.getSession().getMode();

            mode.$tokenizer.tokens = highlighter.getTokens();
            mode.$tokenizer.lines  = session.getDocument().getAllLines();
            session.bgTokenizer.lines = [];
            session.bgTokenizer.states = [];
            
            var rows = Object.keys(mode.$tokenizer.tokens);
            for(var i=0; i < rows.length; i++) {
                var row = parseInt(rows[i]);
                session.bgTokenizer.fireUpdateEvent(row, row);
            }

            var translator = new Translator(ast);
            ast = translator.translate();
            
            var markers = ast.markers;
            var annotations = this.clearAnnotations(doc, "warning");
            for (var i = 0; i < markers.length; i++) {
                if (markers[i].type !== "error") {
                    annotations.push({
                        row: markers[i].pos.sl,
                        text: markers[i].message,
                        type: markers[i].type
                    });
                }
            }
            session.setAnnotations(annotations);
        } catch(e) {
            $.log("error: %o", e);
            if(e instanceof parser.ParseException) {
                // ignore
            } else {
                throw e;
            }
        }
    };
    
    Constr.prototype.clearAnnotations = function(doc, type) {
        var na = [];
        var a = doc.getSession().getAnnotations();
        for (var i = 0; i < a.length; i++) {
            if (a[i].type !== type) {
                na.push(a[i]);
            }
        }
        return na;
    };
    
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
	
    Constr.prototype.$localVars = function (prefix, wordrange, complete) {
        var variables =[];
        var stopRegex = /declare function|};/;
        //var varRegex = /let \$[\w\:]+|for \$[\w\:]+|\$[\w\:]+\)/;
        //var getVarRegex = /\$[\w\:]+/;
        var varRegex = /let \$[\w\-_\:]+|for \$[\w\-_\:]+|\$[\w\-_\:]+\)/;
        var getVarRegex = /\$[\w\-_\:]+/;
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
    };
	
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
		eXide.util.popup(this.editor, $("#autocomplete-box"), $("#autocomplete-help"), popupItems,
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
	
    Constr.prototype.format = function(doc) {
        var code = doc.getText();
        var h = new JSONParseTreeHandler(code);
        var parser = new XQueryParser(code, h); 
        parser.parse_XQuery();
        var ast = h.getParseTree();
        var codeFormatter = new CodeFormatter(ast);
        var formatted = codeFormatter.format();
        doc.setText(formatted);
    };
    
	Constr.prototype.gotoFunction = function (doc, name) {
		$.log("Goto function %s", name);
        var prefix = this.getModuleNamespacePrefix();
        if (prefix != null) {
			name = name.replace(/[^:]+:/, prefix + ":");
		}
        var len = doc.$session.getLength();
        var lineNb;
        var returnLine = function(regexp) {
            for (var i = 0; i < len; i++) {
                var line = doc.$session.getLine(i);
                if (line.match(regexp)) { return i }
            }
        };  
        var focus = function(lineNb) {
            this.editor.gotoLine(lineNb + 1);
            return this.editor.focus();
        };
        
        if (lineNb = returnLine(new RegExp("function\\s+" + name + "\\s*\\("))) {
            return focus.call(this, lineNb);
        }
        if (lineNb = returnLine(new RegExp("function\\s+" + name + "$"))) {
            return focus.call(this, lineNb);
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
            if (a.source && !b.source)
                return 1;
            else if (b.source && !a.source)
                return -1;
            else
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
            var name = (funcDef.length == 3 ? funcDef[2] : funcDef[1]).replace(this.trimRe,"");
            var status = funcDef.length == 3 ? funcDef[1] : "public";
            var signature =  name + "(" + text.substring(offset, end) + ")"
            if (status.indexOf("%private") !== -1)
                status = "private";
			doc.functions.push({
				type: eXide.edit.Document.TYPE_FUNCTION,
				name: name,
                visibility: status,
                signature: signature,
                sort : "$$" + signature
			});
		}
		var varDefs = text.match(this.varDefRe);
		if (varDefs) {
			for (var i = 0; i < varDefs.length; i++) {
				var v = this.varRe.exec(varDefs[i]);
                var sort = v[1].substr(1).split(":");
                sort.splice(1,0,":$");
                
				doc.functions.push({
					type: eXide.edit.Document.TYPE_VARIABLE,
					name: v[1],
                    sort: "$$" + sort.join("")
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
									source: modules[i].source,
                                    sort : funcs[j].signature
								});
							}
						}
						var vars = modules[i].variables;
						if (vars) {
							for (var j = 0; j < vars.length; j++) {
                                var  sort = vars[j].split(":");
                                sort.splice(1,0,":$"); 
								functions.push({
									type: eXide.edit.Document.TYPE_VARIABLE,
									name: "$" + vars[j],
									source: modules[i].source,
                                    sort : sort.join("")
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
    
    Constr.prototype.initDebugger = function(doc) {
        this.xqDebugger = new eXide.XQueryDebuger(this.editor, doc);
        this.xqDebugger.init();
    }
    
    Constr.prototype.stepOver = function(doc) {
        if (this.xqDebugger) {
            this.xqDebugger.stepOver();
        }
    }
    
    Constr.prototype.stepInto = function(doc) {
        if (this.xqDebugger) {
            this.xqDebugger.stepInto();
        }
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