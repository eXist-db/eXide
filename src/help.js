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
    
    $(document).ready(function() {
    	$(document.body).append(
				"<div id=\"eXide-dialog-help\">" +
				"	<div class=\"help\" id=\"eXide-dialog-help-body\"></div>" +
				"</div>"
		);
		helpDialog = $("#eXide-dialog-help");
		
		helpDialog.dialog({
			modal: true,
			autoOpen: false,
            width: 600,
    		height: 400,
			buttons: {
				"OK": function () { $(this).dialog("close"); }
			}
		});
    });
    
    return {
    	
		show: function () {
			helpDialog.dialog("option", "title", "Quick Start");
            $.ajax({
				url: "help.html",
				type: "GET",
				success: function (data) {
					$("#eXide-dialog-help-body").html(data);
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
			helpDialog.dialog("open");
		}
    }
}());