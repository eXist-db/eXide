/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2011-2013 Wolfgang Meier
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

eXide.namespace("eXide.edit.Document");

/**
 * Represents an open document.
 */
eXide.edit.Document = (function() {
    
	Constr = function(name, path, session) {
		this.name = name;
        this.path = path.replace(/\/{2,}/g, "/");
		this.mime = null;
		this.syntax = "xquery";
		this.saved = false;
		this.editable = true;
		this.functions = [];
		this.helper = null;
		this.$session = session;
        this.externalLink = null;
        this.lastChangeEvent = new Date().getTime();
        this.lastValidation = 0;
        this.ast = null;
        var wrap = eXide.app.getPreference("softWrap");
        this.$session.setUseWrapMode(wrap != 0);
        if (wrap > 0) {
            this.$session.setWrapLimitRange(wrap, wrap);
        } else if (wrap < 0) {
            this.$session.setWrapLimitRange(null, null);
        }
        this.$session.setFoldStyle("markbegin");
	};

    Constr.TYPE_FUNCTION = "function";
    Constr.TYPE_VARIABLE = "variable";
    Constr.TYPE_TEMPLATE = "template";
    
    Constr.prototype.needsValidation = function() {
        if (this.isNew() && this.isSaved()) {
            return false;
        }
    	return !this.ast || this.lastChangeEvent > this.lastValidation;
    };

	Constr.prototype.getText = function() {
		return this.$session.getValue();
	};
	
    Constr.prototype.setText = function(text) {
        this.$session.setValue(text);
    };
    
	Constr.prototype.getName = function() {
		return this.name;
	};
	
	Constr.prototype.getPath = function() {
		return this.path;
	};
	
    Constr.prototype.setPath = function(path) {
    	this.path = path;
	};
    
	Constr.prototype.getBasePath = function() {
		return this.path.replace(/(^.+)\/[^\/]*$/, "$1");
	};
	
	Constr.prototype.getMime = function() {
		return this.mime;
	};
	
    Constr.prototype.setMime = function(mimeType) {
        this.mime = mimeType;
    };
    
	Constr.prototype.getSyntax = function() {
		return this.syntax;
	};
	
    Constr.prototype.setSyntax = function(syntax) {
    	this.syntax = syntax;
	};
    
	Constr.prototype.getSession = function() {
		return this.$session;
	};
	
	Constr.prototype.isSaved = function() {
		return this.saved;
	};
	
    Constr.prototype.isNew = function() {
        return /__new__/.test(this.path);
    };
    
	Constr.prototype.isEditable = function() {
		return this.editable;
	};
	
	Constr.prototype.isXQuery = function() {
		return this.mime == "application/xquery";
	};
	
	Constr.prototype.setModeHelper = function(mode) {
		this.helper = mode;
	};
	
	Constr.prototype.getModeHelper = function() {
		return this.helper;
	};
	
	Constr.prototype.getCurrentLine = function() {
		var sel = this.$session.getSelection();
		var lead = sel.getSelectionLead();
		return lead.row;
	};

	Constr.prototype.getLastChanged = function() {
		return this.lastChangeEvent;
	};
    
    Constr.prototype.getExternalLink = function() {
        return this.externalLink;
    };
    
	return Constr;
}());

eXide.namespace("eXide.edit.Editor");

/**
 * The main editor component. Handles the ACE editor as well as tabs, keybindings, commands...
 */
