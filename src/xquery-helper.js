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
	
    // REx parser + adapter loaded as globals from src/parser/ (concatenated before this file)
    var rexAdapter = rexParserAdapter;
    function semanticHighlight(ast) {
        var tokens = {};
        function visit(node) {
            if (node.name === "EQName" || node.name === "NCName") {
                var row = node.pos.sl;
                if (!tokens[row]) tokens[row] = [];
                tokens[row].push({
                    sl: node.pos.sl, sc: node.pos.sc,
                    el: node.pos.el, ec: node.pos.ec,
                    type: "support.function"
                });
                return;
            }
            if (node.children) {
                for (var i = 0; i < node.children.length; i++) visit(node.children[i]);
            }
        }
        visit(ast);
        return tokens;
    }
    // staticAnalysis loaded as global from src/static-analysis.js (concatenated before this file)
    // Code formatting handled by prettierFormat (src/prettier-format.js)

    // CM6 editor utilities (editorUtils global from src/editor-utils.js)
    
	Constr = function(editor, menubar) {
		this.parent = editor;
		this.editor = this.parent.editor;
        this.xqDebugger = null;
        
        this.funcDefRe = /\(:.*declare.+function.+:\)|(declare\s+((?:%[\w\:\-]+(?:\([^\)]*\))?\s*)*)function\s+([^\(]+)\()/g;
        this.varDefRe = /\(:.*declare.+variable.+:\)|(declare\s+(?:%\w+\s+)*variable\s+\$[^\s;]+)/gm;
        this.varRe = /declare\s+(?:%\w+\s+)*variable\s+(\$[^\s;]+)/;
        this.parseImportRe = /\(:[^)]*:\)|(import\s+module\s+namespace\s+[^=]+\s*=\s*["'][^"']+["']\s*at\s+["'][^"']+["']\s*;)/g
        this.moduleRe = /import\s+module\s+namespace\s+([^=\s]+)\s*=\s*["']([^"']+)["']\s*at\s+["']([^"']+)["']\s*;/;


		// added to clean function name : 
        this.trimRe = /^[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+|[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
        
        this.addCommand("expandSelection", this.expandSelection);
        this.addCommand("rename", this.rename);
        this.addCommand("extractFunction", this.extractFunction);
        this.addCommand("extractVariable", this.extractVariable);
		this.addCommand("showFunctionDoc", this.showFunctionDoc);
		this.addCommand("gotoDefinition", this.gotoDefinition);
        this.addCommand("findReferences", this.findReferences);
        this.addCommand("gotoSymbol", this.gotoSymbol);
		this.addCommand("locate", this.locate);
        this.addCommand("format", this.format);
		this.addCommand("closeTag", this.closeTag);
        this.addCommand("importModule", this.importModule);
        this.addCommand("quickFix", this.quickFix);
        this.addCommand("debug", this.initDebugger);
        this.addCommand("stepOver", this.stepOver);
        this.addCommand("stepInto", this.stepInto);
        
        var self = this;
        this.menu = document.getElementById("menu-xquery");
        this.menu.style.display = "none";
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
        this.menu.style.display = "";
        this.parent.updateStatus("");
    };

    Constr.prototype.deactivate = function() {
        this.menu.style.display = "none";
    };
    
    Constr.prototype.afterValidate = function(context, callback) {
        this.validationListeners.push({context: context, exec: callback});
    };
    
	Constr.prototype.closeTag = function (doc, text, row) {
		var basePath = "xmldb:exist://" + doc.getBasePath();
		var $this = this;
		fetch("api/query/compile", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: text, base: basePath })
		})
		.then(function(response) { return response.json(); })
		.then(function(data) {
			if (data.errors && data.errors.length > 0) {
				var err = data.errors[0];
				var msg = err.message || "";
				var tag = /constructor:\s([^\)]+)\)?$/.exec(msg);
				if (tag && tag.length > 0) {
					var insertText = tag[1] + ">";
					var insertPos = $this.editor.state.selection.main.head;
					$this.editor.dispatch({ changes: { from: insertPos, insert: insertText }, selection: { anchor: insertPos + insertText.length } });
				} else {
					tag = /tag:.*;\sexpected:\s(.*)$/.exec(msg);
					if (tag && tag.length > 0) {
						var insertText2 = tag[1] + ">";
						var insertPos2 = $this.editor.state.selection.main.head;
						$this.editor.dispatch({ changes: { from: insertPos2, insert: insertText2 }, selection: { anchor: insertPos2 + insertText2.length } });
					}
				}
			}
		})
		.catch(function() {});
	}
		
	Constr.prototype.validate = function(doc, code, onComplete) {
		var $this = this;
		var basePath = "xmldb:exist://" + doc.getBasePath();
		
        this.parseXQuery(doc);
        for (var i = 0; i < this.validationListeners.length; i++) {
            var listener = this.validationListeners[i];
            listener.exec.apply(listener.context, [doc]);
        }
        this.validationListeners.length = 0;
        
		fetch("api/query/compile", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query: code, base: basePath, uri: doc.getPath() || "untitled" })
		})
		.then(function(response) { return response.json(); })
		.then(function(data) {
			var valid = $this.compileError(data, doc);
			if (onComplete) {
				onComplete.call(null, valid);
			}
		})
		.catch(function(err) {
			if (onComplete) {
				onComplete.call(null, false);
			}
			console.log("Compile error: %s", err);
		});
	}
	
	/*
	 * New API response: { "errors": [{ "line": 52, "column": 43, "message": "...", "code": "..." }] }
	 */
	Constr.prototype.compileError = function(data, doc) {
		if (data.errors && data.errors.length > 0) {
			var err = data.errors[0];
			var line = (err.line || 0) - 1;
			var column = err.column || 0;
			var msg = err.message || err.code || "Unknown error";
			// lsp:diagnostics() may return line 0 for all errors;
			// fall back to parsing the location from the message text
			if (line <= 0 && msg) {
				var locMatch = msg.match(/\[at line (\d+), column (\d+)/);
				if (locMatch) {
					line = parseInt(locMatch[1], 10) - 1;
					column = parseInt(locMatch[2], 10);
				}
			}
			var annotation = {
				row: line,
                column: column,
				text: msg,
				type: "error"
			};
			this.parent.updateStatus(msg, doc.getPath() + "#" + (line + 1));
            var annotations = this.clearAnnotations(doc, "error");
            annotations.push(annotation);
			editorUtils.setAnnotations(this.editor, annotations);
            return false;
		} else {
			editorUtils.setAnnotations(this.editor, this.clearAnnotations(doc, "error"));
			this.parent.updateStatus("");
            return true;
		}
	};
	
    Constr.prototype.parseXQuery = function(doc) {
        if (doc.ast && doc.lastParsed >= doc.getLastChanged()) {
            return;
        }
        var value = doc.getText();
        var self = this;
        var versionPref = (typeof eXide !== 'undefined' && eXide.app && eXide.app.getPreference)
            ? eXide.app.getPreference("xqueryVersion") : "auto";
        var selection = parserRegistry.getParser(value, versionPref);
        var result = rexAdapter.parseXQuery(value, selection.parser);
        doc.xqueryVersion = selection.version;

        // Refresh status bar to show detected XQuery version
        if (typeof eXide !== 'undefined' && eXide.app && eXide.app.updateStatus) {
            eXide.app.updateStatus(doc);
        }

        // If 4.0 parser is still loading, re-parse when it arrives
        if (selection.pending) {
            parserRegistry.loadParser40().then(function () {
                doc.lastParsed = 0; // force re-parse
                self.parseXQuery(doc);
            }).catch(function (err) {
                console.warn("Failed to load XQuery 4.0 parser:", err.message);
            });
        }

        if (result.error) {
            console.debug("Error while parsing XQuery: %s", result.error);
        }
        try {
            doc.ast = result.ast;
            doc.ast.markers = [];
            doc.lastParsed = new Date().getTime();

            try {
                var analysisResult = staticAnalysis.analyze(result.ast);
                doc.ast.markers = analysisResult.markers;
            } catch(te) {
                console.log("Static analysis error (non-fatal): %s", te.message);
            }

            eXide.edit.SemanticHighlight.update(this.editor, doc.ast);

            var markers = doc.ast.markers;
            if (markers) {
                // Clear previous client-side markers (both warnings and errors)
                // but keep any server-side compile errors that are still relevant
                var annotations = [];
                for (var i = 0; i < markers.length; i++) {
                    annotations.push({
                        row: markers[i].pos.sl,
                        column: markers[i].pos.sc,
                        text: markers[i].message,
                        type: markers[i].type,
                        pos: markers[i].pos
                    });
                }
                editorUtils.setAnnotations(this.editor, annotations);
            }
        } catch(e) {
            console.log("Error while processing ast: %s", e.message);
        }
    };
    
    Constr.prototype.clearAnnotations = function(doc, type) {
        var na = [];
        var a = editorUtils.getAnnotations(this.editor);
        for (var i = 0; i < a.length; i++) {
            if (a[i].type !== type) {
                na.push(a[i]);
            }
        }
        return na;
    };

    Constr.prototype.gotoSymbol = function(doc) {
        var self = this;
        var code = this.editor.state.doc.toString();
        var basePath = "xmldb:exist://" + (doc.getBasePath ? doc.getBasePath() : "/db");

        fetch("api/query/symbols", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: code, base: basePath })
        })
        .then(function (response) { return response.json(); })
        .then(function (symbols) {
            if (!symbols || !symbols.length) return;
            var items = symbols.map(function (sym) {
                return {
                    // detail has the full signature for functions; name for variables
                    label: sym.detail || sym.name,
                    name: sym.name,
                    line: sym.line,
                    column: sym.column
                };
            });
            eXide.util.QuickPicker.show(items, function (selected) {
                if (selected) {
                    // lsp:symbols() returns 0-based line; gotoLine expects 1-based
                    editorUtils.gotoLine(self.editor, selected.line + 1, selected.column, true);
                }
            }, { placeholder: "Go to symbol\u2026", parentEditor: self.editor });
        })
        .catch(function () {
            // Fall back to AST-based symbol list
            var items = doc.functions.map(function (f) {
                return {
                    label: f.signature || f.name,
                    name: f.name,
                    line: f.row,
                    column: 0
                };
            });
            if (items.length > 0) {
                eXide.util.QuickPicker.show(items, function (selected) {
                    if (selected) {
                        editorUtils.gotoLine(self.editor, selected.line + 1, 0, true);
                    }
                }, { placeholder: "Go to symbol\u2026", parentEditor: self.editor });
            }
        });
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
    		var lineNum = row + 1;
    		var line = (lineNum >= 1 && lineNum <= this.editor.state.doc.lines) ? this.editor.state.doc.line(lineNum).text : "";
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
        this.parseXQuery(doc);
		var self = this;
		var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
		var func = this.getFunctionAtCursor(doc, lead);
		if (!func) {
			eXide.util.message("Place cursor on a function name first.");
			return;
		}

		// Build request params for /api/editor/completions
		var params = new URLSearchParams({ prefix: func });

		// Extract module imports so completions API can search imported functions too
		var code = doc.getText();
		var imports = this.$parseImports(code);
		if (imports) {
			var basePath = "xmldb:exist://" + doc.getBasePath();
			params.set("base", basePath);
			for (var i = 0; i < imports.length; i++) {
				var matches = this.moduleRe.exec(imports[i]);
				if (matches != null && matches.length == 4) {
					params.append("mprefix", matches[1]);
					params.append("uri", matches[2]);
					params.append("source", matches[3]);
				}
			}
		}

		fetch("api/editor/completions?" + params.toString())
		.then(function(response) { return response.json(); })
		.then(function(serverFuncs) {
			// Merge local functions (from AST parse) with server results
			var items = [];
			var regex = new RegExp("^" + func.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			doc.functions.forEach(function(f) {
				if (f.type !== "variable" && f.name && f.name.match(regex)) {
					// Normalize local functions to the completions API shape
					items.push({
						text: f.signature || f.name,
						snippet: f.template || null,
						type: "function",
						description: null,
						arguments: [],
						leftLabel: null,
						source: f.source || doc.getPath(),
						// Preserve legacy help HTML for local functions
						help: f.help || null
					});
				}
			});
			if (serverFuncs) items = items.concat(serverFuncs);
			if (items.length === 0) {
				eXide.util.message("No documentation found for " + func);
				return;
			}
			eXide.edit.FuncDocTooltip.show(self.editor, items, function(selected) {
				if (selected) {
					var template = selected.snippet || selected.template;
					if (template) {
						editorUtils.insertSnippet(self.editor, template);
					}
				}
			});
		})
		.catch(function(e) {
			console.log("Error fetching function docs: %s", e.message);
			eXide.util.error("Could not load function documentation: " + e.message);
		});
	}
	
    Constr.prototype.quickFix = function (doc, row) {
        if (!row) {
            row = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head).row;
        }
        var resolutions = [];
        var an = editorUtils.getAnnotations(this.editor);
        for (var i = 0; i < an.length; i++) {
            if (an[i].row === row) {
                var qf = eXide.edit.XQueryQuickFix.getResolutions(this, this.editor, doc, an[i]);
                qf.forEach(function(fix) {
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
            eXide.util.QuickPicker.show(resolutions, function(selected) {
                if (selected) {
                    selected.resolve(self, self.parent, doc, selected.annotation);
                }
                self.editor.focus();
            }, { placeholder: "Quick fix\u2026", parentEditor: self.editor });
        }
    };
    
	Constr.prototype.gotoDefinition = function (doc) {
        var self = this;
        var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        var code = this.editor.state.doc.toString();
        var basePath = "xmldb:exist://" + (doc.getBasePath ? doc.getBasePath() : "/db");

        fetch("api/query/definition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: code,
                line: lead.row,      // 0-based
                column: lead.column, // 0-based
                base: basePath
            })
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (data && data.line !== undefined) {
                if (data.uri) {
                    // Cross-module definition: open the target module
                    var targetPath = data.uri;
                    var resource = {
                        path: targetPath,
                        name: targetPath.replace(/^.*\//, ""),
                        writable: true,
                        line: data.line + 1  // gotoLine expects 1-based
                    };
                    eXide.app.$doOpenDocument(resource);
                } else {
                    // Same-file definition: jump to the line
                    editorUtils.gotoLine(self.editor, data.line + 1, data.column, true);
                }
            } else {
                // Fall back to AST-based local definition lookup
                self.parseXQuery(doc);
                var funcName = self.getFunctionAtCursor(doc, lead);
                if (funcName) {
                    self.parent.outline.gotoDefinition(doc, funcName);
                } else {
                    var varName = self.getVariableAtCursor(doc, lead);
                    if (varName) {
                        self.parent.outline.gotoDefinition(doc, varName);
                    }
                }
            }
        })
        .catch(function () {
            // Network error: fall back to AST lookup
            self.parseXQuery(doc);
            var funcName = self.getFunctionAtCursor(doc, lead);
            if (funcName) {
                self.parent.outline.gotoDefinition(doc, funcName);
            }
        });
	}
	
    Constr.prototype.findReferences = function (doc) {
        var self = this;
        var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        var code = this.editor.state.doc.toString();
        var basePath = "xmldb:exist://" + (doc.getBasePath ? doc.getBasePath() : "/db");

        fetch("api/query/references", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: code,
                line: lead.row,
                column: lead.column,
                base: basePath
            })
        })
        .then(function (response) { return response.json(); })
        .then(function (refs) {
            if (!Array.isArray(refs) || refs.length === 0) {
                // Fall back to AST-based references
                self.parseXQuery(doc);
                refs = [];
                var funcName = self.getFunctionAtCursor(doc, lead);
                if (funcName) {
                    // Find arity from the FunctionCall node
                    var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
                    var fcall = astNode ? eXide.edit.XQueryUtils.findAncestor(astNode, "FunctionCall") : null;
                    var arity = fcall ? (fcall.arity || 0) : 0;
                    var visitor = new eXide.edit.FunctionCalls(funcName, arity, doc.ast);
                    refs = visitor.getReferences().map(function (ref) {
                        return { line: ref.pos.sl, column: ref.pos.sc, name: funcName, kind: "function" };
                    });
                    if (visitor.declaration) {
                        refs.unshift({ line: visitor.declaration.pos.sl, column: visitor.declaration.pos.sc, name: funcName, kind: "function" });
                    }
                } else {
                    var varName = self.getVariableAtCursor(doc, lead);
                    if (varName) {
                        var name = varName.replace(/^\$/, "");
                        var varVisitor = new eXide.edit.VariableReferences(name, doc.ast);
                        refs = varVisitor.getReferences().map(function (ref) {
                            return { line: ref.pos.sl, column: ref.pos.sc, name: "$" + name, kind: "variable" };
                        });
                    }
                }
            }

            if (!refs || refs.length === 0) {
                eXide.util.message("No references found.");
                return;
            }

            var items = refs.map(function (ref) {
                return {
                    label: (ref.kind === "variable" ? ref.name : ref.name) +
                           " \u2014 line " + (ref.line + 1),
                    line: ref.line,
                    column: ref.column
                };
            });

            eXide.util.QuickPicker.show(items, function (selected) {
                if (selected) {
                    editorUtils.gotoLine(self.editor, selected.line + 1, selected.column, true);
                }
            }, { placeholder: "References (" + items.length + " found)\u2026", parentEditor: self.editor });
        })
        .catch(function (err) {
            console.error("[findReferences] error:", err);
            eXide.util.message("Failed to find references.");
        });
    };

	Constr.prototype.locate = function(doc, type, name) {
		switch (type) {
		case "function":
			this.gotoFunction(doc, name);
			break;
		default:
			this.gotoVarDecl(doc, name);
		}
	}
	
    Constr.prototype.extractVariable = function(doc) {
        this.parseXQuery(doc);
        // get text of selection
        var sel = this.editor.state.selection.main;
        var range = { start: editorUtils.offsetToRowCol(this.editor.state, sel.from), end: editorUtils.offsetToRowCol(this.editor.state, sel.to) };
        var rangeFrom = editorUtils.rowColToOffset(this.editor.state, range.start.row, range.start.column);
        var rangeTo = editorUtils.rowColToOffset(this.editor.state, range.end.row, range.end.column);
        var value = this.editor.state.sliceDoc(rangeFrom, rangeTo);
        if (value.length == 0) {
            eXide.util.error("Please select code to extract.");
            return;
        }

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
        console.log("extract variable: context: %o", contextNode);

        var dollarPos = this.editor.state.selection.main.head;
        this.editor.dispatch({ changes: { from: dollarPos, insert: "$" }, selection: { anchor: dollarPos + 1 } });

        editorUtils.gotoLine(this.editor, contextNode.pos.sl + 1, contextNode.pos.sc);
        var nlPos = this.editor.state.selection.main.head;
        this.editor.dispatch({ changes: { from: nlPos, insert: "\n" }, selection: { anchor: nlPos + 1 } });
        editorUtils.gotoLine(this.editor, contextNode.pos.sl + 1, contextNode.pos.sc);
        editorUtils.insertSnippet(this.editor, template);
        this.editor.focus();

        this.parent.validationEnabled = true;
    };
    
    Constr.prototype.extractFunction = function(doc) {
        this.parseXQuery(doc);
        // get text of selection
        var sel = this.editor.state.selection.main;
        var range = { start: editorUtils.offsetToRowCol(this.editor.state, sel.from), end: editorUtils.offsetToRowCol(this.editor.state, sel.to) };
        var rangeFrom = editorUtils.rowColToOffset(this.editor.state, range.start.row, range.start.column);
        var rangeTo = editorUtils.rowColToOffset(this.editor.state, range.end.row, range.end.column);
        var value = this.editor.state.sliceDoc(rangeFrom, rangeTo);
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
        var versionPref2 = (typeof eXide !== 'undefined' && eXide.app && eXide.app.getPreference)
            ? eXide.app.getPreference("xqueryVersion") : "auto";
        var selection2 = parserRegistry.getParser(value, versionPref2);
        var result = rexAdapter.parseXQuery(value, selection2.parser);
        if (result.error) {
            eXide.util.error("Not a valid code block: " + (result.error.message || result.error));
            return;
        }
        try {
            var analysisResult = staticAnalysis.analyze(result.ast);
            result.ast.markers = analysisResult.markers;
            var ast = result.ast;

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
            eXide.util.error("Not a valid code block: " + e.message);
            return;
        }

        var adder = new eXide.edit.PrologAdder(this.parent, doc);
        var insertRow = adder.getInsertionPoint(currentNode);

        // remove selected range and replace with parameter list
        var removeFrom = editorUtils.rowColToOffset(this.editor.state, range.start.row, range.start.column);
        var removeTo = editorUtils.rowColToOffset(this.editor.state, range.end.row, range.end.column);
        this.editor.dispatch({ changes: { from: removeFrom, to: removeTo } });
        var params = "(";
        for (var i = 0; i < variables.length; i++) {
            if (i > 0)
                params += ", ";
            params += "$" + variables[i];
        }
        params += ")";
        var insertPos = this.editor.state.selection.main.head;
        this.editor.dispatch({ changes: { from: insertPos, insert: params }, selection: { anchor: insertPos + params.length } });
        // reset cursor
        editorUtils.gotoLine(this.editor, range.start.row + 1, range.start.column);

        adder.createFunction(variables, value, insertRow);

        this.editor.focus();

        this.parent.validationEnabled = true;
    };
    
	Constr.prototype.gotoFunction = function (doc, name) {
		console.log("Goto function %s", name);
        var prefix = this.getModuleNamespacePrefix();
        if (prefix != null) {
			name = name.replace(/[^:]+:/, prefix + ":");
		}
        var lines = [];
        for (var i = 1; i <= this.editor.state.doc.lines; i++) { lines.push(this.editor.state.doc.line(i).text); }
        var len = lines.length;
        var lineNb;
        var returnLine = function(regexp) {
            for (var i = 0; i < len; i++) {
                if (lines[i].match(regexp)) { return i }
            }
        };
        var focus = function(lineNb) {
            this.parent.history.push(doc.getPath(), doc.getCurrentLine());
            editorUtils.gotoLine(this.editor, lineNb + 1);
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
		
		console.log("Goto variable declaration %s", name);
		var regexp = new RegExp("variable\\s+\\" + name);
		var lines = [];
		for (var li = 1; li <= this.editor.state.doc.lines; li++) { lines.push(this.editor.state.doc.line(li).text); }
		for (var i = 0; i < lines.length; i++) {
			if (lines[i].match(regexp)) {
				this.parent.history.push(doc.getPath(), doc.getCurrentLine());
				editorUtils.gotoLine(this.editor, i + 1);
				this.editor.focus();
				return;
			}
		}
	}
	
	Constr.prototype.getModuleNamespacePrefix = function () {
		var moduleRe = /^\s*module\s+namespace\s+([^=\s]+)\s*=/;
		var lines = [];
		for (var li = 1; li <= this.editor.state.doc.lines; li++) { lines.push(this.editor.state.doc.line(li).text); }
		for (var i = 0; i < lines.length; i++) {
			var matches = lines[i].match(moduleRe);
			if (matches) {
				return matches[1];
			}
		}
		return null;
	}
	
    Constr.prototype.importModule = function (doc, prefix, uri, location) {
        console.log("location = %s path = %s", location, doc.path);
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
        this.parseXQuery(doc);
        var selMain = this.editor.state.selection.main;
        var selRange = { start: editorUtils.offsetToRowCol(this.editor.state, selMain.from), end: editorUtils.offsetToRowCol(this.editor.state, selMain.to) };

        // try to determine the ast node where the cursor is located
        var astNode;
        if (selRange.start.column == selRange.end.column && selRange.start.row == selRange.end.row) {
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

            var selFrom = editorUtils.rowColToOffset(this.editor.state, parent.pos.sl, parent.pos.sc);
            var selTo = editorUtils.rowColToOffset(this.editor.state, parent.pos.el, parent.pos.ec);
            this.editor.dispatch({ selection: { anchor: selFrom, head: selTo } });
        }
    };
    
    /**
     * Rename variable or function call.
     */
    Constr.prototype.rename = function(doc) {

        function doRename(references) {
            if (references.length === 0) return;
            // Create a multi-cursor selection covering all references
            var ranges = [];
            for (var i = 0; i < references.length; i++) {
                var node = references[i];
                var from = editorUtils.rowColToOffset(self.editor.state, node.pos.sl, node.pos.sc);
                var to = editorUtils.rowColToOffset(self.editor.state, node.pos.el, node.pos.ec);
                ranges.push(CM6.EditorSelection.range(from, to));
            }
            // Sort by position (required by EditorSelection)
            ranges.sort(function(a, b) { return a.from - b.from; });
            self.editor.dispatch({ selection: CM6.EditorSelection.create(ranges) });
            self.editor.focus();
            eXide.util.message("Editing " + references.length + " occurrence" + (references.length > 1 ? "s" : "") + " — type to rename.");
        }

        this.parseXQuery(doc);
        var self = this;
        var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        var ast = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
        if (ast) {
            // XML element tag rename: cursor lands on EQName inside QName inside DirElemConstructor
            var dirElem = eXide.edit.XQueryUtils.findAncestor(ast, "DirElemConstructor");
            if (dirElem && ast.name == "EQName" && ast.getParent.name == "QName" && ast.getParent.getParent.name == "DirElemConstructor") {
                // Collect the open/close tag QNames (direct children of DirElemConstructor, skip attribute QNames)
                var tagNames = [];
                for (var t = 0; t < dirElem.children.length; t++) {
                    if (dirElem.children[t].name === "QName") {
                        tagNames.push(dirElem.children[t]);
                    }
                }
                doRename(tagNames);
            } else if (ast.getParent.name == "VarName" || ast.getParent.name == "Param"
                    || (ast.name == "TOKEN" && ast.value == "$" && ast.getParent.name == "VarRef")) {
                // If cursor is on the $ token, navigate to the EQName inside VarName
                var varNode = ast;
                if (ast.name == "TOKEN" && ast.getParent.name == "VarRef") {
                    varNode = eXide.edit.XQueryUtils.findChild(ast.getParent, "VarName");
                    if (varNode) varNode = eXide.edit.XQueryUtils.findChild(varNode, "EQName") || varNode;
                }
                var varName = eXide.edit.XQueryUtils.getValue(varNode);
                var ancestor = eXide.edit.XQueryUtils.findVariableContext(varNode, varName);
                if (ancestor) {
                    var references = new eXide.edit.VariableReferences(varName, ancestor).getReferences();
                    doRename(references);
                } else {
                    eXide.util.message("Rename failed: unable to determine context, sorry.");
                }
            } else if (ast.name == "EQName" && (ast.getParent.name == "FunctionDecl" || ast.getParent.name == "FunctionCall")) {
                var funName = ast.value;
                var arity = parseInt(ast.getParent.arity);
                console.log("searching calls to function: %s#%d", funName, arity);
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
        this.parseXQuery(doc);
        var info = new eXide.edit.ModuleInfo(doc.ast);
        if (info.isModule() && info.hasTests()) {
            fetch("api/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: doc.getPath() })
            })
            .then(function(response) { return response.json(); })
            .then(function(data) {
                self.parent.updateStatus("");
                self.parent.clearErrors();
                eXide.app.showResultsPanel();
                var results = document.querySelector(".results-container .results");
                if (results) {
                    results.innerHTML = self.renderTestResults(data);
                }
            })
            .catch(function(err) {
                eXide.util.error(String(err), "Server Error");
            })
        }
    };

    Constr.prototype.renderTestResults = function(data) {
        if (data.error) {
            return '<div class="test-error">' + escapeHtml(data.error) + '</div>';
        }
        var html = '<div class="test-summary">';
        html += '<span class="test-count">' + data.tests + ' tests</span>';
        if (data.failures > 0) html += ', <span class="test-failures">' + data.failures + ' failures</span>';
        if (data.errors > 0) html += ', <span class="test-errors">' + data.errors + ' errors</span>';
        if (data.time) html += ' (' + data.time + ')';
        html += '</div>';
        html += '<table class="test-results"><thead><tr><th>Test</th><th>Status</th><th>Details</th></tr></thead><tbody>';
        if (data.testcases) {
            for (var i = 0; i < data.testcases.length; i++) {
                var tc = data.testcases[i];
                var status = tc.failure ? 'failure' : (tc.error ? 'error' : 'pass');
                var detail = '';
                if (tc.failure) detail = tc.failure.message || tc.failure.detail || '';
                if (tc.error) detail = tc.error.message || tc.error.detail || '';
                html += '<tr class="test-' + status + '">';
                html += '<td>' + escapeHtml(tc.name) + '</td>';
                html += '<td>' + status + '</td>';
                html += '<td>' + escapeHtml(detail) + '</td>';
                html += '</tr>';
            }
        }
        html += '</tbody></table>';
        return html;
    };
    
    Constr.prototype.createOutline = function(doc, onComplete) {
        var code = doc.getText();
        var basePath = "xmldb:exist://" + (doc.getBasePath ? doc.getBasePath() : "/db");
        var imports = this.$parseImports(code);
        var self = this;

        doc.functions = [];

        fetch("api/query/symbols", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: code, base: basePath })
        })
        .then(function(response) { return response.json(); })
        .then(function(symbols) {
            var localFuncs = [];
            if (Array.isArray(symbols)) {
                symbols.forEach(function(sym) {
                    var isFunc = sym.kind === 12;
                    // Strip arity suffix from function names ("local:foo#1" → "local:foo")
                    var name = isFunc ? sym.name.replace(/#\d+$/, "") : sym.name.replace(/^\$/, "");
                    localFuncs.push({
                        type: isFunc ? eXide.edit.Document.TYPE_FUNCTION : eXide.edit.Document.TYPE_VARIABLE,
                        name: name,
                        signature: sym.detail || name,
                        row: sym.line,
                        column: sym.column
                    });
                });
            }
            // Assign atomically so concurrent calls don't accumulate duplicates
            doc.functions = localFuncs;
            if (imports && imports.length > 0) {
                self.$resolveImports(doc, imports, onComplete);
            } else {
                onComplete(doc);
            }
        })
        .catch(function(err) {
            console.warn("[outline] symbols fetch failed, falling back:", err);
            // Fall back to regex-based parsing
            self.$parseLocalFunctions(code, doc);
            if (imports && imports.length > 0) {
                self.$resolveImports(doc, imports, onComplete);
            } else {
                onComplete(doc);
            }
        });
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
                var row = text.substring(0, funcDef.index).split("\n").length - 1;
                doc.functions.push({
                    type: eXide.edit.Document.TYPE_FUNCTION,
                    name: name,
                    visibility: status,
                    signature: signature,
                    sort : "$$" + signature,
                    row: row
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
                var row = text.substring(0, varDef.index).split("\n").length - 1;
                doc.functions.push({
                    type: eXide.edit.Document.TYPE_VARIABLE,
                    name: name,
                    sort: "$$" + sort.join(""),
                    row: row
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

		var params = new URLSearchParams();
		for (var i = 0; i < imports.length; i++) {
			var matches = this.moduleRe.exec(imports[i]);
			if (matches != null && matches.length == 4) {
				params.append("prefix", matches[1]);
				params.append("uri", matches[2]);
				params.append("source", matches[3]);
			}
		}

		var basePath = "xmldb:exist://" + doc.getBasePath();
		params.append("base", basePath);

		fetch("api/editor/symbols?" + params.toString())
		.then(function(response) { return response.json(); })
		.then(function(modules) {
			if (modules != null) {
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
								sort: funcs[j].signature
							});
						}
					}
					var vars = modules[i].variables;
					if (vars) {
						for (var j = 0; j < vars.length; j++) {
							var sort = vars[j].split(":");
							sort.splice(1, 0, ":$");
							functions.push({
								type: eXide.edit.Document.TYPE_VARIABLE,
								name: vars[j],
								source: modules[i].source,
								sort: sort.join("")
							});
						}
					}
				}
				doc.functions = doc.functions.concat(functions);
				$this.$sortFunctions(doc);
			}
			if (onComplete)
				onComplete(doc);
		});
		return functions;
	}
    
    Constr.prototype.initDebugger = function(doc) {
        eXide.util.message("The debugger is not available in this version of eXide.");
        return;
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
    
	function escapeHtml(str) {
		var d = document.createElement("div");
		d.textContent = str || "";
		return d.innerHTML;
	}

	return Constr;
}());