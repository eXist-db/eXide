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
eXide.namespace("eXide.edit.XQueryModeHelper");

/**
 * XQuery specific helper methods.
 */
eXide.edit.XQueryModeHelper = (function () {
	
	var RE_FUNC_NAME = /^[\$\w:\-_\.]+/;
	
    var SemanticHighlighter = require("lib/visitors/SemanticHighlighter").SemanticHighlighter;
    var XQueryParser = require("lib/XQueryParser").XQueryParser;
    var JSONParseTreeHandler = require("lib/JSONParseTreeHandler").JSONParseTreeHandler;
    var Translator = require("lib/Translator").Translator;
    var CodeFormatter = require("lib/visitors/CodeFormatter").CodeFormatter;
    var Compiler = require("lib/Compiler").Compiler;
    var Range = require("ace/range").Range;
    var Anchor = require("ace/anchor").Anchor;
    var SnippetManager = require("ace/snippets").snippetManager;
    
	Constr = function(editor, menubar) {
		this.parent = editor;
		this.editor = this.parent.editor;
        this.xqDebugger = null;
        
//      this.funcDefRe = /\(:[^)]*:\)|(declare\s+((?:%[\w\:\-]+(?:\([^\)]*\))?\s*)*)function\s+([^\(]+)\()/g;
//      this.varDefRe = /\(:[^)]*:\)|(declare\s+(?:%\w+\s+)*variable\s+\$[^\s;]+)/gm;
        this.funcDefRe = /\(:.*declare.+function.+:\)|(declare\s+((?:%[\w\:\-]+(?:\([^\)]*\))?\s*)*)function\s+([^\(]+)\()/g;
        this.varDefRe = /\(:.*declare.+variable.+:\)|(declare\s+(?:%\w+\s+)*variable\s+\$[^\s;]+)/gm;
        
        this.varRe = /declare\s+(?:%\w+\s+)*variable\s+(\$[^\s;]+)/;
        // this.parseImportRe = /import\s+module\s+namespace\s+[^=]+\s*=\s*["'][^"']+["']\s*at\s+["'][^"']+["']\s*;/g;
        this.parseImportRe = /\(:[^)]*:\)|(import\s+module\s+namespace\s+[^=]+\s*=\s*["'][^"']+["']\s*at\s+["'][^"']+["']\s*;)/g
        this.moduleRe = /import\s+module\s+namespace\s+([^=\s]+)\s*=\s*["']([^"']+)["']\s*at\s+["']([^"']+)["']\s*;/;


		// added to clean function name : 
        this.trimRe = /^[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+|[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
        
        this.addCommand("format", this.format);
        this.addCommand("expandSelection", this.expandSelection);
        this.addCommand("rename", this.rename);
        this.addCommand("extractFunction", this.extractFunction);
        this.addCommand("extractVariable", this.extractVariable);
		this.addCommand("showFunctionDoc", this.showFunctionDoc);
		this.addCommand("gotoDefinition", this.gotoDefinition);
        this.addCommand("gotoSymbol", this.gotoSymbol);
		this.addCommand("locate", this.locate);
		this.addCommand("closeTag", this.closeTag);
        this.addCommand("importModule", this.importModule);
        this.addCommand("quickFix", this.quickFix);
        this.addCommand("debug", this.initDebugger);
        this.addCommand("stepOver", this.stepOver);
        this.addCommand("stepInto", this.stepInto);
        
        var self = this;
        this.menu = $("#menu-xquery").hide();
        menubar.click("#menu-xquery-format", function() {
            self.format(editor.getActiveDocument());
        });
        menubar.click("#menu-xquery-expand", function() {
            self.expandSelection(editor.getActiveDocument());
        });
        menubar.click("#menu-xquery-rename", function() {
            self.rename(editor.getActiveDocument());
        });
        menubar.click("#menu-xquery-extract-function", function() {
            self.extractFunction(editor.getActiveDocument());
        });
        menubar.click("#menu-xquery-extract-variable", function() {
            self.extractVariable(editor.getActiveDocument());
        });
        menubar.click("#menu-xquery-run-test", function() {
            self.runTest(editor.getActiveDocument());
        });
        
        self.validating = null;
        self.validationListeners = [];
	};
	
	// extends ModeHelper
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
	
    Constr.prototype.activate = function() {
        this.menu.show();
        this.parent.updateStatus("");
    };
    
    Constr.prototype.deactivate = function() {
        this.menu.hide();
    };
    
    Constr.prototype.afterValidate = function(context, callback) {
        this.validationListeners.push({context: context, exec: callback});
    };
    
	Constr.prototype.closeTag = function (doc, text, row) {
		var basePath = "xmldb:exist://" + doc.getBasePath();
		var $this = this;
		$.ajax({
			type: "PUT",
			url: "modules/compile.xql",
			data: text,
			contentType: "application/octet-stream",
			headers: {
			    "X-BasePath": basePath
			},
			dataType: "json",
			success: function (data) {
				if (data.result == "fail") {
					var err = parseErrMsg(data.error);
					var tag = /constructor:\s([^\)]+)\)?$/.exec(err.msg);
					if (tag && tag.length > 0) {
						$this.editor.insert(tag[1] + ">");
					} else {
					    tag = /tag:.*;\sexpected:\s(.*)$/.exec(err.msg);
                        if (tag && tag.length > 0) {
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
		var $this = this;
		var basePath = "xmldb:exist://" + doc.getBasePath();
		
        this.xqlint(doc);
        for (var i = 0; i < this.validationListeners.length; i++) {
            var listener = this.validationListeners[i];
            listener.exec.apply(listener.context, [doc]);
        }
        this.validationListeners.length = 0;
        
		$.ajax({
			type: "PUT",
			url: "modules/compile.xql",
			data: code,
			dataType: "json",
			headers: {
			    "X-BasePath": basePath
			},
			contentType: "application/octet-stream",
			success: function (data) {
				var valid = $this.compileError(data, doc);
                if (onComplete) {
				    onComplete.call(this, valid);
                }
			},
			error: function (xhr, status) {
                if (onComplete) {
				    onComplete.call(this, false);
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
                column: err.column,
				text: err.msg,
				type: "error"
			};
			this.parent.updateStatus(err.msg, doc.getPath() + "#" + err.line);
            var annotations = this.clearAnnotations(doc, "error");
            annotations.push(annotation);
			doc.getSession().setAnnotations(annotations);
            return false;
		} else {
			doc.getSession().setAnnotations(this.clearAnnotations(doc, "error"));
			this.parent.updateStatus("");
            return true;
		}
	};
	
    Constr.prototype.xqlint = function(doc) {
        if (doc.ast && doc.lastValidation >= doc.getLastChanged()) {
            return;
        }
        $.log("Running xqlint...");
        var session = doc.getSession();
        var value = doc.getText();    
        var h = new JSONParseTreeHandler(value);
        var parser = new XQueryParser(value, h);
        try {
            parser.parse_XQuery();
        } catch(e) {
            $.log("Error while parsing XQuery: %s", parser.getErrorMessage(e));
            if(e instanceof parser.ParseException) {
                h.closeParseTree();
            }
        }
        try {
            var ast = h.getParseTree();
            var translator = new Translator(ast);
            doc.ast = translator.translate();
            doc.lastValidation = new Date().getTime();

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
            
            var markers = doc.ast.markers;
            var annotations = this.clearAnnotations(doc, "warning");
            for (var i = 0; i < markers.length; i++) {
                if (markers[i].type !== "error") {
                    annotations.push({
                        row: markers[i].pos.sl,
                        column: markers[i].pos.sc,
                        text: markers[i].message,
                        type: markers[i].type,
                        pos: markers[i].pos
                    });
                }
            }
            session.setAnnotations(annotations);
        } catch(e) {
            $.log("Error while processing ast: %s", e.message);
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

	Constr.prototype.autocomplete = function(doc, alwaysShow) {
        this.xqlint(doc);

        if (alwaysShow === undefined) {
            alwaysShow = true;
        }

        var sel   = this.editor.getSelection();
        var session   = doc.getSession();

        var lead = sel.getSelectionLead();
        
        var token = "";
        var mode = "templates";
        var row, start, end;
        var range;
        
        // if text is selected we show templates only
        if (sel.isEmpty()) {
            // try to determine the ast node where the cursor is located
            var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
            
            $.log("Autocomplete AST node: %o; doc: %o", astNode, doc.ast);
            
            if (!astNode) {
                // no ast node: scan preceding text
                mode = "functions";
                row = lead.row;
                line = session.getDisplayLine(lead.row);
                start = lead.column - 1;
                end = lead.column;
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
                }
                if (token.substring(0, 1) == "$") {
                    mode = "variables";
                    token = token.substring(1);
                }
            } else {
                var parent = astNode.getParent;
                if (parent.name === "VarRef" || parent.name === "VarName") {
                    mode = "variables";
                    row = astNode.pos.sl;
                    end = astNode.pos.ec;
                    if (astNode.name === "EQName") {
                        token = astNode.value;
                        start = astNode.pos.sc - 1;
                    } else {
                        start = astNode.pos.sc;
                    }
                    astNode = parent;
                } else {
                    var importStmt = eXide.edit.XQueryUtils.findAncestor(astNode, "Import");
                    var nsDeclStmt = eXide.edit.XQueryUtils.findAncestor(astNode, "NamespaceDecl");
                    if (importStmt) {
                        mode = "modules";
                        if (astNode.name == "NCName") {
                            token = astNode.value;
                        } else if (astNode.name == "URILiteral") {
                            var prefix = eXide.edit.XQueryUtils.findSibling(astNode, "NCName");
                            if (prefix) {
                                token = eXide.edit.XQueryUtils.getValue(prefix);
                            }
                        }
                        
                        row = importStmt.pos.sl;
                        start = importStmt.pos.sc;
                        end = importStmt.pos.ec;
                        var separator = eXide.edit.XQueryUtils.findNext(importStmt, "Separator");
                        if (separator) {
                            end = separator.pos.ec;
                        }
                    } else if (nsDeclStmt) {
                        mode = "namespaces";
                        if (astNode.name == "NCName") {
                            token = astNode.value;
                        } else if (astNode.name == "URILiteral") {
                            var prefix = eXide.edit.XQueryUtils.findSibling(astNode, "NCName");
                            if (prefix) {
                                token = eXide.edit.XQueryUtils.getValue(prefix);
                            }
                        }
                        row = nsDeclStmt.pos.sl;
                        start = nsDeclStmt.pos.sc;
                        end = nsDeclStmt.pos.ec;
                        var separator = eXide.edit.XQueryUtils.findNext(nsDeclStmt, "Separator");
                        if (separator) {
                            end = separator.pos.ec;
                        }
                    } else if (astNode.name == "EQName") {
                        mode = "functions";
                        token = astNode.value;
                        row = astNode.pos.sl;
                        start = astNode.pos.sc;
                        end = astNode.pos.ec;
                    } else {
                        if (!alwaysShow) {
                            return false;
                        }
                        row = lead.row;
                        start = lead.column;
                        end = lead.column;
                    }
                }
            }
            range = new Range(row, start, row, end);
        } else {
            mode = "templates";
            range = null;
        }
        if (!alwaysShow && mode === "templates") {
            // do not show template list if showTemplates == false
            return false;
        }
		$.log("completing token: %s, mode: %s, range: %o", token, mode, range);

		var pos = this.editor.renderer.textToScreenCoordinates(lead.row, lead.column);
        eXide.util.Popup.position(pos);
        
		
		if (mode == "templates") {
			this.templateLookup(doc, token, range, true);
		} else if (mode == "functions") {
			this.functionLookup(doc, token, range, true);
		} else if (mode == "namespaces") {
            this.namespaceLookup(doc, token, range, true);
		} else if (mode == "variables") {
            this.variableLookup(doc, astNode, token, range, true);
		} else {
            this.moduleLookup(doc, token, range, true);   
		}
		return true;
	};
	
    Constr.prototype.variableLookup = function(doc, astNode, prefix, wordrange, complete) {
        if (prefix.substring(0, 1) == "$") {
            prefix = prefix.substring(1);
        }
        $.log("Lookup variable %s", prefix);
        var visitor = new eXide.edit.InScopeVariables(doc.ast, astNode);
        // Create popup menu
		// add function defs
		var popupItems = [];
        var prefixRegex = prefix ? new RegExp("^\\$?" + prefix) : null;
        var variables = visitor.getStack();
        if (variables) {
    		for (var i = 0; i < variables.length; i++) {
                if (!prefix || prefixRegex.test(variables[i])) {
        			var item = { 
        				label: variables[i],
                        template: "$" + variables[i],
        				type: "variable"
        			};
        			popupItems.push(item);
                }
    		}
        }
        for (var i = 0; i < doc.functions.length; i++) {
            if (doc.functions[i].type == "variable" && (!prefix || prefixRegex.test(doc.functions[i].name))) {
                popupItems.push({
                    label: doc.functions[i].name,
                    template: "$" + doc.functions[i].name,
                    type: "variable"
                });
            }
        }
		this.$showPopup(doc, wordrange, popupItems, complete);
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
				
				var regexStr = "^" + prefix;
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
				
				$this.getTemplates(doc, prefix, popupItems);
				
				$this.$showPopup(doc, wordrange, popupItems, complete);
			},
			error: function(xhr, msg) {
				eXide.util.error(msg);
			}
		});
	};
	
	Constr.prototype.templateLookup = function(doc, prefix, wordrange, complete) {
		var popupItems = [];
		this.getTemplates(doc, prefix, popupItems);
		this.$showPopup(doc, wordrange, popupItems, complete);
	};
    
    Constr.prototype.moduleLookup = function(doc, prefix, wordrange, complete) {
        var self = this;
        $.getJSON("modules/find.xql", { prefix: prefix }, function (data) {
            if (data) {
                var popupItems = [];
                for (var i = 0; i < data.length; i++) {
                    var template;
                    if (data[i].at) {
                        template = "import module namespace " + data[i].prefix + "=\"" + data[i].uri + 
                            "\" at \"" + data[i].at + "\";";
                    } else {
                        template = "import module namespace " + data[i].prefix + "=\"" + data[i].uri + "\";";
                    }
                    popupItems.push({
                        type: "template",
                        label: [data[i].prefix, data[i].uri],
                        tooltip: data[i].at,
                        template: template
                    });
                }
                self.$showPopup(doc, wordrange, popupItems, complete);
            }
        });
    };
    
    Constr.prototype.namespaceLookup = function(doc, prefix, wordrange, complete) {
        var self = this;
        $.getJSON("templates/namespaces.json", function(data) {
            if (data) {
                var popupItems = [];
                for (var key in data) {
                    if (!key || key === prefix) {
                        popupItems.push({
                            type: "namespace",
                            label: [key, data[key]],
                            template: "declare namespace " + key + "=\"" + data[key] + "\";"
                        });
                    }
                }
                self.$showPopup(doc, wordrange, popupItems, complete);
            }
        });
    };
	
    Constr.prototype.gotoSymbol = function(doc) {
        var self = this;
        var popupItems = [];
        for (var i = 0; i < doc.functions.length; i++) {
            item = { 
                label: doc.functions[i].signature ? doc.functions[i].signature : doc.functions[i].name,
                name: doc.functions[i].name,
                type: doc.functions[i].type
            };
            if (doc.functions[i].help) {
                item.tooltip = doc.functions[i].help;
            }
            popupItems.push(item);
        };
        if (popupItems.length > 1) {
            var editorWidth = this.parent.getWidth();
            var left = this.parent.getOffset().left;
            eXide.util.Popup.position({ pageX: left, pageY: 40 });
            eXide.util.Popup.show(popupItems, function (selected) {
                if (selected) {
                    self.parent.outline.gotoDefinition(doc, selected.name);
                }
            });
        }
    };
	
	Constr.prototype.$showPopup = function (doc, wordrange, popupItems, complete) {
		// display popup
		var $this = this;
        function apply(selected) {
            if (complete) {
                var expansion = selected.label;
                if (selected.type == "function") {
    				expansion = eXide.util.parseSignature(expansion);
    			} else {
                    expansion = selected.template;   
    			}
                if (wordrange) {
                    $this.editor.getSession().remove(wordrange);
                }
                if (selected.type === "variable") {
                    $this.editor.insert(expansion);
                } else {
                    SnippetManager.insertSnippet($this.editor, expansion);
                }
                if (selected.completion) {
                    $this.autocomplete(doc);
                }
            }
            $.log("template applied");
        }
        if (popupItems.length > 1 || !complete) {
            eXide.util.Popup.show(popupItems, function(selected) {
                if (selected) {
                    apply(selected);
                }
            });
        } else if (popupItems.length == 1) {
            apply(popupItems[0]);
        }
	};
	
	Constr.prototype.getFunctionAtCursor = function (doc, lead) {
        var name;
        var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
        if (astNode) {
            var fcall = eXide.edit.XQueryUtils.findAncestor(astNode, "FunctionCall");
            if (fcall) {
                name = fcall.children[0].value
            }
        }
        
        if (!name) {
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
    		name = line.substring(start, end);
        }
        return name;
	};
	
	Constr.prototype.getVariableAtCursor = function (doc, lead) {
        var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
        if (astNode) {
            var ref = eXide.edit.XQueryUtils.findAncestor(astNode, "VarRef");
            if (ref && astNode.name === "EQName") {
                return astNode.value;
            }
        }
	};
	
	Constr.prototype.showFunctionDoc = function (doc) {
        this.xqlint(doc);
		var sel = this.editor.getSelection();
		var lead = sel.getSelectionLead();
		
		var pos = this.editor.renderer.textToScreenCoordinates(lead.row, lead.column);
        eXide.util.Popup.position(pos);
		var func = this.getFunctionAtCursor(doc, lead);
		this.functionLookup(doc, func, null, false);
	}
	
    Constr.prototype.quickFix = function (doc, row) {
        if (!row) {
            row = this.editor.getCursorPosition().row;
        }
        $.log("Requesting quick fix for %s at %d", doc.getName(), row);
        var pos = this.editor.renderer.textToScreenCoordinates(row, 0);
    	eXide.util.Popup.position(pos);
        
        var resolutions = [];
        var an = doc.getSession().getAnnotations();
        for (var i = 0; i < an.length; i++) {
            if (an[i].row === row) {
                var qf = eXide.edit.XQueryQuickFix.getResolutions(this, this.editor, doc, an[i]);
                $.each(qf, function(j, fix) {
                    resolutions.push({
                        label: fix.action,
                        resolve: fix.resolve,
                        annotation: an[i]
                    });
                });
            }
        }

        if (resolutions.length > 0) {
            var self = this;
            eXide.util.Popup.show(resolutions, function(selected) {
                if (selected) {
                    selected.resolve(self, self.parent, doc, selected.annotation);
                    self.editor.focus();
                }
            });
        } else {
            $.log("No quick fix resolution found");
        }
    };
    
	Constr.prototype.gotoDefinition = function (doc) {
        this.xqlint(doc);
		var sel = this.editor.getSelection();
		var lead = sel.getSelectionLead();
		var funcName = this.getFunctionAtCursor(doc, lead);
		if (funcName) {
			this.parent.outline.gotoDefinition(doc, funcName);
		} else {
		    var varName = this.getVariableAtCursor(doc, lead);
		    if (varName) {
		        this.parent.outline.gotoDefinition(doc, varName);
		    }
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
        var range = this.editor.getSelectionRange();
        var value = doc.getSession().getTextRange(range);    
        if (value.length == 0) {
            eXide.util.error("Please select code to format.");
            return;
        }
        var line = doc.getSession().doc.getLine(range.start.row);
        var startIndent = line.match(/^\s*/)[0];
        var h = new JSONParseTreeHandler(value);
        var parser = new XQueryParser(value, h);
        try {
            parser.parse_XQuery();
            var ast = h.getParseTree();
            
            var codeFormatter = new CodeFormatter(ast, true);
            var formatted = codeFormatter.format();
            var lines = formatted.split(/\n/);
            for (var i = 0; i < lines.length; i++) {
                lines[i] = startIndent + lines[i];
            }
            doc.getSession().replace(range, lines.join("\n"));
        } catch(e) {
            console.log("Error parsing XQuery code: %s", parser.getErrorMessage(e));
            eXide.util.error("Code could not be parsed. Please select a valid code block.");
        }
    };
    
    Constr.prototype.extractVariable = function(doc) {
        this.xqlint(doc);
        // get text of selection
        var range = this.editor.getSelectionRange();
        var value = doc.getSession().getTextRange(range);   
        if (value.length == 0) {
            eXide.util.error("Please select code to extract.");
            return;
        }

        var anchor = new Anchor(doc.getSession().getDocument(), range.start.row, range.start.column);
        
        // disable validation while refactoring
        this.parent.validationEnabled = false;

        var template;
        var currentNode = eXide.edit.XQueryUtils.findNode(doc.ast, 
            {line: range.start.row, col: range.start.column + 1});
        var contextNode = eXide.edit.XQueryUtils.findAncestor(currentNode, ["IntermediateClause", "InitialClause", "ReturnClause"]);
        if (contextNode) {
            template = "let $${1} := " + value.replace("$", "\\$");
        } else {
            contextNode = eXide.edit.XQueryUtils.findAncestor(currentNode, "StatementsAndOptionalExpr");
            contextNode = eXide.edit.XQueryUtils.findChild(contextNode, "Expr");
            if (!contextNode) {
                eXide.util.error("Extract variable: unable to determine context. Giving up.")
                return;
            }
            template = "let $${1} := " + value.replace("$", "\\$") + "\nreturn";
            
        }
        $.log("extract variable: context: %o", contextNode);
        
        this.editor.insert("$");
        
        this.editor.gotoLine(contextNode.pos.sl + 1, contextNode.pos.sc);
        this.editor.insert("\n");
        this.editor.gotoLine(contextNode.pos.sl + 1, contextNode.pos.sc);
        SnippetManager.insertSnippet(this.editor, template);
        this.editor.focus();
        
        var sel = this.editor.getSelection();
        
        sel.toOrientedRange();
        var pos = anchor.getPosition();
        var callRange = new Range(pos.row, pos.column, pos.row, pos.column);
        callRange.cursor = pos;
        
        sel.addRange(callRange);
        
        anchor.detach();
        
        this.parent.validationEnabled = true;
    };
    
    Constr.prototype.extractFunction = function(doc) {
        this.xqlint(doc);
        // get text of selection
        var range = this.editor.getSelectionRange();
        var value = doc.getSession().getTextRange(range);   
        if (value.length == 0) {
            eXide.util.error("Please select code to extract.");
            return;
        }

        // disable validation while refactoring
        this.parent.validationEnabled = false;

        var currentNode = eXide.edit.XQueryUtils.findNode(doc.ast, 
            {line: range.start.row, col: range.start.column + 1});

        // parse selection code to get list of variables which need to be parameters
        var variables = [];
        var h = new JSONParseTreeHandler(value);
        var parser = new XQueryParser(value, h);
        try {
            parser.parse_XQuery();
            var ast = h.getParseTree();
            var translator = new Translator(ast);
            ast = translator.translate();
            
            var markers = ast.markers;
            var vars = {};
            for (var i = 0; i < markers.length; i++) {
                if (markers[i].type === "error") {
                    var matches = /\[XPST0008\]\s"([^"]+)": undeclared variable.*/.exec(markers[i].message);
                    if (matches && matches.length == 2) {
                        vars[matches[1]] = 0;
                    }
                }
            }
            for (var v in vars) {
                variables.push(v);
            }
        } catch(e) {
            eXide.util.error("Not a valid code block: " + parser.getErrorMessage(e));
            return;
        }

        var adder = new eXide.edit.PrologAdder(this.parent, doc);
        var insertRow = adder.getInsertionPoint(currentNode);
        var funcAnchor = new Anchor(doc.getSession().getDocument(), insertRow, 0);

        // remove selected range and replace with parameter list
        this.editor.remove(range);
        var params = "(";
        for (var i = 0; i < variables.length; i++) {
            if (i > 0)
                params += ", ";
            params += "$" + variables[i];
        }
        params += ")";
        this.editor.insert(params);
        // reset cursor
        this.editor.gotoLine(range.start.row, range.start.column);
        // remember cursor position
        var anchor = new Anchor(doc.getSession().getDocument(), range.start.row, range.start.column);
        
        adder.createFunction(variables, value, funcAnchor.getPosition().row);

        this.editor.focus();
        
        var sel = this.editor.getSelection();
        
        sel.toOrientedRange();
        var pos = anchor.getPosition();
        var callRange = new Range(pos.row, pos.column, pos.row, pos.column);
        callRange.cursor = pos;
        
        sel.addRange(callRange);
        
        anchor.detach();
        funcAnchor.detach();

        this.parent.validationEnabled = true;
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
            this.parent.history.push(doc.getPath(), doc.getCurrentLine());
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
				this.parent.history.push(doc.getPath(), doc.getCurrentLine());
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
        var code;
        if (location) {
            var base = doc.getBasePath();
            if (location.lastIndexOf(base, 0) === 0) {
                location = location.substring(base.length + 1);
            } else {
                location = "xmldb:exist://" + location;
            }
        }
        var adder = new eXide.edit.PrologAdder(this.parent, doc);
        adder.importModule(prefix, uri, location);
    }
    
    Constr.prototype.expandSelection = function(doc) {
        this.xqlint(doc);
        var sel   = this.editor.getSelection();
        var selRange = sel.getRange();

        // try to determine the ast node where the cursor is located
        var astNode;
        if (selRange.start.column == selRange.end.column && selRange.start.line == selRange.end.line) {
            astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: selRange.start.row, col: selRange.start.column });
        } else {
            astNode = eXide.edit.XQueryUtils.findNodeForRange(doc.ast, { line: selRange.start.row, col: selRange.start.column }, 
                { line: selRange.end.row, col: selRange.end.column });
        }

        if (astNode) {
            var parent = astNode.getParent;
            while (parent && eXide.edit.XQueryUtils.samePosition(astNode.pos, parent.pos)) {
                astNode = parent;
                parent = parent.getParent;
                if (!parent) {
                    break;
                }
            }

            var range = new Range(parent.pos.sl, parent.pos.sc, parent.pos.el, parent.pos.ec);
            sel.setSelectionRange(range);
        }
    };
    
    /**
     * Rename variable or function call.
     */
    Constr.prototype.rename = function(doc) {
        
        function doRename(references) {
            sel.toOrientedRange();
            $.each(references, function(i, node) {
                var range = new Range(node.pos.sl, node.pos.sc, node.pos.el, node.pos.ec);
                range.cursor = range.end;
                sel.addRange(range);
            });
            self.editor.focus();
        }
        
        this.xqlint(doc);
        var self = this;
        var sel = this.editor.getSelection();
        var lead = sel.getSelectionLead();
        var ast = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
        if (ast) {
            if (ast.name == "QName" && ast.getParent.name == "DirElemConstructor") {
                var tags = eXide.edit.XQueryUtils.findSiblings(ast, "QName");
                tags.push(ast);
                doRename(tags);
            } else if (ast.getParent.name == "VarName" || ast.getParent.name == "Param") {
                var varName = eXide.edit.XQueryUtils.getValue(ast);
                var ancestor = eXide.edit.XQueryUtils.findVariableContext(ast, varName);
                if (ancestor) {
                    var references = new eXide.edit.VariableReferences(varName, ancestor).getReferences();
                    doRename(references);
                } else {
                    eXide.util.message("Rename failed: unable to determine context, sorry.");
                }
            } else if (ast.name == "EQName" && (ast.getParent.name == "FunctionDecl" || ast.getParent.name == "FunctionCall")) {
                var funName = ast.value;
                var arity = parseInt(ast.getParent.arity);
                $.log("searching calls to function: %s#%d", funName, arity);
                var calls = new eXide.edit.FunctionCalls(funName, arity, doc.ast);
                var refs = calls.getReferences();
                if (calls.declaration) {
                    refs.push(calls.declaration);
                    doRename(refs);
                } else {
                    eXide.util.message("Rename failed: function declaration not found.");
                }

            } else {
                eXide.util.message("Please position cursor within variable or function name.");
            }
        } else {
            eXide.util.message("Rename failed: node not found in syntax tree, sorry.");
        }
    };
    
    Constr.prototype.runTest = function(doc) {
        var self = this;
        this.xqlint(doc);
        var info = new eXide.edit.ModuleInfo(doc.ast);
        if (info.isModule() && info.hasTests()) {
            $.ajax({
                type: "POST",
                url: "modules/run-test.xql",
                data: { source: doc.getPath() },
                dataType: "html",
                success: function (html) {
					self.parent.updateStatus("");
					self.parent.clearErrors();
					eXide.app.showResultsPanel();
                    $('.results-container .results').empty().append(html);
				},
				error: function (xhr, status) {
					eXide.util.error(xhr.responseText, "Server Error");
				}
            })
        }
    };
    
    Constr.prototype.createOutline = function(doc, onComplete) {
        var code = doc.getText();
		this.$parseLocalFunctions(code, doc);
//        if (onComplete)
//            onComplete(doc);
		var imports = this.$parseImports(code);
		if (imports)
			this.$resolveImports(doc, imports, onComplete);
        else
            onComplete(doc);
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
        
        var match =  this.funcDefRe.exec(text), 
            funcDef,
            varDef;

        while ((funcDef = match) != null) {
            if(funcDef[1] != null ) {
                var offset = this.funcDefRe.lastIndex;
                var end = this.$findMatchingParen(text, offset);
                var name = (funcDef.length == 4 ? funcDef[3] : funcDef[2]).replace(this.trimRe,"");
                var status = funcDef.length == 4 ? funcDef[2] : "public";
                var signature =  name + "(" + text.substring(offset, end) + ")"
                if (status.indexOf("%private") !== -1) {status = "private";}
                doc.functions.push({
                    type: eXide.edit.Document.TYPE_FUNCTION,
                    name: name,
                    visibility: status,
                    signature: signature,
                    sort : "$$" + signature
                });
            };
            match = this.funcDefRe.exec(text);
        }

        match =  this.varDefRe.exec(text);
        while ((varDef = match) != null) {
            if(varDef[1] != null ) {
                var v = this.varRe.exec(varDef[1]);
                var sort = v[1].substr(1).split(":");
                sort.splice(1,0,":$");
                var name = v[1];
                if (name.substring(0, 1) == "$") {
                    name = name.substring(1);
                }
                doc.functions.push({
                    type: eXide.edit.Document.TYPE_VARIABLE,
                    name: name,
                    sort: "$$" + sort.join("")
                });
            }
            match = this.varDefRe.exec(text);
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
        var ret = [], 
            re = this.parseImportRe,
            match = re.exec(code);

        // put Group capture in ret
        while (match != null) {
            if( match[1] != null ) {ret.push(match[1])};
            match = re.exec(code);
        }
        return ret
		// return code.match(this.parseImportRe);
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
									name: vars[j],
									source: modules[i].source,
                                    sort : sort.join("")
								});
							}
						}
					}
					doc.functions = doc.functions.concat(functions);
					$this.$sortFunctions(doc);
				}
                if (onComplete)
                    onComplete(doc);
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
        var column = error.column || 0;
		return { line: line, column: parseInt(column), msg: msg };
	}
	
	return Constr;
}());