eXide.edit.Editor = (function () {
    
	var Renderer = require("ace/virtual_renderer").VirtualRenderer;
	var Editor = require("ace/editor").Editor;
	var EditSession = require("ace/edit_session").EditSession;
    var UndoManager = require("ace/undomanager").UndoManager;
    var SnippetManager = require("ace/snippets").snippetManager;
    var net = require("ace/lib/net");
    var event = require("ace/lib/event");
    
    function parseErrMsg(error) {
		var msg;
		if (error.line) {
			msg = error["#text"];
		} else {
			msg = error;
		}
		var str = /.*line:?\s(\d+)/i.exec(msg);
		var line = -1;
		if (str) {
			line = parseInt(str[1]) - 1;
		} else if (error.line) {
			line = parseInt(error.line) - 1;
		}
		return { line: line, msg: msg };
	}
    
	Constr = function(container, menubar, projects) {
		var $this = this;
		$this.container = container;
        $this.menubar = menubar;
        $this.projects = projects;
		$this.documents = [];
		$this.activeDoc = null;
		$this.recent = [];
		$this.tabCounter = 0;
		$this.newDocCounter = 0;

		$this.pendingCheck = false;
        $this.recheck = false;

        $this.enableEmmet = false;
        
        $this.themes = {};
        $this.initializing = true;
        
        $this.history = new eXide.edit.History();
		
		$this.tabs = $("#tabs");
		
        var renderer = new Renderer($this.container, "ace/theme/eclipse");
	    renderer.setShowGutter(true);
	    
		this.editor = new Editor(renderer);
		this.editor.setBehavioursEnabled(true);
		this.editor.setShowFoldWidgets(true);
        this.editor.setFadeFoldWidgets(false);
        //this.editor.setOption("enableBasicAutocompletion", false);
        
        // enable multiple cursors
		require("ace/multi_select").MultiSelect(this.editor);
        
        // register keybindings
        eXide.edit.commands.init($this);
        
        // all keyboard events in the current window should be handled by editor
        event.addCommandKeyListener(window, $this.onCommandKey.bind($this));
        
        // register editor on menubar to allow regaining focus
        menubar.editor = this;
        
	    this.outline = new eXide.edit.Outline();
	    this.directory = new eXide.edit.Directory();
	    this.validator = new eXide.edit.CodeValidator(this);
	    this.addEventListener("activate", this.outline, this.outline.updateOutline);
    	this.validator.addEventListener("validate", this.outline, this.outline.updateOutline);
		this.addEventListener("close", this.outline, this.outline.clearOutline);
        
       
	    
	    // Set up the status bar
	    this.status = document.getElementById("error-status");
	    $(this.status).click(function (ev) {
	    	ev.preventDefault();
	    	var path = this.pathname;
	    	var line = this.hash.substring(1);
	    	var doc = $this.getDocument(path);
	    	if (doc) {
	    		$this.switchTo(doc);
	    		$this.editor.gotoLine(parseInt(line) + 1);
	    	}
	    });
        
        var tabsDiv = $("#tabs-container");
        tabsDiv.css({overflow: 'hidden'});

        //When user move mouse over menu
        tabsDiv.mousemove(function(e) {
            var tabsUl = tabsDiv.find("ul");
            var tabsWidth = tabsDiv.width();
            var lastLi = tabsUl.find('li');
            
            if (lastLi.length > 1) {
                //As images are loaded ul width increases,
                //so we recalculate it each time
                var ulWidth = lastLi[lastLi.length - 2].offsetLeft + lastLi.outerWidth();
                
                var left = (e.pageX - tabsDiv.offset().left) * (ulWidth-tabsWidth) / tabsWidth;
                tabsDiv.scrollLeft(left);
            }
        });
        
		this.validateTimeout = null;
		this.validationEnabled = true;
		
		// register mode helpers
		var xmlModeHelper = new eXide.edit.XMLModeHelper($this, menubar);
		$this.modes = {
			"xquery": new eXide.edit.XQueryModeHelper($this, menubar),
			"xml": xmlModeHelper,
            "html": xmlModeHelper,
            "less": new eXide.edit.LessModeHelper($this),
            "javascript": new eXide.edit.JavascriptModeHelper($this),
            "css": new eXide.edit.CssModeHelper($this),
            "tmsnippet": new eXide.edit.SnippetModeHelper($this)
		};
        
        $("#dialog-goto-line").dialog({
            modal: false,
            autoOpen: false,
            height: 200,
            width: 300,
            buttons: {
                "Goto": function() {
                    var line = $(this).find('input[name="row"]').val();
                    var column = $(this).find('input[name="column"]').val();
                    if (column && column != "") {
                        $this.editor.gotoLine(line, column, true);
                    } else {
                        $this.editor.gotoLine(line, 0, true);
                    }
                    $(this).dialog("close");
                    $this.editor.focus();
                },
                "Cancel": function () { $(this).dialog("close"); $this.editor.focus(); }
            },
            open: function() {
                // clear form fields
                $(this).find("input[name='row']").val("");
                $(this).find("input[name='column']").val("");
                $(this).find("input:first").focus();
                
                var dialog = $(this);
                dialog.find("input").keyup(function (e) {
                    if (e.keyCode == 13) {
                        dialog.parent().find(".ui-dialog-buttonpane button:first").trigger("click");
                    }
                });
            }
        });
        
        this.editor.on("guttermousedown", function(ev) {
            if (ev.getButton()) // !editor.isFocused()
                return;
            var gutterRegion = $this.editor.renderer.$gutterLayer.getRegion(ev);
            if (gutterRegion != "markers")
                return;
            
            var row = ev.getDocumentPosition().row;
            $this.exec("quickFix", row);
        });
        
        var Emmet = require("ace/ext/emmet");
        net.loadScript("$shared/resources/scripts/ace/emmet.js", function() {
            Emmet.setCore(window.emmet);
            $this.editor.setOption("enableEmmet", false);
        });
        
        // drop handler for appending tab to the end
        $(".drop-placeholder .tab", $this.tabs).droppable({
		    hoverClass: "dragover",
		    greedy: true,
		    drop: function(ev, ui) {
		        ev.stopImmediatePropagation();
		        ev.stopPropagation();
		        ev.preventDefault();
		        var target = $(this);
		        var tabs = $(".tab", $this.tabs);
		        var source = ui.draggable;
		        var sourceIdx = tabs.index(source);
		        var doc = $this.documents[sourceIdx];
	            var li = source.parent().detach();
	            li.insertBefore(target.parent());
	            $this.documents.splice(sourceIdx, 1);
	            $this.documents.push(doc);
	            $this.rebuildBuffersMenu();
		    }
		});
		
		 //Set up outline status bar
		var outlineData = [{label: "outline", cls: "outline"},{label:'directory', cls:"directory"}]
		d3.select("#tabs-outline").selectAll("li").data(outlineData)
			.enter()
			.append("li")
				.append("a")
				.attr("class", "tab")
				.text(function(d,i){return d.label})
				.on('click', function(d,i) {
					d3.selectAll("#tabs-outline a.tab").classed("active", function(d,ii){return ii ==i})
					outlineData.map(function(m,ii){return menubar.editor[m.cls].toggle(ii == i) })
					})
				.each(function(d,i){ // activate the first one
					if (i===0){
						d3.select(this).classed('active', true)
					}
					menubar.editor[d.cls].toggle(i ===0 )
					
				})
	};

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    Constr.prototype.onCommandKey = function(e, hashId, keyCode) {
        var target = $(e.target);
        if (target.is(":input") || target.attr("id") == "autocomplete-box" || target.parents(".eXide-browse-resources").length > 0) {
            return false;
        } else {
            this.editor.onCommandKey(e, hashId, keyCode);
        }
    };
    
	Constr.prototype.init = function() {
	    if (this.documents.length == 0)
	    	this.newDocument(null, "xquery");
        this.initializing = false;
        var currentDoc = this.getActiveDocument();
        this.$triggerEvent("activate", [currentDoc]);
	};
	
	Constr.prototype.setEmmetEnabled = function(enabled) {
	    this.enableEmmet = enabled;
	    this.editor.setOption("enableEmmet", enabled);
	};
	
	Constr.prototype.exec = function () {
		if (this.activeDoc.getModeHelper()) {
			var args = Array.prototype.slice.call(arguments, 1);
			this.activeDoc.getModeHelper().exec(arguments[0], this.activeDoc, args);
		} else {
		    eXide.util.message("Not supported in this mode.");
		}
	};
	
	Constr.prototype.getActiveDocument = function() {
		return this.activeDoc;
	}; 
	
	Constr.prototype.getText = function() {
		return this.activeDoc.getText();
	};
	
	Constr.prototype.newDocument = function(data, type) {
		var $this = this;
		var newDocId = 0;
		for (var i = 0; i < $this.documents.length; i++) {
			var doc = $this.documents[i];
			if (doc.path.match(/^__new__(\d+)/)) {
				newDocId = parseInt(RegExp.$1);
			}
		}
		newDocId++;
        var session;
        if (data && typeof data == "string") {
            session = new EditSession(data);
        } else if (type && type === "xquery") {
            session = new EditSession("xquery version \"3.0\";\n\n");
        } else {
            session = new EditSession("");
        }
		var newDocument = new eXide.edit.Document("new-document " + newDocId,
				"__new__" + newDocId, session);
		newDocument.saved = true;
        if (type) {
            newDocument.setSyntax(type);
        } else {
            newDocument.setSyntax("text");
        }
		this.$initDocument(newDocument, true);
	};
	
	Constr.prototype.newDocumentWithText = function(data, mime, resource) {
		var doc = new eXide.edit.Document(resource.name, resource.path, new EditSession(data));
		doc.editable = resource.writable;
		doc.mime = mime;
		doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
		doc.saved = false;
		if (resource.line) {
			this.editor.gotoLine(resource.line);
		}
		this.$initDocument(doc);
	};
	
    Constr.prototype.newDocumentFromTemplate = function(mode, template) {
        if (!template || template.length == 0) {
            this.newDocument(null, mode);
            return;
        }
        var self = this;
        $.ajax({
    		url: "modules/get-template.xql",
			type: "POST",
			data: { template: template },
			dataType: "text",
			success: function (data) {
            	var newDocId = 0;
        		for (var i = 0; i < self.documents.length; i++) {
        			var doc = self.documents[i];
        			if (doc.path.match(/^__new__(\d+)/)) {
        				newDocId = parseInt(RegExp.$1);
        			}
        		}
        		newDocId++;
                var session = new EditSession(data);
        		var newDocument = new eXide.edit.Document("new-document " + newDocId,
        				"__new__" + newDocId, session);
                newDocument.setSyntax(mode);
        		self.$initDocument(newDocument, true);
			}
        });
    };
    
	Constr.prototype.openDocument = function(data, mime, resource, externalPath) {
		var $this = this;
		if (!resource.writable)
			eXide.util.message("Opening " + resource.path + " readonly!");
		else
			eXide.util.message("Opening " + resource.path);
        if (/\.snippet/.test(resource.name)) {
            mime = "application/tmsnippet";
        }
		var doc = new eXide.edit.Document(resource.name, resource.path, new EditSession(data));
		doc.editable = resource.writable;
		doc.mime = mime;
		doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
        doc.externalLink = externalPath;
		doc.saved = true;
		if (resource.line) {
			var sel = doc.$session.getSelection();
			sel.clearSelection();
			sel.moveCursorTo(resource.line, 1);
		    doc.$session.setScrollTop(resource.line);
		}
		$.log("opening %s, mime: %s, syntax: %s, line: %i", resource.name, doc.mime, doc.syntax, resource.line);
        this.updateStatus("");
        if (this.activeDoc) {
            var helper = this.activeDoc.getModeHelper();
            if (helper) {
                helper.deactivate(doc);
            }
        }
		this.$initDocument(doc);
		this.directory.toggleEdit(this.activeDoc.getPath(), true)
	};
	
	Constr.prototype.$initDocument = function (doc, setMime) {
		var $this = this;
		$this.$setMode(doc, setMime);
		doc.$session.setUndoManager(new UndoManager());
		doc.$session.addEventListener("change", function (ev) {
			if (doc.saved) {
				doc.saved = false;
				$this.updateTabStatus(doc.path, doc);
			}
			doc.lastChangeEvent = new Date().getTime();
			$this.validator.triggerDelayed(doc);
		});
		$this.addTab(doc);
		
		$this.editor.setSession(doc.$session);
		$this.editor.resize();
		$this.editor.focus();
        
        doc.$session.getDocument().on("change", function(ev) {
            $this.$triggerEvent("change", [$this.activeDoc]);
            $this.history.push(doc.getPath(), doc.getCurrentLine());
        });
        
        eXide.app.toggleRunStatus(doc);
        if (doc.getModeHelper()) {
            doc.getModeHelper().activate(doc);
        }
	};
	
	Constr.prototype.setMode = function(mode) {
		this.activeDoc.syntax = mode;
		this.$setMode(this.activeDoc, true);
	};
	
	Constr.prototype.$setMode = function(doc, setMime) {
        var mode;
		switch (doc.getSyntax()) {
		case "xquery":
			var XQueryMode = require("eXide/mode/xquery").Mode;
            mode = new XQueryMode(this);
            mode.$id = "xquery";
			doc.$session.setMode(mode);
			if (setMime)
				doc.mime = "application/xquery";
			break;
		case "xml":
			var XMLMode = require("eXide/mode/xml").Mode;
            mode = new XMLMode(this);
            mode.$id = "xml";
			doc.$session.setMode(mode);
			if (setMime)
				doc.mime = "application/xml";
			break;
		case "html":
			var HtmlMode = require("eXide/mode/html").Mode;
            mode = new HtmlMode(this);
            mode.$id = "html";
			doc.$session.setMode(mode);
			if (setMime)
				doc.mime = "text/html";
			break;
		case "javascript":
			var JavascriptMode = require("ace/mode/javascript").Mode;
            mode = new JavascriptMode();
            mode.$id = "javascript";
			doc.$session.setMode(mode);
			if (setMime)
				doc.mime = "application/x-javascript";
			break;
		case "css":
			var CssMode = require("ace/mode/css").Mode;
            mode = new CssMode();
            mode.$id = "css";
			doc.$session.setMode(mode);
			if (setMime)
				doc.mime = "text/css";
			break;
        case "text":
            var TextMode = require("ace/mode/text").Mode;
            doc.$session.setMode(new TextMode());
            if (setMime)
                doc.mime = "text/text";
            break;
        case "less":
            var LessMode = require("ace/mode/less").Mode;
            mode = new LessMode();
            mode.$id = "less";
            doc.$session.setMode(mode);
            if (setMime)
                doc.mime = "application/less";
            break;
        case "tmsnippet":
            var SnippetMode = require("ace/mode/snippets").Mode;
            doc.$session.setUseSoftTabs(false);
            doc.$session.setMode(new SnippetMode());
            if (setMime)
                doc.mime = "application/tmsnippet";
            break;
        case "json":
            var JSONMode = require("ace/mode/json").Mode;
            doc.$session.setUseSoftTabs(false);
            doc.$session.setMode(new JSONMode());
            if (setMime)
                doc.mime = "application/json";
            break;
        case "markdown":
            var MarkdownMode = require("ace/mode/markdown").Mode;
            doc.$session.setMode(new MarkdownMode());
            if (setMime)
                doc.mime = "text/x-markdown";
		}
        eXide.util.Snippets.init(doc.getSyntax());
        mode = this.modes[doc.getSyntax()];
        if (!mode) {
            mode = new eXide.edit.ModeHelper(this);
        }
		doc.setModeHelper(mode);
	};
	
	Constr.prototype.closeDocument = function(docToClose) {
	    var doc = docToClose || this.activeDoc;
		this.$triggerEvent("close", [doc]);
		$("#tabs a[title=\"" + doc.path + "\"]").parent().remove();
        this.menubar.remove("buffers", doc.path);
		for (var i = 0; i < this.documents.length; i++) {
			if (this.documents[i].path == doc.path) {
				this.documents.splice(i, 1);
			}
		}
		if (this.documents.length == 0)
			this.newDocument(null, "xquery");
		else {
			this.activeDoc = this.documents[this.documents.length - 1];
			$("#tabs a[title=\"" + this.activeDoc.path + "\"]").addClass("active");
			this.editor.setSession(this.activeDoc.$session);
			this.editor.resize();
			this.directory.toggleEdit(doc.getPath(), false)
			this.$triggerEvent("activate", [this.activeDoc]);
		}
	};
	
	Constr.prototype.saveDocument = function(resource, successHandler, errorHandler) {
		var $this = this;
		var oldPath = $this.activeDoc.path;
		var oldName = $this.activeDoc.name;
		if (resource) {
			$this.activeDoc.path = resource.path,
			$this.activeDoc.name = resource.name
		}
		
		eXide.util.message("Storing resource " + $this.activeDoc.name + "...");
		
		$.ajax({
			url: "store" + $this.activeDoc.path,
			type: "PUT",
			data: $this.activeDoc.getText(),
			dataType: "json",
            contentType: $this.activeDoc.mime ? $this.activeDoc.mime : "application/octet-stream",
			success: function (data) {
			    if (data.status == "error") {
			        // reset old path and name
				    $this.activeDoc.path = oldPath;
				    $this.activeDoc.name = oldName;
					if (errorHandler) {
						errorHandler.apply($this.activeDoc, [data.message]);
					} else {
						eXide.util.error(data.message);
					}
				} else {
					$this.activeDoc.saved = true;
                    $this.activeDoc.externalLink = data.externalLink;
					$this.updateTabStatus(oldPath, $this.activeDoc);
					if (successHandler) {
						successHandler.apply($this.activeDoc);
					} else {
						eXide.util.success($this.activeDoc.name + " stored.");
					}
                    
                    // trigger post-save action on mode helper
                    var mode = $this.activeDoc.getModeHelper();
                	if (mode) {
            			mode.documentSaved($this.activeDoc);
            		}
                    $this.$triggerEvent("saved", [$this.activeDoc]);
				}
			},
			error: function (xhr, status) {
				// reset old path and name
				$this.activeDoc.path = oldPath;
				$this.activeDoc.name = oldName;
				if (errorHandler) {
					errorHandler.apply($this.activeDoc, xhr.responseText);
				} else {
					eXide.util.error(xhr.responseText);
				}
			}
		});
	};

    Constr.prototype.reload = function(data) {
        this.activeDoc.getSession().setValue(data);
        this.activeDoc.saved = true;
        this.updateTabStatus(this.activeDoc.path, this.activeDoc);
    };
    
	/**
	 * Scan open documents and return the one matching path
	 */
	Constr.prototype.getDocument = function(path) {
		path = eXide.util.normalizePath(path);
		for (var i = 0; i < this.documents.length; i++) {
			if (this.documents[i].path == path)
				return this.documents[i];
		}
        return null;
	};

	/**
	 * Dispatch document change events to mode helpers.
	 */
	Constr.prototype.onInput = function (doc, delta) {
		var mode = doc.getModeHelper();
		if (mode && mode.onInput) {
			mode.onInput(doc, delta);
		}
	};
	
	Constr.prototype.historyBack = function() {
        var item = this.history.pop();
        if (item) {
            $.log("history event: going to %s at line %d", item.path, item.line);
            eXide.app.findDocument(item.path, item.line + 1);
        }
	};
	
	Constr.prototype.autocomplete = function(alwaysShow) {
		var mode = this.activeDoc.getModeHelper();
		if (mode && mode.autocomplete) {
			return mode.autocomplete(this.activeDoc, alwaysShow);
		}
		return false;
	};
	
	Constr.prototype.getHeight = function () {
		return $("#fullscreen").height();
	};
	
	Constr.prototype.getWidth = function () {
		return $(this.container).width();
	};

	Constr.prototype.getOffset = function() {
		return $(this.container).offset();
	};

	Constr.prototype.resize = function () {
		this.editor.resize();
	};
	
	Constr.prototype.clearErrors = function () {
		this.editor.getSession().clearAnnotations();
	};
	
    Constr.prototype.forEachDocument = function(callback) {
        var docs = this.documents.slice(0);
        for (var i = 0; i < docs.length; i++) {
    		callback(docs[i]);
        }
    };
    
    Constr.prototype.gotoLine = function() {
        $("#dialog-goto-line").dialog("open");
        $("#dialog-goto-line input[type='text']").val("");
        $('#dialog-goto-line input[name="row"]').focus();
    };
    
	Constr.prototype.addTab = function(doc) {
		var $this = this;
		var tabId = "t" + $this.tabCounter++;
		var label = doc.name;
		if (label.length > 16) {
			label = label.substring(0, 13) + "...";
		}
		if (!doc.saved)
			label += "*";
		
		$("li a", $this.tabs).removeClass("active");
		
		var li = document.createElement("li");
		var tab = document.createElement("a");
		tab.appendChild(document.createTextNode(label));
		tab.className = "tab active";
		tab.id = tabId;
		tab.title = doc.path;
		li.appendChild(tab);
		
		$(tab).click(function (ev) {
			ev.preventDefault();
			$this.switchTo(doc);
		}).draggable({
		    axis: "x",
		    revert: true,
		    opacity: 0.8,
		    zIndex: 100,
		    start: function() {
		        $(".drop-placeholder .tab", $this.tabs).show();
		    },
		    stop: function() {
		        $(".drop-placeholder .tab", $this.tabs).hide();
		    }
		}).droppable({
		    hoverClass: "dragover",
		    greedy: true,
		    drop: function(ev, ui) {
		        ev.stopImmediatePropagation();
		        ev.stopPropagation();
		        ev.preventDefault();
		        var target = $(this);
		        var tabs = $(".tab", $this.tabs);
		        var source = ui.draggable;
		        var sourceIdx = tabs.index(source);
		        var targetIdx = tabs.index(target);
		        if (sourceIdx != targetIdx) {
		            var li = source.parent().detach();
		            li.insertBefore(target.parent());
		            $this.documents.splice(targetIdx, 0, $this.documents[sourceIdx]);
		            sourceIdx = sourceIdx > targetIdx ? sourceIdx + 1 : sourceIdx;
		            $this.documents.splice(sourceIdx, 1);
		            $this.rebuildBuffersMenu();
		        }
		    }
		});
		
		$(li).insertBefore($(".drop-placeholder", $this.tabs));
		
        $this.menubar.add("buffers", label, tab.title, $this.documents.length + 1, function() {
            $this.switchTo(doc);
        });
        
		$this.activeDoc = doc;
		$this.documents.push(doc);
        if (!$this.initializing) {
            $this.$triggerEvent("activate", [doc]);
        }
        $this.scrollToTab($(tab));
	};
	
	Constr.prototype.rebuildBuffersMenu = function() {
	    var self = this;
	    self.menubar.removeAll("buffers");
	    self.documents.forEach(function(doc, idx) {
	        var label = doc.name;
    		if (label.length > 16) {
    			label = label.substring(0, 13) + "...";
    		}
    		if (!doc.saved)
    			label += "*";
	        self.menubar.add("buffers", label, doc.path, idx + 1, function() {
	            self.switchTo(doc);
	        });
	    });
	};
	
	Constr.prototype.selectTab = function(pos) {
	    var self = this;
	    if (pos >= 0 && pos < this.documents.length) {
	        this.switchTo(this.documents[pos]);
	    } else {
    	    var popupItems = [];
            for (var i = 0; i < this.documents.length; i++) {
                item = { 
                    label: this.documents[i].name,
                    pos: i
                };
                popupItems.push(item);
            };
            if (popupItems.length > 1) {
                var left = this.getOffset().left;
                eXide.util.Popup.position({ pageX: left, pageY: 40 });
                eXide.util.Popup.show(popupItems, function (selected) {
                    if (selected) {
                        self.switchTo(self.documents[selected.pos]);
                    }
                });
            }
	    }
	};
	
	Constr.prototype.switchTo = function(doc) {
        var helper = this.activeDoc.getModeHelper();
        if (helper) {
            helper.deactivate(doc);
        }
		this.editor.setSession(doc.$session);
		this.editor.resize();
		this.activeDoc = doc;
        var $this = this;
		$("a", $this.tabs).each(function () {
            var current = $(this);
			if (this.title == doc.path) {
				current.addClass("active");
                $this.scrollToTab(current);
			} else {
				current.removeClass("active");
			}
		});
		this.updateStatus("");
		this.$triggerEvent("activate", [doc]);
        
        eXide.app.toggleRunStatus(doc);
        helper = doc.getModeHelper();
        if (helper) {
            helper.activate(doc);
        }
        if (!this.activeDoc.ast) {
            this.validator.triggerNow(this.activeDoc);
        }
	};
	
	Constr.prototype.updateTabStatus = function(oldPath, doc) {
		var label;
		if (!doc.saved)
			label = doc.name + "*";
		else
			label = doc.name;
		$("a[title=\"" + oldPath + "\"]", this.tabs).attr("title", doc.path).text(label);
	};
	
    Constr.prototype.scrollToTab = function (current) {
        var offset = current.offset().left;
        var offsetRight = offset + current.outerWidth();
        var width = $("#tabs-container").innerWidth();
        var scrollLeft = $("#tabs-container").scrollLeft();
        if (offsetRight > width) {
//            $("#tab-next").show();
//            $("#tab-prev").show();
            $("#tabs-container").scrollLeft(offsetRight - width);
        } else if (offset < scrollLeft) {
            if (offset < width)
                $("#tabs-container").scrollLeft(0);
            else
                $("#tabs-container").scrollLeft(offset);
        }
        $.log("Scrolling to %d %d", offset, $("#tabs-container").scrollLeft());
    };
    
	Constr.prototype.setTheme = function(theme) {
		$.log("Changing theme to %s", theme);
        var $this = this;
        $this.loadTheme(theme, function() {
		    $this.editor.setTheme("ace/theme/" + theme);
            $this.$triggerEvent("setTheme", [ require($this.editor.getTheme()) ]);
        });
	};
	
    Constr.prototype.loadTheme = function(name, callback) {
        if (this.themes[name])
            return callback();
        
        var net = require("ace/lib/net");
        this.themes[name] = 1;
        var base = name.split("/").pop();
        var fileName = "$shared/resources/scripts/ace/theme-" + base + ".js";
        
        var head = document.getElementsByTagName('head')[0];
        var s = document.createElement('script');

        s.src = fileName;
        head.appendChild(s);

        s.onload = callback;
    };

	/**
	 * Update the status bar.
	 */
	Constr.prototype.updateStatus = function(msg, href) {
		$(this.status).text(msg);
		if (href) {
			this.status.href = href;
		}
	};
	
	/*
	 * Cannot compile xquery: XPDY0002 : variable '$b' is not set. [at line 5, column 6, source: String]
	 */
	Constr.prototype.evalError = function(msg, gotoLine) {
		var str = /.*line\s(\d+)/i.exec(msg);
		var line = -1;
		if (str) {
			line = parseInt(str[1]);
		}
        if (gotoLine) {
    		this.editor.focus();
    		this.editor.gotoLine(line);
        }
        
		var annotation = [{
				row: line - 1,
				text: msg,
				type: "error"
		}];
        this.updateStatus(msg);
		this.editor.getSession().setAnnotations(annotation);
	};
	
	Constr.prototype.focus = function() {
		this.editor.focus();
	};
	
	Constr.prototype.saveState = function() {
		var i = 0;
		$.each(this.documents, function (index, doc) {
			if (doc.path.match('^__new__.*')) {
                var data = doc.getText();
                if (data && data.length > 0) {
    				localStorage["eXide." + i + ".path"] = doc.path;
    				localStorage["eXide." + i + ".name"] = doc.name;
    				localStorage["eXide." + i + ".mime"] = doc.mime;
    				localStorage["eXide." + i + ".data"] = doc.getText();
    				localStorage["eXide." + i + ".last-line"] = doc.getCurrentLine();
                }
			} else {
				localStorage["eXide." + i + ".path"] = doc.path;
				localStorage["eXide." + i + ".name"] = doc.name;
				localStorage["eXide." + i + ".mime"] = doc.mime;
				localStorage["eXide." + i + ".writable"] = (doc.editable ? "true" : "false");
				localStorage["eXide." + i + ".last-line"] = doc.getCurrentLine();
				if (!doc.saved)
					localStorage["eXide." + i + ".data"] = doc.getText();
			}
			i++;
		});
		localStorage["eXide.documents"] = i;
	};
    
	return Constr;
}());
