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
eXide.namespace("eXide.util.Preferences");

/**
 * Singleton object: Preferences dialog.
 *
 */
eXide.util.Preferences = (function () {

    var defaultPreferences = {
        theme: "tomorrow",
		fontSize: "14px",
		showInvisibles: false,
		showPrintMargin: true,
		showHScroll: false,
        softWrap: -1
	};
    
    Constr = function(editor) {
        this.editor = editor;
        this.preferences = $.extend({}, defaultPreferences);
        var $this = this;
        $("#preferences-dialog").dialog({
    		title: "Preferences",
			modal: true,
			autoOpen: false,
			height: 400,
			width: 600,
			buttons: {
				"Cancel": function () { $(this).dialog("close"); editor.focus(); },
                "Reset Defaults": function () {
                    $this.preferences = $.extend({}, defaultPreferences);
                    $this.updateForm();
                },
				"Save": function () {
					var form = $("form", this);
					$this.preferences.theme = $("select[name=\"theme\"]", form).val();
					$this.preferences.fontSize = $("select[name=\"font-size\"]", form).val();
					$this.preferences.showInvisibles = $("input[name=\"show-invisibles\"]", form).is(":checked");
					$this.preferences.showPrintMargin = $("input[name=\"print-margin\"]", form).is(":checked");
                    var wrap = $("select[name=\"soft-wrap\"]", form).val();
                    if (wrap === "free") {
                        wrap = -1;
                    } else if (wrap === "off") {
                        wrap = 0;
                    }
                    $this.preferences.softWrap = parseInt(wrap);
					$this.applyPreferences();
					
					$(this).dialog("close");
					editor.focus();
				}
			}
		});
    };
    
    Constr.prototype.show = function() {
        this.updateForm();
		$("#preferences-dialog").dialog("open");
    };
    
    Constr.prototype.updateForm = function() {
        $.log("Updating form");
        var form = $("#preferences-dialog form");
    	$("select[name=\"theme\"]", form).val(this.preferences.theme);
		$("select[name=\"font-size\"]", form).val(this.preferences.fontSize);
		$("input[name=\"show-invisibles\"]", form).attr("checked", this.preferences.showInvisibles);
		$("input[name=\"print-margin\"]", form).attr("checked", this.preferences.showPrintMargin);
        var wrap = this.preferences.softWrap;
        if (wrap == 0) {
            wrap = "off";
        } else if (wrap === -1) {
            wrap = "free";
        }
        $("input[name=\"soft-wrap\"]", form).val(wrap);
    };
    
    Constr.prototype.applyPreferences = function () {
		$.log("Applying preferences: %o", this.preferences);
        var $this = this;
		this.editor.setTheme(this.preferences.theme);
		this.editor.editor.setShowInvisibles(this.preferences.showInvisibles);
		this.editor.editor.renderer.setShowPrintMargin(this.preferences.showPrintMargin);
        this.editor.forEachDocument(function (doc) {
            if ($this.preferences.softWrap > 0) {
                doc.getSession().setWrapLimitRange($this.preferences.softWrap, $this.preferences.softWrap);
            } else if ($this.preferences.softWrap < 0) {
                doc.getSession().setWrapLimitRange(null, null);
            }
            doc.getSession().setUseWrapMode($this.preferences.softWrap != 0);
        });
		$("#editor").css("font-size", this.preferences.fontSize);
		this.editor.resize();
	};
	
    Constr.prototype.get = function(key) {
        return this.preferences[key];
    };
    
    Constr.prototype.read = function() {
        if (localStorage["eXide.preferences"]) {
            this.preferences = JSON.parse(localStorage.getItem("eXide.preferences"));
        }
		this.applyPreferences();
    };
    
    Constr.prototype.save = function() {
        localStorage.setItem("eXide.preferences", JSON.stringify(this.preferences));
        localStorage.setItem("eXide.hints", 0);
    };
    
    return Constr;
}());