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
eXide.namespace("eXide.util.Preferences");

/**
 * Singleton object: Preferences dialog.
 *
 */
eXide.util.Preferences = (function () {

    var defaultPreferences = {
        theme: "light",
		fontSize: 14,
        font: "Default",
		showInvisibles: false,
        autoPair: true,
		showPrintMargin: true,
		showHScroll: false,
        indent: -1,
        indentSize: 4,
        indentOnOpen: true,
        indentOnDownload: true,
        indentOnDownloadPackage: false,
        expandXIncludesOnOpen: false,
        expandXIncludesOnDownload: false,
        expandXIncludesOnDownloadPackage: false,
        omitXMLDeclarationOnOpen: true,
        omitXMLDeclarationOnDownload: true,
        omitXMLDeclarationOnDownloadPackage: true,
        softWrap: -1,
        emmet: false,
        prettierPrintWidth: 80,
        prettierSingleQuote: false,
        prettierXmlWhitespaceSensitivity: "ignore",
        prettierXmlSelfClosingSpace: true,
        prettierXmlSortAttributesByKey: false,
        prettierXmlQuoteAttributes: "preserve",
        prettierSingleAttributePerLine: false,
        prettierBracketSameLine: true,
        prettierBracketSpacing: true,
        prettierSemi: true,
        prettierTrailingComma: "all",
        prettierArrowParens: "always",
        prettierProseWrap: "preserve",
        prettierHtmlWhitespaceSensitivity: "css",
        splitPane: false,
        showWestPanel: true,
        showSouthPanel: false,
        showEastPanel: false,
        collectionsView: "tree"
	};
    
    Constr = function(editor) {
        this.editor = editor;
        this.preferences = Object.assign({}, defaultPreferences);
        var $this = this;

        var container = document.getElementById("preferences-dialog");
        container.querySelectorAll("select, input").forEach(function(el) {
            el.addEventListener("change", function() {
                $this.updatePreferences();
            });
        });

        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function() {
            if ($this.preferences.theme === "system") {
                $this.applyPreferences();
                $this.save();
            }
        });

        this._dialog = eXide.util.DialogManager.create(container, {
            appendTo: "#layout-container",
    		title: "Preferences",
			modal: false,
			height: 400,
			width: 600,
			buttons: {
                "Reset Defaults": function () {
                    $this.preferences = Object.assign({}, defaultPreferences);
                    $this.updateForm();
                },
				"Close": function () { this.close(); editor.focus(); }
			}
		});
    };
    
    Constr.prototype.show = function() {
        this.updateForm();
		this._dialog.open();
    };
    
    Constr.prototype.updateForm = function() {
        var form = document.querySelector("#preferences-dialog form");
        form.querySelector('select[name="theme"]').value = this.preferences.theme;
		form.querySelector('select[name="font-size"]').value = this.preferences.fontSize;
        form.querySelector('select[name="font"]').value = this.preferences.font;
		form.querySelector('input[name="indent-on-open"]').checked = this.preferences.indentOnOpen;
		form.querySelector('input[name="indent-on-download"]').checked = this.preferences.indentOnDownload;
		form.querySelector('input[name="indent-on-download-package"]').checked = this.preferences.indentOnDownloadPackage;
		form.querySelector('input[name="expand-xincludes-on-open"]').checked = this.preferences.expandXIncludesOnOpen;
		form.querySelector('input[name="expand-xincludes-on-download"]').checked = this.preferences.expandXIncludesOnDownload;
		form.querySelector('input[name="expand-xincludes-on-download-package"]').checked = this.preferences.expandXIncludesOnDownloadPackage;
		form.querySelector('input[name="omit-xml-decl-on-open"]').checked = this.preferences.omitXMLDeclarationOnOpen;
		form.querySelector('input[name="omit-xml-decl-on-download"]').checked = this.preferences.omitXMLDeclarationOnDownload;
		form.querySelector('input[name="omit-xml-decl-on-download-package"]').checked = this.preferences.omitXMLDeclarationOnDownloadPackage;
		form.querySelector('input[name="show-invisibles"]').checked = this.preferences.showInvisibles;
        form.querySelector('input[name="auto-pair"]').checked = this.preferences.autoPair;
		form.querySelector('input[name="print-margin"]').checked = this.preferences.showPrintMargin;
		form.querySelector('input[name="emmet"]').checked = this.preferences.emmet;
		form.querySelector('input[name="split-pane"]').checked = this.preferences.splitPane;
		// Sync panel prefs from actual state
		if (typeof eXide !== 'undefined' && eXide.app && eXide.app.isWestPanelVisible) {
		    this.preferences.showWestPanel = eXide.app.isWestPanelVisible();
		    this.preferences.showSouthPanel = eXide.app.isSouthPanelVisible();
		}
		form.querySelector('input[name="show-west"]').checked = this.preferences.showWestPanel;
		form.querySelector('input[name="show-south"]').checked = this.preferences.showSouthPanel;
		// Sync east panel pref from actual state
		if (typeof eXide !== 'undefined' && eXide.app && eXide.app.isEastPanelVisible) {
		    this.preferences.showEastPanel = eXide.app.isEastPanelVisible();
		}
		form.querySelector('input[name="show-east"]').checked = this.preferences.showEastPanel;
		form.querySelector('select[name="collections-view"]').value = this.preferences.collectionsView;
		form.querySelector('select[name="prettier-print-width"]').value = this.preferences.prettierPrintWidth;
		form.querySelector('input[name="prettier-single-quote"]').checked = this.preferences.prettierSingleQuote;
		form.querySelector('select[name="prettier-xml-ws"]').value = this.preferences.prettierXmlWhitespaceSensitivity;
		form.querySelector('input[name="prettier-xml-self-closing-space"]').checked = this.preferences.prettierXmlSelfClosingSpace;
		form.querySelector('input[name="prettier-xml-sort-attrs"]').checked = this.preferences.prettierXmlSortAttributesByKey;
		form.querySelector('select[name="prettier-xml-quote-attrs"]').value = this.preferences.prettierXmlQuoteAttributes;
		form.querySelector('input[name="prettier-single-attr-per-line"]').checked = this.preferences.prettierSingleAttributePerLine;
		form.querySelector('input[name="prettier-bracket-same-line"]').checked = this.preferences.prettierBracketSameLine;
		form.querySelector('input[name="prettier-bracket-spacing"]').checked = this.preferences.prettierBracketSpacing;
		form.querySelector('input[name="prettier-semi"]').checked = this.preferences.prettierSemi;
		form.querySelector('select[name="prettier-trailing-comma"]').value = this.preferences.prettierTrailingComma;
		form.querySelector('select[name="prettier-arrow-parens"]').value = this.preferences.prettierArrowParens;
		form.querySelector('select[name="prettier-prose-wrap"]').value = this.preferences.prettierProseWrap;
		form.querySelector('select[name="prettier-html-ws"]').value = this.preferences.prettierHtmlWhitespaceSensitivity;

        var indent = this.preferences.indent;
        var indentSize = this.preferences.indentSize;
        if (indent === 0) {
            indent = "Tabs";
        } else if (indent === -1) {
            indent = "Spaces";
        }
        form.querySelector('select[name="indent"]').value = indent;
        form.querySelector('select[name="indent-size"]').value = indentSize;

        var wrap = this.preferences.softWrap;
        if (wrap === 0) {
            wrap = "off";
        } else if (wrap === -1) {
            wrap = "free";
        }
        form.querySelector('select[name="soft-wrap"]').value = wrap;
    };
    
    Constr.prototype.updatePreferences = function() {
        var form = document.querySelector("#preferences-dialog form");
        this.preferences.theme = form.querySelector('select[name="theme"]').value;
		this.preferences.fontSize = parseInt(form.querySelector('select[name="font-size"]').value);
        this.preferences.font = form.querySelector('select[name="font"]').value;
		this.preferences.showInvisibles = form.querySelector('input[name="show-invisibles"]').checked;
        this.preferences.autoPair = form.querySelector('input[name="auto-pair"]').checked;
		this.preferences.showPrintMargin = form.querySelector('input[name="print-margin"]').checked;
		this.preferences.emmet = form.querySelector('input[name="emmet"]').checked;
		this.preferences.splitPane = form.querySelector('input[name="split-pane"]').checked;
		this.preferences.showWestPanel = form.querySelector('input[name="show-west"]').checked;
		this.preferences.showSouthPanel = form.querySelector('input[name="show-south"]').checked;
		this.preferences.showEastPanel = form.querySelector('input[name="show-east"]').checked;
		this.preferences.collectionsView = form.querySelector('select[name="collections-view"]').value;
		this.preferences.prettierPrintWidth = parseInt(form.querySelector('select[name="prettier-print-width"]').value, 10);
		this.preferences.prettierSingleQuote = form.querySelector('input[name="prettier-single-quote"]').checked;
		this.preferences.prettierXmlWhitespaceSensitivity = form.querySelector('select[name="prettier-xml-ws"]').value;
		this.preferences.prettierXmlSelfClosingSpace = form.querySelector('input[name="prettier-xml-self-closing-space"]').checked;
		this.preferences.prettierXmlSortAttributesByKey = form.querySelector('input[name="prettier-xml-sort-attrs"]').checked;
		this.preferences.prettierXmlQuoteAttributes = form.querySelector('select[name="prettier-xml-quote-attrs"]').value;
		this.preferences.prettierSingleAttributePerLine = form.querySelector('input[name="prettier-single-attr-per-line"]').checked;
		this.preferences.prettierBracketSameLine = form.querySelector('input[name="prettier-bracket-same-line"]').checked;
		this.preferences.prettierBracketSpacing = form.querySelector('input[name="prettier-bracket-spacing"]').checked;
		this.preferences.prettierSemi = form.querySelector('input[name="prettier-semi"]').checked;
		this.preferences.prettierTrailingComma = form.querySelector('select[name="prettier-trailing-comma"]').value;
		this.preferences.prettierArrowParens = form.querySelector('select[name="prettier-arrow-parens"]').value;
		this.preferences.prettierProseWrap = form.querySelector('select[name="prettier-prose-wrap"]').value;
		this.preferences.prettierHtmlWhitespaceSensitivity = form.querySelector('select[name="prettier-html-ws"]').value;
        this.preferences.indentOnOpen = form.querySelector('input[name="indent-on-open"]').checked;
        this.preferences.indentOnDownload = form.querySelector('input[name="indent-on-download"]').checked;
        this.preferences.indentOnDownloadPackage = form.querySelector('input[name="indent-on-download-package"]').checked;
        this.preferences.expandXIncludesOnOpen = form.querySelector('input[name="expand-xincludes-on-open"]').checked;
        this.preferences.expandXIncludesOnDownload = form.querySelector('input[name="expand-xincludes-on-download"]').checked;
        this.preferences.expandXIncludesOnDownloadPackage = form.querySelector('input[name="expand-xincludes-on-download-package"]').checked;
        this.preferences.omitXMLDeclarationOnOpen = form.querySelector('input[name="omit-xml-decl-on-open"]').checked;
        this.preferences.omitXMLDeclarationOnDownload = form.querySelector('input[name="omit-xml-decl-on-download"]').checked;
        this.preferences.omitXMLDeclarationOnDownloadPackage = form.querySelector('input[name="omit-xml-decl-on-download-package"]').checked;

        var indent = form.querySelector('select[name="indent"]').value;
        var indentSize = parseInt(form.querySelector('select[name="indent-size"]').value, 10);
        if (indent === "Spaces") {
            indent = -1;
        } else if (indent === "Tabs") {
            indent = 0;
        }
        this.preferences.indent = parseInt(indent, 10);
        this.preferences.indentSize = parseInt(indentSize, 10);

        var wrap = form.querySelector('select[name="soft-wrap"]').value;
        if (wrap === "free") {
            wrap = -1;
        } else if (wrap === "off") {
            wrap = 0;
        }
        this.preferences.softWrap = parseInt(wrap, 10);
	this.applyPreferences();
    };
    
    // Map old Ace theme names to "light" or "dark"
    var ACE_DARK_THEMES = {
        ambiance: true, chaos: true, clouds_midnight: true, cobalt: true,
        dracula: true, idle_fingers: true, kr_theme: true, merbivore: true,
        merbivore_soft: true, mono_industrial: true, monokai: true,
        pastel_on_dark: true, solarized_dark: true, terminal: true,
        tomorrow_night: true, tomorrow_night_blue: true,
        tomorrow_night_bright: true, tomorrow_night_eighties: true,
        twilight: true, vibrant_ink: true
    };

    function migrateTheme(theme) {
        if (theme === "light" || theme === "dark" || theme === "system") return theme;
        return ACE_DARK_THEMES[theme] ? "dark" : "light";
    }

    function resolveTheme(theme) {
        if (theme === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return theme;
    }

    Constr.prototype.applyPreferences = function () {
        this.preferences.theme = migrateTheme(this.preferences.theme);
		this.editor.setTheme(resolveTheme(this.preferences.theme));
		// Sync the toolbar dark-mode icon with the resolved theme
		if (typeof eXide !== 'undefined' && eXide.app && eXide.app.updateDarkModeIcon) {
		    eXide.app.updateDarkModeIcon(resolveTheme(this.preferences.theme));
		}

        // Store preferences on editor for use during document switching
        this.editor._preferences = this.preferences;

        // Apply wrap and indent settings via CSS / CM6 extensions
        // CM6 handles word wrap via EditorView.lineWrapping extension (configured in editor.js)
        // Indent/tab settings are applied when building extensions

        if (this.preferences.font && this.preferences.font !== "Default") {
            var font = this.preferences.font + ", monospace";
            document.querySelectorAll("#editor .cm-editor, #editor .cm-content").forEach(function(el) {
                el.style.fontFamily = font;
            });
            document.getElementById("outline").style.fontFamily = font;
            document.getElementById("results-body").style.fontFamily = font;
        } else {
            document.querySelectorAll("#editor .cm-editor, #editor .cm-content").forEach(function(el) {
                el.style.fontFamily = "";
            });
            document.getElementById("outline").style.fontFamily = "";
            document.getElementById("results-body").style.fontFamily = "";
        }

        // Reconfigure CM6 compartments
        if (this.editor.editor) {
            var effects = [];

            // Auto-pair brackets/quotes
            if (this.editor._autoPairCompartment) {
                var ap = this.preferences.autoPair;
                effects.push(this.editor._autoPairCompartment.reconfigure(
                    ap ? [CM6.closeBrackets(), CM6.keymap.of(CM6.closeBracketsKeymap)] : []
                ));
            }

            // Line wrapping
            if (this.editor._lineWrappingCompartment) {
                var wrap = this.preferences.softWrap;
                effects.push(this.editor._lineWrappingCompartment.reconfigure(
                    wrap !== 0 ? [CM6.EditorView.lineWrapping] : []
                ));
            }

            // Show invisibles (whitespace characters)
            if (this.editor._showInvisiblesCompartment) {
                var inv = this.preferences.showInvisibles;
                effects.push(this.editor._showInvisiblesCompartment.reconfigure(
                    inv ? [CM6.highlightWhitespace(), CM6.highlightTrailingWhitespace()] : []
                ));
            }

            if (effects.length > 0) {
                this.editor.editor.dispatch({ effects: effects });
            }
        }

        // Font size via CSS on the CM6 container
        document.querySelectorAll(".cm-editor").forEach(function(el) {
            el.style.fontSize = this.preferences.fontSize + "px";
        }.bind(this));
        // Split pane
        var pw = document.querySelector('.panel-west');
        var btn = document.getElementById('toggle-split-pane');
        if (pw) {
            pw.classList.toggle('split-pane', !!this.preferences.splitPane);
        }
        if (btn) {
            btn.setAttribute('aria-pressed', this.preferences.splitPane ? 'true' : 'false');
            btn.textContent = this.preferences.splitPane ? '\u229E' : '\u229F';
        }

        // Panel visibility
        if (typeof eXide !== 'undefined' && eXide.app && eXide.app.setWestPanel) {
            eXide.app.setWestPanel(!!this.preferences.showWestPanel);
            eXide.app.setSouthPanel(!!this.preferences.showSouthPanel);
            eXide.app.setEastPanel(!!this.preferences.showEastPanel);
        }

        // Collections view (tree vs folder)
        if (typeof eXide !== 'undefined' && eXide.app && eXide.app.setCollectionsView) {
            eXide.app.setCollectionsView(this.preferences.collectionsView);
        }

		this.editor.resize();
	};
	
    Constr.prototype.get = function(key) {
        return this.preferences[key];
    };
    
    Constr.prototype.read = function() {
        var sameVersion = true;
        if (localStorage["eXide.preferences"]) {
            const loaded = JSON.parse(localStorage.getItem("eXide.preferences"));
            this.preferences = Object.assign({}, defaultPreferences, loaded);
            sameVersion = !loaded.version || (loaded.version === eXide.app.version());
        }

        this.preferences.version = eXide.app.version();

		this.applyPreferences();
		this.updateForm();
		return sameVersion;
    };
    
    Constr.prototype.save = function() {
        localStorage.setItem("eXide.preferences", JSON.stringify(this.preferences));
        localStorage.setItem("eXide.firstTime", 0);
    };
    
    return Constr;
}());
