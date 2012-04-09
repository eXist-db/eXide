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

// main entry point
$(document).ready(function() {
    // parse query parameters passed in by URL:
    var qs = (function(a) {
        if (a == "") return {};
        var b = {};
        for (var i = 0; i < a.length; ++i)
        {
            var p=a[i].split('=');
            if (p.length != 2) continue;
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
        }
        return b;
    })(window.location.search.substr(1).split('&'));
    
    // check parameters passed in GET request
    eXide.app.init(function (restored) {
        var openDoc = qs["open"];
        var snippet = qs["snip"];
        if (openDoc && !restored[openDoc]) {
            eXide.app.findDocument(qs["open"]);
        } else if (snippet) {
            eXide.app.newDocument(snippet);
        }
    });
});

eXide.namespace("eXide.app");

/**
 * Static class for the main application. Controls the GUI.
 */
eXide.app = (function() {
	
	var editor;

	var deploymentEditor;
	var dbBrowser;
	var preferences;
    
	var hitCount = 0;
	var startOffset = 0;
	var currentOffset = 0;
	var endOffset = 0;
	
	var login = null;
	
	return {

		init: function(afterInitCallback) {
			editor = new eXide.edit.Editor(document.getElementById("editor"));
			deploymentEditor = new eXide.edit.PackageEditor(document.getElementById("deployment-editor"));
			dbBrowser = new eXide.browse.Browser(document.getElementById("open-dialog"));
			preferences = new eXide.util.Preferences(editor);
            
			eXide.app.initGUI();
			
            // save restored paths for later
			var restored = eXide.app.restoreState();
		    
		    editor.init();
		    editor.addEventListener("outlineChange", eXide.app.onOutlineChange);
		    eXide.app.resize();

			$(window).resize(eXide.app.resize);
			
			$(window).unload(function () {
				eXide.app.saveState();
			});
            
            eXide.find.Modules.addEventListener("open", null, function (module) {
                eXide.app.findDocument(module.at);
            });
            eXide.find.Modules.addEventListener("import", null, function (module) {
                editor.exec("importModule", module.prefix, module.uri, module.at);
            });
            
            if (afterInitCallback) {
                afterInitCallback(restored);
            }
		},

		resize: function() {
			var panel = $("#editor");
			var header = $(".header");
//			panel.width($(".ui-layout-center").innerWidth() - 20);
//			panel.css("width", "100%");
//			panel.height($(".ui-layout-center").innerHeight() - header.height());
			editor.resize();
		},

		newDocument: function(data) {
			editor.newDocument(data);
		},

		findDocument: function(path) {
			var doc = editor.getDocument(path);
			if (doc == null) {
				var resource = {
						name: path.match(/[^\/]+$/),
						path: path
				};
				eXide.app.$doOpenDocument(resource);
			} else {
				editor.switchTo(doc);
			}
		},
		
		locate: function(type, path, symbol) {
			if (path == null) {
				editor.exec("locate", type, symbol);
			} else {
				$.log("Locating %s in document %s", symbol, path);
				var doc = editor.getDocument(path);
				if (doc == null) {
					var resource = {
							name: path.match(/[^\/]+$/),
							path: path
					};
					eXide.app.$doOpenDocument(resource, function() {
						editor.exec("locate", type, symbol);
					});
				} else {
					editor.switchTo(doc);
					editor.exec("locate", type, symbol);
				}
			}
		},
		
		openDocument: function() {
			dbBrowser.reload(["reload"], "open");
			$("#open-dialog").dialog("option", "title", "Open Document");
			$("#open-dialog").dialog("option", "buttons", { 
				"cancel": function() { $(this).dialog("close"); editor.focus(); },
				"open": eXide.app.openSelectedDocument
			});
			$("#open-dialog").dialog("open");
		},

		openSelectedDocument: function(close) {
			var resource = dbBrowser.getSelection();
			if (resource) {
				eXide.app.$doOpenDocument(resource);
			}
			if (close == undefined || close)
				$("#open-dialog").dialog("close");
		},

		$doOpenDocument: function(resource, callback) {
			resource.path = eXide.util.normalizePath(resource.path);
            var doc = editor.getDocument(resource.path);
            if (doc) {
                editor.switchTo(doc);
                return;
            }
			$.ajax({
				url: "modules/load.xql?path=" + resource.path,
				dataType: 'text',
				success: function (data, status, xhr) {
					var mime = eXide.util.mimeTypes.getMime(xhr.getResponseHeader("Content-Type"));
					editor.openDocument(data, mime, resource);
					if (callback) {
						callback.call(null, resource);
					}
				},
				error: function (xhr, status) {
					eXide.util.error("Failed to load document " + resource.path + ": " + 
							xhr.status + " " + xhr.statusText);
				}
			});
		},

		closeDocument: function() {
			if (!editor.getActiveDocument().isSaved()) {
				$("#dialog-confirm-close").dialog({
					resizable: false,
					height:140,
					modal: true,
					buttons: {
						"Close": function() {
							$( this ).dialog( "close" );
							editor.closeDocument();
						},
						Cancel: function() {
							$( this ).dialog( "close" );
						}
					}
				});
			} else {
				editor.closeDocument();
			}
		},
		
		saveDocument: function() {
            eXide.app.requireLogin(function () {
                if (editor.getActiveDocument().getPath().match('^__new__')) {
        			dbBrowser.reload(["reload", "create"], "save");
    				$("#open-dialog").dialog("option", "title", "Save Document");
    				$("#open-dialog").dialog("option", "buttons", { 
    					"Cancel": function() {
                            $(this).dialog("close");
        				},
    					"Save": function() {
    						editor.saveDocument(dbBrowser.getSelection(), function () {
    							$("#open-dialog").dialog("close");
                                deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
    						}, function (msg) {
    							eXide.util.Dialog.warning("Failed to Save Document", msg);
    						});
    					}
    				});
    				$("#open-dialog").dialog("open");
    			} else {
    				editor.saveDocument(null, function () {
    					eXide.util.message(editor.getActiveDocument().getName() + " stored.");
                        deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
    				}, function (msg) {
    					eXide.util.Dialog.warning("Failed to Save Document", msg);
    				});
    			}
            });
		},

        saveDocumentAs: function() {
            eXide.app.requireLogin(function () {
                dbBrowser.reload(["reload", "create"], "save");
    			$("#open-dialog").dialog("option", "title", "Save Document As ...");
    			$("#open-dialog").dialog("option", "buttons", { 
    				"Cancel": function() {
                        // restore old path
                        $(this).dialog("close");
    				},
    				"Save": function() {
    					editor.saveDocument(dbBrowser.getSelection(), function () {
    						$("#open-dialog").dialog("close");
                            deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
    					}, function (msg) {
    						eXide.util.Dialog.warning("Failed to Save Document", msg);
    					});
    				}
    			});
    			$("#open-dialog").dialog("open");
            });
        },
        
        exec: function() {
            editor.exec(arguments);
        },
        
		download: function() {
			var doc = editor.getActiveDocument();
			if (doc.getPath().match("^__new__") || !doc.isSaved()) {
				eXide.util.error("There are unsaved changes in the document. Please save it first.");
				return;
			}
			window.location.href = "modules/load.xql?download=true&path=" + encodeURIComponent(doc.getPath());
		},
		
		runQuery: function() {
			editor.updateStatus("Running query ...");
			var code = editor.getText();
			var moduleLoadPath = "xmldb:exist://" + editor.getActiveDocument().getBasePath();
			$('#results-container .results').empty();
			$.ajax({
				type: "POST",
				url: "execute",
				dataType: "xml",
				data: { "qu": code, "base": moduleLoadPath },
				success: function (xml) {
					var elem = xml.documentElement;
					if (elem.nodeName == 'error') {
				        var msg = $(elem).text();
				        eXide.util.error(msg, "Compilation Error");
				        editor.evalError(msg);
					} else {
						editor.updateStatus("");
						editor.clearErrors();
						var layout = $("body").layout();
						layout.open("south");
						layout.sizePane("south", 300);
						eXide.app.resize();
						
						startOffset = 1;
						currentOffset = 1;
						hitCount = elem.getAttribute("hits");
						endOffset = startOffset + 10 - 1;
						if (hitCount < endOffset)
							endOffset = hitCount;
						eXide.util.message("Found " + hitCount + " in " + elem.getAttribute("elapsed") + "s");
						eXide.app.retrieveNext();
					}
				},
				error: function (xhr, status) {
					eXide.util.error(xhr.responseText, "Server Error");
				}
			});
		},

		checkQuery: function() {
			editor.validate();
		},

		/** If there are more query results to load, retrieve
		 *  the next result.
		 */
		retrieveNext: function() {
			$.log("retrieveNext: %d", currentOffset);
		    if (currentOffset > 0 && currentOffset <= endOffset) {
		        var url = 'results/' + currentOffset;
				currentOffset++;
				$.ajax({
					url: url,
					dataType: 'html',
					success: function (data) {
						$('#results-container .results').append(data);
						$("#results-container .current").text("Showing results " + startOffset + " to " + (currentOffset - 1) +
								" of " + hitCount);
						$("#results-container .pos:last a").click(function () {
							eXide.app.findDocument(this.pathname);
							return false;
						});
						eXide.app.retrieveNext();
					}
				});
			} else {
		    }
		},

		/** Called if user clicks on "forward" link in query results. */
		browseNext: function() {
			if (currentOffset > 0 && endOffset < hitCount) {
				startOffset = currentOffset;
		        var howmany = 10;
		        endOffset = currentOffset + howmany - 1;
				if (hitCount < endOffset)
					endOffset = hitCount;
				$("#results-container .results").empty();
				eXide.app.retrieveNext();
			}
			return false;
		},
		
		/** Called if user clicks on "previous" link in query results. */
		browsePrevious: function() {
			if (currentOffset > 0 && startOffset > 1) {
		        var count = 10;
		        startOffset = startOffset - count;
				if (startOffset < 1)
					startOffset = 1;
				currentOffset = startOffset;
				endOffset = currentOffset + (count - 1);
				if (hitCount < endOffset)
					endOffset = hitCount;
				$("#results-container .results").empty();
				eXide.app.retrieveNext();
			}
			return false;
		},
		
		manage: function() {
			eXide.app.requireLogin(function() {
                dbBrowser.reload(["reload", "create", "upload", "open", "cut", "copy", "paste"], "manage");
                $("#open-dialog").dialog("option", "title", "DB Manager");
                $("#open-dialog").dialog("option", "buttons", { 
                    "Close": function() { $(this).dialog("close"); }
                });
                $("#open-dialog").dialog("open");
			});
		},
		
		/** Open deployment settings for current app */
		deploymentSettings: function() {
			var path = editor.getActiveDocument().getPath();
			var collection = /^(.*)\/[^\/]+$/.exec(path);
			if (!collection)
				return;
			eXide.app.requireLogin(function() {
                $.log("Editing deployment settings for collection: %s", collection[1]);
    		    deploymentEditor.open(collection[1]);
			});
		},
		
		newDeployment: function() {
			eXide.app.requireLogin(function() {
    			deploymentEditor.open();
			});
		},
		
		deploy: function() {
            eXide.app.requireLogin(function() {
    			var path = editor.getActiveDocument().getPath();
    			var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
    				eXide.util.error("The file open in the editor does not belong to an application package!");
    				return false;
    			}
    			$.log("Deploying application from collection: %s", collection[1]);
    			deploymentEditor.deploy(collection[1]);
            });
			return false;
		},
		
		synchronize: function() {
            eXide.app.requireLogin(function () {
                var path = editor.getActiveDocument().getPath();
        		var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
                    eXide.util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.synchronize(collection[1]);
            });
		},
		
        downloadApp: function () {
            eXide.app.requireLogin(function() {
                var path = editor.getActiveDocument().getPath();
            	var collection = /^(.*)\/[^\/]+$/.exec(path);
                $.log("downloading %s", collection);
    			if (!collection) {
                    eXide.util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.download(collection[1]);
            });
        },
        
		openApp: function () {
			var path = editor.getActiveDocument().getPath();
			var collection = /^(.*)\/[^\/]+$/.exec(path);
			if (!collection) {
                eXide.util.error("The file open in the editor does not belong to an application package!");
				return;
			}
			deploymentEditor.runApp(collection[1]);
		},
        
		restoreState: function() {
			if (!eXide.util.supportsHtml5Storage)
				return false;
			preferences.read();
			
            var restoring = {};
            
			var docCount = localStorage["eXide.documents"];
			if (!docCount)
				docCount = 0;
			for (var i = 0; i < docCount; i++) {
				var doc = {
						path: localStorage["eXide." + i + ".path"],
						name: localStorage["eXide." + i + ".name"],
						writable: (localStorage["eXide." + i + ".writable"] == "true"),
						line: parseInt(localStorage["eXide." + i + ".last-line"])
				};
				$.log("Restoring doc %s, going to line = %i", doc.path, doc.line);
				var data = localStorage["eXide." + i + ".data"];
				if (data) {
					editor.newDocumentWithText(data, localStorage["eXide." + i + ".mime"], doc);
				} else {
					eXide.app.$doOpenDocument(doc);
				}
                restoring[doc.path] = doc;
			}
			deploymentEditor.restoreState();
			return restoring;
		},
		
		saveState: function() {
			if (!eXide.util.supportsHtml5Storage)
				return;
			localStorage.clear();
			preferences.save();
			
			editor.saveState();
			deploymentEditor.saveState();
		},
		
		ping: function() {
			$.ajax({
				url: "index.html",
				type: "HEAD",
				success: function () {
					setTimeout(function () { eXide.app.ping(); }, 30000);
				},
				error: function (xhr, textStatus) {
					$.log("ping failed: %s", textStatus);
					eXide.app.login = null;
					$("#user").empty();
					$("#login").text("Login");
				}
			});
		},
		
		$checkLogin: function () {
			if (eXide.app.login)
				return true;
			eXide.util.error("Warning: you are not logged in.");
			return false;
		},
		
        requireLogin: function(callback) {
            if (!eXide.app.login) {
                $("#login-dialog").dialog("option", "close", function () {
                    if (eXide.app.login) {
                        callback();
                    } else {
                        eXide.util.error("Warning: you are not logged in!");
                    }
                });
                $("#login-dialog").dialog("open");
            } else
                callback();
        },
        
        getPreference: function(key) {
            return preferences.get(key);
        },
        
		initGUI: function() {
			$("body").layout({
				enableCursorHotkey: false,
				north__size: 70,
				north__resizable: false,
				north__closable: true,
                north__showOverflowOnHover: true,
				south__minSize: 200,
				south__initClosed: true,
				west__size: 200,
				west__initClosed: true,
				west__contentSelector: ".content",
				center__minSize: 300,
				center__onresize: eXide.app.resize,
				center__contentSelector: ".content"
			});
			
            var menu = new eXide.util.Menubar($(".menu"));
            
			$("#open-dialog").dialog({
				title: "Open File",
				modal: false,
		        autoOpen: false,
		        height: 480,
		        width: 700,
				open: function() { dbBrowser.init(); },
				resize: function() { dbBrowser.resize(); }
			});
			$("#login-dialog").dialog({
				title: "Login",
				modal: true,
				autoOpen: false,
				buttons: {
					"Login": function() {
						$.ajax({
							url: "login",
							data: $("#login-form").serialize(),
							success: function (data) {
								eXide.app.login = $("#login-form input[name=\"user\"]").val();
								$.log("Logged in as %s", eXide.app.login);
								$("#login-dialog").dialog("close");
								$("#user").text("Logged in as " + eXide.app.login + ". ");
								$("#login").text("Logout");
								setTimeout(function () { eXide.app.ping(); }, 30000);
								editor.focus();
							},
							error: function () {
								$("#login-error").text("Login failed. Bad username or password.");
								$("#login-dialog input:first").focus();
							}
						});
					},
					"Cancel": function () { $(this).dialog("close"); editor.focus(); }
				},
				open: function() {
					// clear form fields
					$(this).find("input").val("");
					$(this).find("input:first").focus();
					$("#login-error").empty();
					
					var dialog = $(this);
					dialog.find("input").keyup(function (e) {
						if (e.keyCode == 13) {
				           dialog.parent().find(".ui-dialog-buttonpane button:first").trigger("click");
				        }
					});
				}
			});
			$("#keyboard-help").dialog({
				title: "Keyboard Shortcuts",
				modal: false,
				autoOpen: false,
				height: 400,
				buttons: {
					"Close": function () { $(this).dialog("close"); }
				},
				open: function () {
					eXide.edit.commands.help($("#keyboard-help"), editor);
				}
			});
            $("#about-dialog").dialog({
                title: "About",
                modal: false,
                autoOpen: false,
                height: 300,
                width: 450,
                buttons: {
    				"Close": function () { $(this).dialog("close"); }
				}
            });
			// initialize buttons and menu events
			var button = $("#open").button({
				icons: {
					primary: "ui-icon-folder-open"
				}
			});
			button.click(eXide.app.openDocument);
            menu.click("#menu-file-open", eXide.app.openDocument);
			
			button = $("#close").button({
				icons: {
					primary: "ui-icon-close"
				}
			});
			button.click(eXide.app.closeDocument);
			menu.click("#menu-file-close", eXide.app.closeDocument);
			
			button = $("#new").button({
				icons: {
					primary: "ui-icon-document"
				}
			});
			button.click(eXide.app.newDocument);
			menu.click("#menu-file-new", eXide.app.newDocument);
			
			button = $("#run").button({
				icons: {
					primary: "ui-icon-play"
				}
			});
			button.click(eXide.app.runQuery);
			button = $("#validate").button({
				icons: {
					primary: "ui-icon-check"
				}
			});
			button.click(eXide.app.checkQuery);
			button = $("#save").button({
				icons: {
					primary: "ui-icon-disk"
				}
			});
			button.click(eXide.app.saveDocument);
			menu.click("#menu-file-save", eXide.app.saveDocument);
            menu.click("#menu-file-save-as", eXide.app.saveDocumentAs);
			
			button = $("#download").button({
				icons: {
					primary: "ui-icon-transferthick-e-w"
				}
			});
			button.click(eXide.app.download);
			menu.click("#menu-file-download", eXide.app.download);
			menu.click("#menu-file-manager", eXide.app.manage);
			// menu-only events
			menu.click("#menu-deploy-new", eXide.app.newDeployment);
			menu.click("#menu-deploy-edit", eXide.app.deploymentSettings);
			menu.click("#menu-deploy-deploy", eXide.app.deploy);
			menu.click("#menu-deploy-sync", eXide.app.synchronize);
            menu.click("#menu-deploy-download", eXide.app.downloadApp);
			menu.click("#menu-edit-undo", function () {
				editor.editor.undo();
			});
			menu.click("#menu-edit-redo", function () {
				editor.editor.redo();
			});
            menu.click("#menu-edit-toggle-comment", function () {
                editor.editor.toggleCommentLines();
            });
			menu.click("#menu-edit-preferences", function() {
                preferences.show(); 		
			});
            
            menu.click("#menu-navigate-definition", function () {
                editor.exec("gotoDefinition");
            });
            menu.click("#menu-navigate-modules", function () {
                var doc = editor.getActiveDocument();
	    		eXide.find.Modules.select(doc.syntax);
            });
			menu.click("#menu-deploy-run", eXide.app.openApp);
			
            menu.click("#menu-help-keyboard", function (ev) {
				$("#keyboard-help").dialog("open");
			});
            menu.click("#menu-help-about", function (ev) {
				$("#about-dialog").dialog("open");
			});
            menu.click("#menu-help-hints", function(ev) {
                eXide.util.Help.show();
            });
			// syntax drop down
			$("#syntax").change(function () {
				editor.setMode($(this).val());
			});
			// register listener to update syntax drop down
			editor.addEventListener("activate", null, function (doc) {
				$("#syntax").val(doc.getSyntax());
			});
			
			$("#login").click(function (ev) {
				ev.preventDefault();
				if (eXide.app.login) {
					// logout
					$.get("logout");
					$("#user").empty();
					$("#login").text("Login");
					eXide.app.login = null;
				} else {
					$("#login-dialog").dialog("open");
				}
			});
			$('#results-container .next').click(eXide.app.browseNext);
			$('#results-container .previous').click(eXide.app.browsePrevious);
		}
	};
}());