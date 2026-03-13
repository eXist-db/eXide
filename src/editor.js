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

    var EditorState = CM6.EditorState;

    Constr = function(name, path, stateOrText) {
        this.name = name;
        this.path = path.replace(/\/{2,}/g, "/");
        this.mime = null;
        this.syntax = "xquery";
        this.saved = false;
        this.editable = true;
        this.functions = [];
        this.helper = null;
        this.externalLink = null;
        this.lastChangeEvent = new Date().getTime();
        this.lastValidation = 0;
        this.ast = null;

        // CM6: store the document text; the EditorState will be created
        // when the document is activated (switched to) in the editor
        if (typeof stateOrText === "string") {
            this._text = stateOrText;
        } else {
            this._text = stateOrText || "";
        }
        // Cursor position to restore when switching back
        this._cursorOffset = 0;
        // Stored annotations for this document
        this._annotations = [];
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
        // If the document is active, get text from the view
        if (this._view) {
            return this._view.state.doc.toString();
        }
        return this._text;
    };

    Constr.prototype.setText = function(text) {
        if (this._view) {
            this._view.dispatch({
                changes: { from: 0, to: this._view.state.doc.length, insert: text }
            });
        } else {
            this._text = text;
        }
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

    /**
     * getSession() returns the EditorView for CM6 compatibility with mode helpers.
     * Mode helpers that call doc.getSession() will get the view instance.
     */
    Constr.prototype.getSession = function() {
        return this._view;
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
        if (this._view) {
            return editorUtils.offsetToRowCol(this._view.state, this._view.state.selection.main.head).row;
        }
        return 0;
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
 * The main editor component. Uses CodeMirror 6.
 */
eXide.edit.Editor = (function () {

    var EditorView = CM6.EditorView;
    var EditorState = CM6.EditorState;
    var Compartment = CM6.Compartment;
    var keymap = CM6.keymap;

    // Language compartment for switching syntax modes
    var languageCompartment = new Compartment();
    // Theme compartment for switching themes
    var themeCompartment = new Compartment();
    // Read-only compartment
    var readOnlyCompartment = new Compartment();
    // Auto-pair brackets/quotes compartment
    var autoPairCompartment = new Compartment();
    // Line wrapping compartment
    var lineWrappingCompartment = new Compartment();
    // Show invisibles (whitespace) compartment
    var showInvisiblesCompartment = new Compartment();
    // Rectangular selection compartment
    var rectangularSelectionCompartment = new Compartment();

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

    /**
     * Get CM6 language extension for a given syntax mode name.
     */
    function getLanguageExtension(syntax) {
        switch (syntax) {
            case "xquery":
                return CM6.xquery ? CM6.xquery() : [];
            case "xml":
                return CM6.xml();
            case "html":
                return CM6.html();
            case "javascript":
                return CM6.javascript();
            case "css":
                return CM6.css();
            case "less":
                return CM6.css(); // Less uses CSS mode
            case "json":
                return CM6.json();
            case "markdown":
                return CM6.markdown();
            default:
                return [];
        }
    }

    /**
     * Build the base set of CM6 extensions.
     */
    function buildExtensions($this) {
        return [
            CM6.lintGutter(),
            CM6.lineNumbers(),
            CM6.highlightActiveLine(),
            CM6.highlightActiveLineGutter(),
            CM6.drawSelection(),
            CM6.dropCursor(),
            CM6.highlightSpecialChars(),
            CM6.history(),
            CM6.foldGutter(),
            CM6.bracketMatching(),
            autoPairCompartment.of([CM6.closeBrackets(), keymap.of(CM6.closeBracketsKeymap)]),
            CM6.indentOnInput(),
            CM6.syntaxHighlighting(CM6.defaultHighlightStyle, { fallback: true }),
            CM6.syntaxHighlighting(CM6.oneDarkHighlightStyle),
            CM6.search({ top: true }),
            keymap.of([
                ...CM6.defaultKeymap,
                ...CM6.historyKeymap,
                ...CM6.foldKeymap,
                ...CM6.searchKeymap,
                ...CM6.lintKeymap,
                CM6.indentWithTab
            ]),
            languageCompartment.of([]),
            themeCompartment.of([]),
            readOnlyCompartment.of(EditorState.readOnly.of(false)),
            lineWrappingCompartment.of([]),
            showInvisiblesCompartment.of([]),
            rectangularSelectionCompartment.of([CM6.rectangularSelection(), CM6.crosshairCursor()]),
            eXide.edit.FuncDocTooltip.extension(),
            eXide.edit.LspHover.extension(),
            eXide.edit.SemanticHighlight.extension(),
            CM6.autocompletion({
                override: [eXide.edit.CompletionSource.completionSource],
                activateOnTyping: false,
                maxRenderedOptions: 50,
                icons: true
            }),
            CM6.scrollPastEnd(),
            EditorView.updateListener.of(function(update) {
                if (update.docChanged && $this.activeDoc && !$this._switching) {
                    if ($this.activeDoc.saved) {
                        $this.activeDoc.saved = false;
                        $this.updateTabStatus($this.activeDoc.path, $this.activeDoc);
                    }
                    $this.activeDoc.lastChangeEvent = new Date().getTime();
                    $this.validator.triggerDelayed($this.activeDoc);
                    $this.$triggerEvent("change", [$this.activeDoc]);
                    $this.history.push($this.activeDoc.getPath(), $this.activeDoc.getCurrentLine());
                }
                if (update.selectionSet || update.docChanged) {
                    var head = update.state.selection.main.head;
                    var line = update.state.doc.lineAt(head);
                    var col = head - line.from + 1;
                    var el = document.getElementById("status-cursor");
                    if (el) {
                        el.textContent = "Ln " + line.number + ", Col " + col;
                    }
                }
            })
        ];
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
        $this._switching = false;  // suppress updateListener during doc switches

        $this.history = new eXide.edit.History();

        $this.tabs = document.getElementById("tabs");

        // Create CM6 EditorView
        this.editor = new EditorView({
            state: EditorState.create({
                doc: "",
                extensions: buildExtensions($this)
            }),
            parent: $this.container
        });

        // Store compartments for later reconfiguration
        this._languageCompartment = languageCompartment;
        this._themeCompartment = themeCompartment;
        this._readOnlyCompartment = readOnlyCompartment;
        this._autoPairCompartment = autoPairCompartment;
        this._lineWrappingCompartment = lineWrappingCompartment;
        this._showInvisiblesCompartment = showInvisiblesCompartment;
        this._rectangularSelectionCompartment = rectangularSelectionCompartment;
        this._baseExtensions = buildExtensions;

        // register keybindings
        eXide.edit.commands.init($this);

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
        this.status.addEventListener("click", function (ev) {
            ev.preventDefault();
            var path = this.pathname;
            var line = this.hash.substring(1);
            var doc = $this.getDocument(path);
            if (doc) {
                $this.switchTo(doc);
                editorUtils.gotoLine($this.editor, parseInt(line) + 1);
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
            "json": new eXide.edit.JsonModeHelper($this),
            "markdown": new eXide.edit.MarkdownModeHelper($this),
            "tmsnippet": new eXide.edit.SnippetModeHelper($this)
        };

        // Initialize CM6 completion source with editor reference
        eXide.edit.CompletionSource.init($this);

        var gotoLineEl = document.getElementById("dialog-goto-line");
        this._gotoLineDlg = eXide.util.DialogManager.create(gotoLineEl, {
            modal: false,
            width: 300,
            height: 200,
            title: "Go to Line",
            buttons: {
                "Goto": function() {
                    var line = gotoLineEl.querySelector('input[name="row"]').value;
                    var column = gotoLineEl.querySelector('input[name="column"]').value;
                    if (column && column != "") {
                        editorUtils.gotoLine($this.editor, parseInt(line), parseInt(column) - 1, true);
                    } else {
                        editorUtils.gotoLine($this.editor, parseInt(line), 0, true);
                    }
                    $this._gotoLineDlg.close();
                    $this.editor.focus();
                },
                "Cancel": function () { $this._gotoLineDlg.close(); $this.editor.focus(); }
            }
        });
        // Handle Enter key in goto-line dialog inputs
        gotoLineEl.querySelectorAll("input").forEach(function(input) {
            input.addEventListener("keyup", function(e) {
                if (e.keyCode == 13) {
                    var gotoBtn = $this._gotoLineDlg.dialog.querySelector(".eXide-dialog-buttons button");
                    if (gotoBtn) gotoBtn.click();
                }
            });
        });

        // drop handler for appending tab to the end
        var dropPlaceholderTab = $this.tabs.querySelector(".drop-placeholder .tab");
        if (dropPlaceholderTab) {
            dropPlaceholderTab.addEventListener("dragover", function(ev) {
                ev.preventDefault();
                this.classList.add("dragover");
            });
            dropPlaceholderTab.addEventListener("dragleave", function(ev) {
                this.classList.remove("dragover");
            });
            dropPlaceholderTab.addEventListener("drop", function(ev) {
                ev.stopImmediatePropagation();
                ev.stopPropagation();
                ev.preventDefault();
                this.classList.remove("dragover");
                var sourceIdx = parseInt(ev.dataTransfer.getData("text/plain"), 10);
                if (isNaN(sourceIdx)) return;
                var allTabs = $this.tabs.querySelectorAll(".tab");
                var sourceTab = allTabs[sourceIdx];
                if (!sourceTab) return;
                var doc = $this.documents[sourceIdx];
                var li = sourceTab.parentNode;
                li.parentNode.removeChild(li);
                var placeholder = $this.tabs.querySelector(".drop-placeholder");
                placeholder.parentNode.insertBefore(li, placeholder);
                $this.documents.splice(sourceIdx, 1);
                $this.documents.push(doc);
                $this.rebuildBuffersMenu();
            });
        }

         // Set up west panel tab bar (collections / outline)
        var outlineData = [{label: "collections", cls: "directory"},{label:'outline', cls:"outline"}];
        var tabsOutline = document.getElementById("tabs-outline");
        outlineData.forEach(function(d, i) {
            var li = document.createElement("li");
            var a = document.createElement("a");
            a.className = "tab";
            a.textContent = d.label;
            a.addEventListener("click", function() {
                tabsOutline.querySelectorAll("a.tab").forEach(function(t, ii) {
                    t.classList.toggle("active", ii === i);
                });
                outlineData.forEach(function(m, ii) {
                    menubar.editor[m.cls].toggle(ii === i);
                });
            });
            if (i === 0) a.classList.add("active");
            menubar.editor[d.cls].toggle(i === 0);
            li.appendChild(a);
            tabsOutline.appendChild(li);
        });
    };

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    Constr.prototype.init = function() {
        if (this.documents.length == 0)
            this.newDocument(null, "xquery");
        this.initializing = false;
        var currentDoc = this.getActiveDocument();
        this.$triggerEvent("activate", [currentDoc]);
    };

    Constr.prototype.setEmmetEnabled = function(enabled) {
        this.enableEmmet = enabled;
        // Emmet not yet supported in CM6 — no-op for now
    };

    Constr.prototype.exec = function () {
        var helper = this.activeDoc.getModeHelper();
        if (helper) {
            var args = Array.prototype.slice.call(arguments, 1);
            helper.exec(arguments[0], this.activeDoc, args);
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
        var text;
        if (data && typeof data == "string") {
            text = data;
        } else if (type && type === "xquery") {
            text = "xquery version \"3.1\";\n\n";
        } else {
            text = "";
        }
        var newDocument = new eXide.edit.Document("untitled-" + newDocId,
                "__new__" + newDocId, text);
        newDocument.saved = true;
        if (type) {
            newDocument.setSyntax(type);
        } else {
            newDocument.setSyntax("text");
        }
        this.$initDocument(newDocument, true);
    };

    Constr.prototype.newDocumentWithText = function(data, mime, resource) {
        var doc = new eXide.edit.Document(resource.name, resource.path, data);
        doc.editable = resource.writable;
        doc.mime = mime;
        doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
        doc.saved = false;
        this.$initDocument(doc);
        if (resource.line) {
            editorUtils.gotoLine(this.editor, resource.line);
        }
    };

    Constr.prototype.newDocumentFromTemplate = function(mode, template) {
        if (!template || template.length == 0) {
            this.newDocument(null, mode);
            return;
        }
        var self = this;
        fetch("api/templates/" + encodeURIComponent(template))
        .then(function(response) { return response.text(); })
        .then(function(data) {
            var newDocId = 0;
            for (var i = 0; i < self.documents.length; i++) {
                var doc = self.documents[i];
                if (doc.path.match(/^__new__(\d+)/)) {
                    newDocId = parseInt(RegExp.$1);
                }
            }
            newDocId++;
            var newDocument = new eXide.edit.Document("untitled-" + newDocId,
                    "__new__" + newDocId, data);
            newDocument.setSyntax(mode);
            newDocument.template = template;
            self.$initDocument(newDocument, true);
        })
        .catch(function(error) {
            eXide.util.error("Failed to load template: " + error.message);
        });
    };

    Constr.prototype.openDocument = function(data, mime, resource, externalPath) {
        var $this = this;
        if (!resource.writable)
            eXide.util.message("Opening " + encodeURI(resource.path) + " readonly!");
        else
            eXide.util.message("Opening " + encodeURI(resource.path));
        if (/\.snippet/.test(resource.name)) {
            mime = "application/tmsnippet";
        } else if (/\.less/.test(resource.name)) {
            mime = "application/less";
        }
        console.log("mime type: %s", mime);
        var doc = new eXide.edit.Document(resource.name, resource.path, data);
        doc.editable = resource.writable;
        doc.mime = mime;
        doc.syntax = eXide.util.mimeTypes.getLangFromMime(mime);
        doc.externalLink = externalPath;
        doc.saved = true;
        if (resource.line) {
            doc._cursorOffset = resource.line; // store as line number, will be resolved in switchTo
        }
        console.log("opening %s, mime: %s, syntax: %s, line: %i", resource.name, doc.mime, doc.syntax, resource.line);
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

        // Save old document state before switching
        if ($this.activeDoc) {
            $this.activeDoc._text = $this.editor.state.doc.toString();
            $this.activeDoc._cursorOffset = $this.editor.state.selection.main.head;
            $this.activeDoc._annotations = editorUtils.getAnnotations($this.editor);
            $this.activeDoc._view = null;
        }

        $this.$setMode(doc, setMime);
        $this.addTab(doc);

        // Switch the editor view to this document
        $this.$switchView(doc);
        $this.editor.focus();

        eXide.app.toggleRunStatus(doc);
        if (doc.getModeHelper()) {
            doc.getModeHelper().activate(doc);
        }
    };

    /**
     * Switch the CM6 view to display a document's content.
     * Sets _switching flag to prevent the updateListener from marking
     * the document as unsaved due to the content replacement.
     */
    Constr.prototype.$switchView = function(doc) {
        this._switching = true;
        try {
            var text = doc._text || "";
            var langExt = getLanguageExtension(doc.getSyntax());

            // IMPORTANT: Disable read-only FIRST so the content change is not
            // silently rejected by CM6's readOnly facet (which filters out
            // document-change transactions).
            this.editor.dispatch({
                effects: this._readOnlyCompartment.reconfigure(
                    EditorState.readOnly.of(false)
                )
            });

            // Set the document content and language mode in one dispatch
            this.editor.dispatch({
                changes: { from: 0, to: this.editor.state.doc.length, insert: text },
                effects: this._languageCompartment.reconfigure(langExt)
            });

            // Now set the correct read-only state for this document
            this.editor.dispatch({
                effects: this._readOnlyCompartment.reconfigure(
                    EditorState.readOnly.of(!doc.editable)
                )
            });

            // Store view reference on document
            doc._view = this.editor;

            // Restore cursor position if saved
            if (typeof doc._cursorOffset === "number" && doc._cursorOffset > 0) {
                // If stored as a line number (from openDocument), convert to offset
                var offset;
                if (doc._cursorOffset < this.editor.state.doc.lines) {
                    offset = editorUtils.rowColToOffset(this.editor.state, doc._cursorOffset, 0);
                } else {
                    offset = Math.min(doc._cursorOffset, this.editor.state.doc.length);
                }
                this.editor.dispatch({
                    selection: { anchor: offset },
                    scrollIntoView: true
                });
                doc._cursorOffset = 0;
            }

            // Restore annotations
            if (doc._annotations && doc._annotations.length > 0) {
                editorUtils.setAnnotations(this.editor, doc._annotations);
            }
        } finally {
            this._switching = false;
        }
    };

    Constr.prototype.setMode = function(mode) {
        this.activeDoc.syntax = mode;
        this.$setMode(this.activeDoc, true);
        // Reconfigure language
        var langExt = getLanguageExtension(mode);
        this.editor.dispatch({
            effects: this._languageCompartment.reconfigure(langExt)
        });
        // Clear old diagnostics, invalidate AST, and re-validate with the new mode helper
        this.activeDoc._annotations = [];
        editorUtils.clearAnnotations(this.editor);
        this.activeDoc.ast = null;
        this.activeDoc.lastValidation = 0;
        this.validator.triggerNow(this.activeDoc);
    };

    Constr.prototype.$setMode = function(doc, setMime) {
        switch (doc.getSyntax()) {
        case "xquery":
            if (setMime)
                doc.mime = "application/xquery";
            break;
        case "xml":
            if (setMime)
                doc.mime = "application/xml";
            break;
        case "html":
            if (setMime) {
                if (doc.template == 'html')
                    doc.mime = "text/html";
                    else doc.mime = "application/xhtml+xml";
            }
            break;
        case "javascript":
            if (setMime)
                doc.mime = "application/x-javascript";
            break;
        case "css":
            if (setMime)
                doc.mime = "text/css";
            break;
        case "text":
            if (setMime)
                doc.mime = "text/text";
            break;
        case "less":
            if (setMime)
                doc.mime = "application/less";
            break;
        case "tmsnippet":
            if (setMime)
                doc.mime = "application/tmsnippet";
            break;
        case "json":
            if (setMime)
                doc.mime = "application/json";
            break;
        case "markdown":
            if (setMime)
                doc.mime = "text/x-markdown";
        }
        eXide.util.Snippets.init(doc.getSyntax());
        var mode = this.modes[doc.getSyntax()];
        if (!mode) {
            mode = new eXide.edit.ModeHelper(this);
        }
        doc.setModeHelper(mode);
    };

    Constr.prototype.closeDocument = function(docToClose) {
        var doc = docToClose || this.activeDoc;
        this.$triggerEvent("close", [doc]);
        var tabLink = document.querySelector("#tabs a[title=\"" + doc.path + "\"]");
        if (tabLink) tabLink.parentNode.remove();
        this.menubar.remove("editors", doc.path);
        for (var i = 0; i < this.documents.length; i++) {
            if (this.documents[i].path == doc.path) {
                this.documents.splice(i, 1);
            }
        }
        // Clear view reference
        doc._view = null;

        if (this.documents.length == 0)
            this.newDocument(null, "xquery");
        else {
            this.activeDoc = this.documents[this.documents.length - 1];
            var activeTabLink = document.querySelector("#tabs a[title=\"" + this.activeDoc.path + "\"]");
            if (activeTabLink) activeTabLink.classList.add("active");
            this.$switchView(this.activeDoc);
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

        var encodedPath = $this.activeDoc.path.replace(/^\//, "").split("/").map(encodeURIComponent).join("/");
        fetch("api/storage/" + encodedPath, {
            method: "PUT",
            headers: {
                "Content-Type": $this.activeDoc.mime ? $this.activeDoc.mime : "application/octet-stream"
            },
            body: $this.activeDoc.getText()
        })
        .then(function(response) {
            if (!response.ok) {
                return response.text().then(function(text) {
                    throw new Error(text);
                });
            }
            return response.json();
        })
        .then(function(data) {
            if (data.status == "error") {
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

                var mode = $this.activeDoc.getModeHelper();
                if (mode) {
                    mode.documentSaved($this.activeDoc);
                }
                $this.$triggerEvent("saved", [$this.activeDoc]);
            }
        })
        .catch(function(error) {
            $this.activeDoc.path = oldPath;
            $this.activeDoc.name = oldName;
            if (errorHandler) {
                errorHandler.apply($this.activeDoc, [error.message]);
            } else {
                eXide.util.error(error.message);
            }
        });
    };

    Constr.prototype.reload = function(data) {
        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: data }
        });
        this.activeDoc._text = data;
        this.activeDoc.saved = true;
        this.updateTabStatus(this.activeDoc.path, this.activeDoc);
    };

    Constr.prototype.getDocument = function(path) {
        path = eXide.util.normalizePath(path);
        for (var i = 0; i < this.documents.length; i++) {
            if (this.documents[i].path == path)
                return this.documents[i];
        }
        return null;
    };

    Constr.prototype.onInput = function (doc, delta) {
        var mode = doc.getModeHelper();
        if (mode && mode.onInput) {
            mode.onInput(doc, delta);
        }
    };

    Constr.prototype.historyBack = function() {
        var item = this.history.pop();
        if (item) {
            console.log("history event: going to %s at line %d", item.path, item.line);
            eXide.app.findDocument(item.path, item.line + 1);
        }
    };

    Constr.prototype.getHeight = function () {
        return document.getElementById("fullscreen").offsetHeight;
    };

    Constr.prototype.getWidth = function () {
        return this.container.offsetWidth;
    };

    Constr.prototype.getOffset = function() {
        var rect = this.container.getBoundingClientRect();
        return { left: rect.left + window.pageXOffset, top: rect.top + window.pageYOffset };
    };

    Constr.prototype.resize = function () {
        // CM6 auto-resizes; trigger a re-measure if needed
        this.editor.requestMeasure();
    };

    Constr.prototype.clearErrors = function () {
        editorUtils.clearAnnotations(this.editor);
    };

    Constr.prototype.forEachDocument = function(callback) {
        var docs = this.documents.slice(0);
        for (var i = 0; i < docs.length; i++) {
            callback(docs[i]);
        }
    };

    Constr.prototype.gotoLine = function() {
        var gotoLineEl = this._gotoLineDlg.content;
        gotoLineEl.querySelectorAll("input[type='text']").forEach(function(inp) { inp.value = ""; });
        this._gotoLineDlg.open();
        var rowInput = gotoLineEl.querySelector('input[name="row"]');
        if (rowInput) rowInput.focus();
    };

    Constr.prototype.addTab = function(doc) {
        var $this = this;
        var tabId = "t" + $this.tabCounter++;
        var label = doc.name;
        if (label.length > 16) {
            label = label.substring(0, 13) + "...";
        }

        $this.tabs.querySelectorAll("li a").forEach(function(a) { a.classList.remove("active"); });

        var li = document.createElement("li");
        var tab = document.createElement("a");
        var tabLabel = document.createElement("span");
        tabLabel.className = "tab-label";
        tabLabel.textContent = label;
        tab.appendChild(tabLabel);
        var indicator = document.createElement("span");
        indicator.className = "tab-indicator";
        var closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.textContent = "\u00d7";
        closeBtn.addEventListener("click", function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            $this.closeDocument(doc);
        });
        indicator.appendChild(closeBtn);
        var modDot = document.createElement("span");
        modDot.className = "tab-modified";
        indicator.appendChild(modDot);
        tab.appendChild(indicator);
        tab.className = "tab active" + (doc.saved ? "" : " modified");
        tab.id = tabId;
        tab.title = doc.path;
        tab.draggable = true;
        li.appendChild(tab);

        tab.addEventListener("click", function (ev) {
            ev.preventDefault();
            $this.switchTo(doc);
        });

        // Native HTML5 drag start
        tab.addEventListener("dragstart", function(ev) {
            var allTabs = Array.prototype.slice.call($this.tabs.querySelectorAll(".tab"));
            var idx = allTabs.indexOf(this);
            ev.dataTransfer.setData("text/plain", String(idx));
            ev.dataTransfer.effectAllowed = "move";
            this.style.opacity = "0.8";
            var dropPlaceholder = $this.tabs.querySelector(".drop-placeholder .tab");
            if (dropPlaceholder) dropPlaceholder.style.display = "";
        });
        tab.addEventListener("dragend", function(ev) {
            this.style.opacity = "";
            var dropPlaceholder = $this.tabs.querySelector(".drop-placeholder .tab");
            if (dropPlaceholder) dropPlaceholder.style.display = "none";
        });

        // Native HTML5 drop target (for reordering between tabs)
        tab.addEventListener("dragover", function(ev) {
            ev.preventDefault();
            var rect = this.getBoundingClientRect();
            var onRight = (ev.clientX - rect.left) > rect.width / 2;
            var li = this.parentNode;
            li.classList.remove("drop-left", "drop-right");
            li.classList.add(onRight ? "drop-right" : "drop-left");
        });
        tab.addEventListener("dragleave", function(ev) {
            this.parentNode.classList.remove("drop-left", "drop-right");
        });
        tab.addEventListener("drop", function(ev) {
            ev.stopImmediatePropagation();
            ev.stopPropagation();
            ev.preventDefault();
            var li = this.parentNode;
            var insertAfter = li.classList.contains("drop-right");
            li.classList.remove("drop-left", "drop-right");
            var allTabs = Array.prototype.slice.call($this.tabs.querySelectorAll(".tab"));
            var sourceIdx = parseInt(ev.dataTransfer.getData("text/plain"), 10);
            var targetIdx = allTabs.indexOf(this);
            if (isNaN(sourceIdx) || sourceIdx === targetIdx) return;
            var sourceTab = allTabs[sourceIdx];
            if (!sourceTab) return;
            var sourceLi = sourceTab.parentNode;
            var targetLi = this.parentNode;
            sourceLi.parentNode.removeChild(sourceLi);
            if (insertAfter) {
                targetLi.parentNode.insertBefore(sourceLi, targetLi.nextSibling);
            } else {
                targetLi.parentNode.insertBefore(sourceLi, targetLi);
            }
            // Rebuild documents array from new tab order
            var newTabs = $this.tabs.querySelectorAll(".tab");
            var newDocs = [];
            for (var i = 0; i < newTabs.length; i++) {
                var path = newTabs[i].title;
                for (var j = 0; j < $this.documents.length; j++) {
                    if ($this.documents[j].path === path) {
                        newDocs.push($this.documents[j]);
                        break;
                    }
                }
            }
            $this.documents = newDocs;
            $this.rebuildBuffersMenu();
        });

        var placeholder = $this.tabs.querySelector(".drop-placeholder");
        if (placeholder) {
            placeholder.parentNode.insertBefore(li, placeholder);
        } else {
            $this.tabs.querySelector("ul").appendChild(li);
        }

        $this.menubar.add("editors", label, tab.title, $this.documents.length + 1, function() {
            $this.switchTo(doc);
        });

        $this.activeDoc = doc;
        $this.documents.push(doc);
        if (!$this.initializing) {
            $this.$triggerEvent("activate", [doc]);
        }
        $this.scrollToTab(tab);
    };

    Constr.prototype.rebuildBuffersMenu = function() {
        var self = this;
        self.menubar.removeAll("editors");
        self.documents.forEach(function(doc, idx) {
            var label = doc.name;
            if (label.length > 16) {
                label = label.substring(0, 13) + "...";
            }
            if (!doc.saved)
                label += "*";
            self.menubar.add("editors", label, doc.path, idx + 1, function() {
                self.switchTo(doc);
            });
        });
    };

    Constr.prototype.selectTab = function(pos) {
        var self = this;
        if (pos >= 0 && pos < this.documents.length) {
            this.switchTo(this.documents[pos]);
        } else {
            var items = [];
            for (var i = 0; i < this.documents.length; i++) {
                items.push({
                    label: this.documents[i].name,
                    pos: i
                });
            }
            if (items.length > 0) {
                eXide.util.QuickPicker.show(items, function (selected) {
                    if (selected) {
                        self.switchTo(self.documents[selected.pos]);
                    }
                }, { placeholder: "Switch to file\u2026" });
            }
        }
    };

    Constr.prototype.switchTo = function(doc) {
        // Save current document state before switching
        if (this.activeDoc && this.activeDoc !== doc) {
            this.activeDoc._text = this.editor.state.doc.toString();
            this.activeDoc._cursorOffset = this.editor.state.selection.main.head;
            this.activeDoc._annotations = editorUtils.getAnnotations(this.editor);
            this.activeDoc._view = null;

            var helper = this.activeDoc.getModeHelper();
            if (helper) {
                helper.deactivate(doc);
            }
        }

        this.$switchView(doc);
        this.activeDoc = doc;
        var $this = this;
        $this.tabs.querySelectorAll("a").forEach(function (el) {
            if (el.title == doc.path) {
                el.classList.add("active");
                $this.scrollToTab(el);
            } else {
                el.classList.remove("active");
            }
        });
        this.updateStatus("");
        this.$triggerEvent("activate", [doc]);

        eXide.app.toggleRunStatus(doc);
        var helper = doc.getModeHelper();
        if (helper) {
            helper.activate(doc);
        }
        if (!this.activeDoc.ast) {
            this.validator.triggerNow(this.activeDoc);
        }
    };

    Constr.prototype.updateTabStatus = function(oldPath, doc) {
        var label = doc.name;
        if (label.length > 16) {
            label = label.substring(0, 13) + "...";
        }
        var tabLink = this.tabs.querySelector("a[title=\"" + oldPath + "\"]");
        if (tabLink) {
            tabLink.setAttribute("title", doc.path);
            var tabLabel = tabLink.querySelector(".tab-label");
            if (tabLabel) {
                tabLabel.textContent = label;
            }
            tabLink.classList.toggle("modified", !doc.saved);
        }
    };

    Constr.prototype.scrollToTab = function (current) {
        var strip = document.getElementById("tab-strip-wrap");
        if (!strip) return;
        current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    };

    Constr.prototype.setTheme = function(theme) {
        console.log("Changing theme to %s", theme);
        var isDark = (theme === "dark");
        var themeExt = isDark ? CM6.oneDarkTheme : [];
        this.editor.dispatch({
            effects: this._themeCompartment.reconfigure(themeExt)
        });
        this.$triggerEvent("setTheme", [{ isDark: isDark }]);
    };

    /**
     * Update the status bar.
     */
    Constr.prototype.updateStatus = function(msg, href) {
        this.status.textContent = msg;
        if (href) {
            this.status.href = href;
        }
    };

    Constr.prototype.evalError = function(msg, gotoLine) {
        var str = /.*line\s(\d+)/i.exec(msg);
        var line = -1;
        if (str) {
            line = parseInt(str[1]);
        }
        if (gotoLine) {
            this.editor.focus();
            editorUtils.gotoLine(this.editor, line);
        }

        var annotation = [{
                row: line - 1,
                text: msg,
                type: "error"
        }];
        this.updateStatus(msg);
        editorUtils.setAnnotations(this.editor, annotation);
    };

    Constr.prototype.focus = function() {
        this.editor.focus();
    };

    Constr.prototype.saveState = function() {
        var $this = this;
        var i = 0;
        this.documents.forEach(function (doc, index) {
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
