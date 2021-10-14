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
        theme: "tomorrow",
		fontSize: 14,
        font: "Default",
		showInvisibles: false,
		showPrintMargin: true,
		showHScroll: false,
        indent: -1,
        indentSize: 4,
        softWrap: -1,
        emmet: false
	};
    
    Constr = function(editor) {
        this.editor = editor;
        this.preferences = $.extend({}, defaultPreferences);
        var $this = this;
        
        var container = $("#preferences-dialog");
        $("select, input", container).change(function() {
            $this.updatePreferences();
        });
        
        $("#preferences-dialog").dialog({
            appendTo: "#layout-container",
    		title: "Preferences",
			modal: false,
			autoOpen: false,
			height: 400,
			width: 600,
			buttons: {
				"Close": function () { $(this).dialog("close"); editor.focus(); },
                "Reset Defaults": function () {
                    $this.preferences = $.extend({}, defaultPreferences);
                    $this.updateForm();
                }
			}
		});
    };
    
    Constr.prototype.show = function() {
        this.updateForm();
		$("#preferences-dialog").dialog("open");
    };
    
    Constr.prototype.updateForm = function() {
        var form = $("#preferences-dialog form");
        $("select[name=\"theme\"]", form).val(this.preferences.theme);
		$("select[name=\"font-size\"]", form).val(this.preferences.fontSize);
        $("select[name=\"font\"]", form).val(this.preferences.font);
		$("input[name=\"show-invisibles\"]", form).attr("checked", this.preferences.showInvisibles);
		$("input[name=\"print-margin\"]", form).attr("checked", this.preferences.showPrintMargin);
		$("input[name=\"emmet\"]", form).attr("checked", this.preferences.emmet);

        var indent = this.preferences.indent;
        var indentSize = this.preferences.indentSize;
        if (indent === 0) {
            indent = "Tabs";
        } else if (indent === -1) {
            indent = "Spaces";
        }
        $("select[name=\"indent\"]", form).val(indent);
        $("select[name=\"indent-size\"]", form).val(indentSize);

        var wrap = this.preferences.softWrap;
        if (wrap === 0) {
            wrap = "off";
        } else if (wrap === -1) {
            wrap = "free";
        }
        $("input[name=\"soft-wrap\"]", form).val(wrap);
    };
    
    Constr.prototype.updatePreferences = function() {
        var form = $("#preferences-dialog form");
        this.preferences.theme = $("select[name=\"theme\"]", form).val();
		this.preferences.fontSize = parseInt($("select[name=\"font-size\"]", form).val());
        this.preferences.font = $("select[name=\"font\"]", form).val();
		this.preferences.showInvisibles = $("input[name=\"show-invisibles\"]", form).is(":checked");
		this.preferences.showPrintMargin = $("input[name=\"print-margin\"]", form).is(":checked");
		this.preferences.emmet = $("input[name=\"emmet\"]", form).is(":checked");

        var indent = $("select[name=\"indent\"]", form).val();
        var indentSize = parseInt($("select[name=\"indent-size\"]", form).val(), 10);
        if (indent === "Spaces") {
            indent = -1;
        } else if (indent === "Tabs") {
            indent = 0;
        }
        this.preferences.indent = parseInt(indent, 10);
        this.preferences.indentSize = parseInt(indentSize, 10);

        var wrap = $("select[name=\"soft-wrap\"]", form).val();
        if (wrap === "free") {
            wrap = -1;
        } else if (wrap === "off") {
            wrap = 0;
        }
        this.preferences.softWrap = parseInt(wrap, 10);
	this.applyPreferences();
    };
    
    Constr.prototype.applyPreferences = function () {
        var $this = this;
		this.editor.setTheme(this.preferences.theme);
		this.editor.editor.setShowInvisibles(this.preferences.showInvisibles);
		this.editor.editor.setShowPrintMargin(this.preferences.showPrintMargin);
		this.editor.setEmmetEnabled(this.preferences.emmet);
        this.editor.forEachDocument(function (doc) {
            if ($this.preferences.softWrap > 0) {
                doc.getSession().setWrapLimitRange($this.preferences.softWrap, $this.preferences.softWrap);
            } else if ($this.preferences.softWrap < 0) {
                doc.getSession().setWrapLimitRange(null, null);
            }
            doc.getSession().setUseWrapMode($this.preferences.softWrap != 0);

            if ($this.preferences.indent < 0) {
                doc.getSession().setTabSize($this.preferences.indentSize);
		        doc.getSession().setUseSoftTabs(true);
            } else if ($this.preferences.indent >= 0) {
                doc.getSession().setUseSoftTabs(false);
            }

        });

        if (this.preferences.font) {
            var font = this.preferences.font + ", monospace";
            $("#editor").css("font-family", font);
            $("#outline").css("font-family", font);
            $("#results-body").css("font-family", font);
        }
            
        this.editor.editor.setFontSize(this.preferences.fontSize + "px");
		this.editor.resize();
	};
	
    Constr.prototype.get = function(key) {
        return this.preferences[key];
    };
    
    Constr.prototype.read = function() {
        var sameVersion = false;
        if (localStorage["eXide.preferences"]) {
            this.preferences = JSON.parse(localStorage.getItem("eXide.preferences"));
            sameVersion = (this.preferences.version === eXide.app.version());
        }

        this.preferences.version = eXide.app.version();
        
		this.applyPreferences();
		return sameVersion;
    };
    
    Constr.prototype.save = function() {
        localStorage.setItem("eXide.preferences", JSON.stringify(this.preferences));
        localStorage.setItem("eXide.firstTime", 0);
    };
    
    return Constr;
}());
