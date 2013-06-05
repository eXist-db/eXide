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
eXide.namespace("eXide.util.Help");

/**
 * Singleton object: Help dialog.
 *
 */
eXide.util.Help = (function () {
    
    var sections = null;
    var currentPage = -1;
    
    $(document).ready(function() {
    	$(document.body).append(
				"<div id=\"eXide-dialog-help\">" +
				"	<div class=\"help\" id=\"eXide-dialog-help-body\"></div>" +
				"</div>"
		);
		helpDialog = $("#eXide-dialog-help");
		
		helpDialog.dialog({
            appendTo: "#layout-container",
			modal: false,
            title: "Quick Start",
			autoOpen: false,
            width: 600,
            height: 400,
			buttons: {
                "OK" : function() { $(this).dialog("close"); },
                "Next": function () { eXide.util.Help.next(); },
                "Previous": function () { eXide.util.Help.previous(); }
			}
		});
        
        // eXide.util.Help.showFirstTime();
    });
    
    return {
    	
		show: function () {
			helpDialog.dialog("open");
            if (!sections) {
                eXide.util.Help.load();
            } else {
                eXide.util.Help.next();
            }
		},
        
        next: function() {
            if (currentPage + 1 < sections.length) {
                currentPage++;
                $("#eXide-dialog-help-body").html(sections[currentPage]);
            }
        },
        
        previous: function() {
            if (currentPage > 0) {
                currentPage--;
                $("#eXide-dialog-help-body").html(sections[currentPage]);
            }
        },
        
        showFirstTime: function() {
            if (!eXide.util.supportsHtml5Storage)
			    return;
            // if local storage contains eXide properties, the app has already
            // been started before and we do not show the help dialog on startup
            var showHints = localStorage.getItem("eXide.hints");
            if (!showHints || showHints == 1) {
                eXide.util.Help.show();
            }
        },
        
        load: function() {
            $.ajax({
    			url: "help.html",
				type: "GET",
				success: function (data) {
                    sections = $("section", data);
                    eXide.util.Help.show();
				},
				error: function (xhr, status) {
					if (xhr.status == 404) {
						eXide.util.error("Failed to open help texts.");
					} else {
						eXide.util.Dialog.warning("Deployment Error", "<p>An error has been reported by the database:</p>" +
							"<p>" + xhr.responseText + "</p>");
					}
                    helpDialog.dialog("close");
				}
			});
        }
    }
}());