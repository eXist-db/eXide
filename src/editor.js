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

eXide.namespace("eXide.edit.Document");

/**
 * Represents an open document.
 */
eXide.edit.Document = (function() {
    
	Constr = function(name, path, session) {
		this.name = name;
		this.path = path;
		this.mime = null;
		this.syntax = "xquery";
		this.saved = false;
		this.editable = true;
		this.functions = [];
		this.helper = null;
		this.history = [];
		this.$session = session;
        this.externalLink = null;
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
    
	Constr.prototype.getText = function() {
		return this.$session.getValue();
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
        $.log("doc name: %s", this.path);
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
	
	Constr.prototype.addToHistory = function(line) {
		this.history.push(line);
	};
	
	Constr.prototype.getLastLine = function() {
		return this.history.pop(line);
	};
	
	Constr.prototype.getCurrentLine = function() {
		var sel = this.$session.getSelection();
		var lead = sel.getSelectionLead();
		return lead.row;
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
		$this.tabCounter = 0;
		$this.newDocCounter = 0;
		$this.pendingCheck = false;
        $this.themes = {};
        $this.initializing = true;
		
        var renderer = new Renderer($this.container, "ace/theme/eclipse");
	    renderer.setShowGutter(true);
	    
		this.editor = new Editor(renderer);
		this.editor.setBehavioursEnabled(true);
		this.editor.setShowFoldWidgets(true);
        this.editor.setFadeFoldWidgets(false);
        
        eXide.edit.commands.init($this);
		
	    this.outline = new eXide.edit.Outline();
	    this.addEventListener("activate", this.outline, this.outline.updateOutline);
    	this.addEventListener("validate", this.outline, this.outline.updateOutline);
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

        // incremental search box
        this.quicksearch = new eXide.find.IncrementalSearch($("#search-box"), this.editor);
        this.search = new eXide.find.SearchReplace(this.editor);
        
        var tabsDiv = $("#tabs-container");
        tabsDiv.css({overflow: 'hidden'});

        //When user move mouse over menu
        tabsDiv.mousemove(function(e) {
        
            var tabsUl = tabsDiv.find("ul");
            var tabsWidth = tabsDiv.width();
            var lastLi = tabsUl.find('li:last-child');
            
            //As images are loaded ul width increases,
            //so we recalculate it each time
            var ulWidth = lastLi[0].offsetLeft + lastLi.outerWidth();
            
            var left = (e.pageX - tabsDiv.offset().left) * (ulWidth-tabsWidth) / tabsWidth;
            tabsDiv.scrollLeft(left);
        });
        
	    this.lastChangeEvent = new Date().getTime();
		this.validateTimeout = null;
		
		// register mode helpers
		$this.modes = {
			"xquery": new eXide.edit.XQueryModeHelper($this),
			"xml": new eXide.edit.XMLModeHelper($this),
            "html": new eXide.edit.XMLModeHelper($this),
            "less": new eXide.edit.LessModeHelper($this),
            "javascript": new eXide.edit.JavascriptModeHelper($this)
//            "css": new eXide.edit.CssModeHelper($this)
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
            }
        });
	};

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);
    
	Constr.prototype.init = function() {
	    if (this.documents.length == 0)
	    	this.newDocument();
        this.initializing = false;
        var currentDoc = this.getActiveDocument();
        this.$triggerEvent("activate", [currentDoc]);
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
            session = new EditSession("xquery version \"3.0\";\n");
        } else {
            session = new EditSession("");
        }
		var newDocument = new eXide.edit.Document("new-document " + newDocId,
				"__new__" + newDocId, session);
        if (type) {
            newDocument.setSyntax(type);
        } else {
            newDocument.setSyntax("text");
        }
		this.$initDocument(newDocument);
	};
	
	Constr.prototype.newDocumentWithText = function(data, mime, resource) {
		var doc = new eXide.edit.Document(resource.name, resource.path, new EditSession(data));
		doc.editable = resource.writable;
		doc.mime = mime;
		doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
		doc.saved = false;
		if (resource.line) {
			doc.addToHistory(resource.line);
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
        		self.$initDocument(newDocument);
			}
        });
    };
    
	Constr.prototype.openDocument = function(data, mime, resource, externalPath) {
		var $this = this;
		if (!resource.writable)
			eXide.util.message("Opening " + resource.path + " readonly!");
		else
			eXide.util.message("Opening " + resource.path);
        $.log("external: %s", externalPath);
		var doc = new eXide.edit.Document(resource.name, resource.path, new EditSession(data));
		doc.editable = resource.writable;
		doc.mime = mime;
		doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
        doc.externalLink = externalPath;
		doc.saved = true;
		if (resource.line) {
			doc.addToHistory(resource.line);
			var sel = doc.$session.getSelection();
			sel.clearSelection();
			sel.moveCursorTo(resource.line, 1);
		    doc.$session.setScrollTop(resource.line);
		}
		$.log("opening %s, mime: %s, syntax: %s, line: %i", resource.name, doc.mime, doc.syntax, resource.line);
		this.$initDocument(doc);
	};
	
	Constr.prototype.$initDocument = function (doc) {
		var $this = this;
		$this.$setMode(doc, false);
		doc.$session.setUndoManager(new UndoManager());
		doc.$session.addEventListener("change", function (ev) {
			if (doc.saved) {
				doc.saved = false;
				$this.updateTabStatus(doc.path, doc);
			}
			$this.triggerCheck();
//				$this.onInput(doc, ev.data);
		});
		$this.addTab(doc);
		
		$this.editor.setSession(doc.$session);
		$this.editor.resize();
		$this.editor.focus();
	};
	
	Constr.prototype.setMode = function(mode) {
		this.activeDoc.syntax = mode;
		this.$setMode(this.activeDoc, true);
	};
	
	Constr.prototype.$setMode = function(doc, setMime) {
		switch (doc.getSyntax()) {
		case "xquery":
			var XQueryMode = require("eXide/mode/xquery").Mode;
			doc.$session.setMode(new XQueryMode(this));
			if (setMime)
				doc.mime = "application/xquery";
			break;
		case "xml":
			var XMLMode = require("eXide/mode/xml").Mode;
			doc.$session.setMode(new XMLMode(this));
			if (setMime)
				doc.mime = "application/xml";
			break;
		case "html":
			var HtmlMode = require("eXide/mode/html").Mode;
			doc.$session.setMode(new HtmlMode(this));
			if (setMime)
				doc.mime = "text/html";
			break;
		case "javascript":
			var JavascriptMode = require("ace/mode/javascript").Mode;
			doc.$session.setMode(new JavascriptMode());
			if (setMime)
				doc.mime = "application/x-javascript";
			break;
		case "css":
			var CssMode = require("ace/mode/css").Mode;
			doc.$session.setMode(new CssMode());
			if (setMime)
				doc.mime = "text/css";
			break;
        case "text":
            var TextMode = require("ace/mode/text").Mode;
            doc.$session.setMode(new TextMode());
            if (setMime)
    			doc.mime = "text/text";
        case "less":
            var LessMode = require("ace/mode/less").Mode;
            doc.$session.setMode(new LessMode());
            if (setMime)
        		doc.mime = "application/less";
		}
		doc.setModeHelper(this.modes[doc.getSyntax()]);
	};
	
	Constr.prototype.closeDocument = function() {
		this.$triggerEvent("close", [this.activeDoc]);
		$("#tabs a[title=\"" + this.activeDoc.path + "\"]").parent().remove();
        this.menubar.remove("buffers", this.activeDoc.path);
		for (var i = 0; i < this.documents.length; i++) {
			if (this.documents[i].path == this.activeDoc.path) {
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
		
		var params = {
				path: $this.activeDoc.path,
				data: $this.activeDoc.getText()
		};
		if ($this.activeDoc.mime)
			params.mime = $this.activeDoc.mime;
		$.ajax({
			url: "modules/store.xql",
			type: "POST",
			data: params,
			dataType: "json",
			success: function (data) {
			    if (data.status == "error") {
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
	
	Constr.prototype.autocomplete = function() {
		var mode = this.activeDoc.getModeHelper();
		if (mode && mode.autocomplete) {
			mode.autocomplete(this.activeDoc);
		}
	};
	
	Constr.prototype.getHeight = function () {
		return $(this.container).height();
	};
	
	Constr.prototype.resize = function () {
		this.editor.resize();
	};
	
	Constr.prototype.clearErrors = function () {
		this.editor.getSession().clearAnnotations();
	};
	
    Constr.prototype.forEachDocument = function(callback) {
        for (var i = 0; i < this.documents.length; i++) {
    		callback(this.documents[i]);
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
		if (!doc.saved)
			label += "*";
		
		$("#tabs li a").removeClass("active");
		
		var li = document.createElement("li");
		var tab = document.createElement("a");
		tab.appendChild(document.createTextNode(label));
		tab.className = "tab active";
		tab.id = tabId;
		tab.title = doc.path;
		li.appendChild(tab);
		$("#tabs").append(li);
        
		$(tab).click(function (ev) {
			ev.preventDefault();
			$this.switchTo(doc);
		});
		
        $this.menubar.add("buffers", label, tab.title, function() {
            $this.switchTo(doc);
        });
        
		$this.activeDoc = doc;
		$this.documents.push(doc);
        if (!$this.initializing) {
            $this.$triggerEvent("activate", [doc]);
        }
        $this.scrollToTab($(tab));
	};
	
	Constr.prototype.switchTo = function(doc) {
		this.editor.setSession(doc.$session);
		this.editor.resize();
		this.activeDoc = doc;
        var $this = this;
		$("#tabs a").each(function () {
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
	};
	
	Constr.prototype.updateTabStatus = function(oldPath, doc) {
		var label;
		if (!doc.saved)
			label = doc.name + "*";
		else
			label = doc.name;
		$("#tabs a[title=\"" + oldPath + "\"]").attr("title", doc.path).text(label);
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
		this.status.innerHTML = msg;
		if (href) {
			this.status.href = href;
		}
	};
	
	/**
	 * Trigger validation.
	 */
	Constr.prototype.triggerCheck = function() {
		var mode = this.activeDoc.getModeHelper();
		if (mode) { 
			var $this = this;
			if ($this.pendingCheck) {
				return;
			}
			var time = new Date().getTime();
			if ($this.validateTimeout && time - $this.lastChangeEvent < 2000) {
				clearTimeout($this.validateTimeout);
			}
			$this.lastChangeEvent = time;
			$this.validateTimeout = setTimeout(function() { 
					$this.validate.apply($this); 
				}, 2000);
		}
	};

	/**
	 * Validate the current document's text by calling validate on the
	 * mode helper.
	 */
	Constr.prototype.validate = function() {
		var $this = this;
		$this.$triggerEvent("validate", [$this.activeDoc]);
		var mode = $this.activeDoc.getModeHelper();
		if (!(mode && mode.validate)) {
			return;
		}
		$this.pendingCheck = true;
		$.log("Running validation...");
		mode.validate($this.activeDoc, $this.getText(), function (success) {
			$this.pendingCheck = false;
		});
	};
	
	/*
	 * Cannot compile xquery: XPDY0002 : variable '$b' is not set. [at line 5, column 6, source: String]
	 */
	Constr.prototype.evalError = function(msg) {
		var str = /.*line\s(\d+)/i.exec(msg);
		var line = -1;
		if (str) {
			line = parseInt(str[1]);
		}
		$.log("error in line %d", str[1]);
		this.editor.focus();
		this.editor.gotoLine(line);
		
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
