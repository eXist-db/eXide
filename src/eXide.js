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
    window.name = "eXide";
    
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
            eXide.app.newDocument(snippet, "xquery");
        }
        if (window.opener && window.opener.eXide_onload) {
            window.opener.eXide_onload(eXide.app);
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
    var projects;
	var preferences;
    var templates = {};
    var menu;
    var lastQuery = null;
	var hitCount = 0;
	var startOffset = 0;
	var currentOffset = 0;
	var endOffset = 0;
	
	var login = null;
    
    // used to detect when window looses focus
    var hasFocus = true;
    
    var resultPanel = "south";
    
    var webResources = {
        "html": 1,
        "javascript": 1,
        "css": 1,
        "less": 1
    };
    
	return {
        
		init: function(afterInitCallback) {
            projects = new eXide.edit.Projects();
            menu = new eXide.util.Menubar($(".menu"));
			editor = new eXide.edit.Editor(document.getElementById("editor"), menu);
			deploymentEditor = new eXide.edit.PackageEditor(projects);
			dbBrowser = new eXide.browse.Browser(document.getElementById("open-dialog"));
            deploymentEditor.addEventListener("change", null, function(collection) {
                dbBrowser.changeToCollection(collection);
                eXide.app.openDocument();
            });
			preferences = new eXide.util.Preferences(editor);
			
            editor.addEventListener("setTheme", eXide.app.setTheme);
            
            eXide.app.initGUI(menu);
			
            // save restored paths for later
            eXide.app.getLogin(function() {
                eXide.app.initStatus("Restoring state");
                eXide.app.restoreState(function(restored) {
                    editor.init();
                    if (afterInitCallback) {
                        afterInitCallback(restored);
                    }
                    // dirty workaround to fix editor height
                    var southStatus = localStorage.getItem("eXide.layout.south");
                    $("#layout-container").layout().toggle("south");
                    
                    if (eXide.configuration.allowGuest) {
                        $("#splash").fadeOut(400);
                    } else {
                        eXide.app.requireLogin(function() {
                            $("#splash").fadeOut(400);
                        });
                    }
                });
            });
		    
		    editor.addEventListener("outlineChange", eXide.app.onOutlineChange);
            editor.validator.addEventListener("documentValid", function(doc) {
                if (doc.isXQuery() && $("#live-preview").is(":checked")) {
                    eXide.app.runQuery(doc.getPath(), true);
                }
            });
            editor.addEventListener("saved", function(doc) {
                if ($("#live-preview").is(":checked") && webResources[doc.getSyntax()]) {
                    document.getElementById("results-iframe").contentDocument.location.reload(true);
                }
            });
            
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
		},

        hasFocus: function() {
            return hasFocus;
        },
        
		resize: function(resizeIframe) {
			var panel = $("#editor");
			var header = $(".header");
            if (resizeIframe) {
                var resultsContainer = $(".ui-layout-" + resultPanel);
                var resultsBody = $("#results-body");
                $("#results-iframe").width(resultsBody.innerWidth());
                $("#results-iframe").height(resultsContainer.innerHeight() - $(".navbar", resultsContainer).height() - 8);
                $("#results-body").height(resultsContainer.innerHeight() - $(".navbar", resultsContainer).height() - 8);
            }
//			panel.width($(".ui-layout-center").innerWidth() - 20);
//			panel.css("width", "100%");
//			panel.height($(".ui-layout-center").innerHeight() - header.height());
			editor.resize();
		},
        
		newDocument: function(data, type) {
			editor.newDocument(data, type);
		},
        
        newDocumentFromTemplate: function() {
            $("#dialog-templates").dialog("open");
            //editor.newDocumentFromTemplate("collection-config");
        },

		findDocument: function(path) {
			var doc = editor.getDocument(path);
			if (doc == null) {
				var resource = {
						name: path.match(/[^\/]+$/)[0],
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
				var doc = editor.getDocument(path);
				if (doc == null) {
					var resource = {
							name: path.match(/[^\/]+$/)[0],
							path: path
					};
					eXide.app.$doOpenDocument(resource, function(doc) {
                        if (doc) {
                            editor.exec("locate", type, symbol);
                        }
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

		$doOpenDocument: function(resource, callback, reload) {
			resource.path = eXide.util.normalizePath(resource.path);
            var doc = editor.getDocument(resource.path);
            if (doc && !reload) {
                editor.switchTo(doc);
                if (callback) {
                    callback(resource);
                }
                return true;
            }
			$.ajax({
				url: "modules/load.xql?path=" + resource.path,
				dataType: 'text',
				success: function (data, status, xhr) {
                    if (reload) {
                        editor.reload(data);
                    } else {
                        var mime = eXide.util.mimeTypes.getMime(xhr.getResponseHeader("Content-Type"));
                        var externalPath = xhr.getResponseHeader("X-Link");
                        editor.openDocument(data, mime, resource, externalPath);
                    }
					if (callback) {
						callback(resource);
					}
                    return true;
				},
				error: function (xhr, status) {
					eXide.util.error("Failed to load document " + resource.path + ": " + 
							xhr.status + " " + xhr.statusText);
                    if (callback) {
                        callback(null);
                    }
                    return false;
				}
			});
		},

        reloadDocument: function() {
            var doc = editor.getActiveDocument();
            if (doc.isSaved()) {
                eXide.app.$reloadDocument(doc);
            } else {
                eXide.util.Dialog.input("Reload Document", "Do you really want to reload the document?", function() {
                    eXide.app.$reloadDocument(doc);
                });
            }
        },
        
        $reloadDocument: function(doc) {
            var resource = {
                name: doc.getName(),
                path: doc.getPath()
            };
            eXide.app.$doOpenDocument(resource, null, true);
        },
        
		closeDocument: function() {
			if (!editor.getActiveDocument().isSaved()) {
				$("#dialog-confirm-close").dialog({
                    appendTo: "#layout-container",
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
					},
                    open: function() { 
                        $(this).closest('.ui-dialog').find('.ui-dialog-buttonpane button:eq(0)').focus(); 
                        $(this).closest('.ui-dialog').find('.ui-dialog-buttonpane button:eq(1)').blur(); 
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
                                eXide.app.updateStatus(this);
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
                            eXide.app.updateStatus(this);
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
        
		runQuery: function(path, livePreview) {
            function showResultsPanel() {
                editor.updateStatus("");
				editor.clearErrors();
				eXide.app.showResultsPanel();
				
				startOffset = 1;
				currentOffset = 1;
            }

            if (!(eXide.configuration.allowExecution || eXide.app.login.isAdmin)) {
                eXide.util.error("You are not allowed to execute XQuery code.");
                return;
            }
            if (!path && editor.getActiveDocument().getSyntax() == "html") {
                showResultsPanel();
                var iframe = document.getElementById("results-iframe");
                $(iframe).show();
                iframe.src = editor.getActiveDocument().getExternalLink();
                $("#serialization-mode").attr("disabled", "disabled").val("html");
            } else {
                var code = editor.getText();
                if (path) {
                    var doc = editor.getDocument(path);
                    if (doc) {
                        code = doc.$session.getValue();
                    } else {
                        return;
                    }
                } else {
                    lastQuery = editor.getActiveDocument().getPath();
                }
    			editor.updateStatus("Running query ...");
    
                $("#serialization-mode").removeAttr("disabled");
                var serializationMode = $("#serialization-mode").val();
    			var moduleLoadPath = "xmldb:exist://" + editor.getActiveDocument().getBasePath();
    			$('.results-container .results').empty();
    			$.ajax({
    				type: "POST",
    				url: "execute",
    				dataType: serializationMode == "xml" ? serializationMode : "text",
    				data: { "qu": code, "base": moduleLoadPath, "output": serializationMode },
    				success: function (data, status, xhr) {
                        switch (serializationMode) {
                            case "xml":
                                $("#results-iframe").hide();
            					var elem = data.documentElement;
            					if (elem.nodeName == 'error') {
            				        var msg = $(elem).text();
            				        //eXide.util.error(msg, "Compilation Error");
            				        editor.evalError(msg, !livePreview);
            					} else {
            						showResultsPanel();
            						hitCount = elem.getAttribute("hits");
            						endOffset = startOffset + 10 - 1;
            						if (hitCount < endOffset)
            							endOffset = hitCount;
            						eXide.util.message("Found " + hitCount + " in " + elem.getAttribute("elapsed") + "s");
            						eXide.app.retrieveNext();
            					}
                                break;
                            default:
                                showResultsPanel();
                                var iframe = document.getElementById("results-iframe");
                                $(iframe).show();
                                iframe.contentWindow.document.open('text/html', 'replace');
                                iframe.contentWindow.document.write(data);
                                iframe.contentWindow.document.close();
                                break;
                        }
    				},
    				error: function (xhr, status) {
    					eXide.util.error(xhr.responseText, "Server Error");
    				}
    			});
            }
		},

		checkQuery: function() {
			editor.validator.triggerNow(editor.getActiveDocument());
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
						$('.results-container .results').append(data);
						$(".results-container .current").text("Showing results " + startOffset + " to " + (currentOffset - 1) +
								" of " + hitCount);
						$(".results-container .pos:last a").click(function () {
							eXide.app.findDocument($(this).data("path"));
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
				$(".results-container .results").empty();
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
				$(".results-container .results").empty();
				eXide.app.retrieveNext();
			}
			return false;
		},
		
		manage: function() {
			eXide.app.requireLogin(function() {
                dbBrowser.reload(["reload", "create", "upload", "properties", "open", "cut", "copy", "paste"], "manage");
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
        
		restoreState: function(callback) {
			if (!eXide.util.supportsHtml5Storage)
				return false;
			preferences.read();
			
            var restoring = {};
            
			var docCount = localStorage["eXide.documents"];
			if (!docCount)
				docCount = 0;
            // we need to restore documents one after the other
            var docsToLoad = [];
			for (var i = 0; i < docCount; i++) {
				var doc = {
						path: localStorage["eXide." + i + ".path"],
						name: localStorage["eXide." + i + ".name"],
						writable: (localStorage["eXide." + i + ".writable"] == "true"),
						line: parseInt(localStorage["eXide." + i + ".last-line"])
				};
                if (!doc.name) {
                    continue;
                }
				$.log("Restoring doc %s, going to line = %i", doc.path, doc.line);
				var data = localStorage["eXide." + i + ".data"];
				if (data) {
					editor.newDocumentWithText(data, localStorage["eXide." + i + ".mime"], doc);
				} else {
                    docsToLoad.push(doc);
				}
                restoring[doc.path] = doc;
			}
            this.restoreDocs(docsToLoad, function() {
                if (!editor.getActiveDocument()) {
                    eXide.app.newDocument("", "xquery");
                }
                editor.validator.triggerNow(editor.getActiveDocument());
                if (callback) callback(restoring);
            });
			deploymentEditor.restoreState();
            
			return restoring;
		},
		
        restoreDocs: function(docs, callback) {
            if (docs.length == 0) {
                callback();
                return;
            }
            var self = this;
            var doc = docs.pop();
            eXide.app.$doOpenDocument(doc, function() {
                self.restoreDocs(docs, callback);
            });
        },
        
		saveState: function() {
			if (!eXide.util.supportsHtml5Storage)
				return;
			localStorage.clear();
			preferences.save();
			
            var layout = $('#layout-container').layout();
            localStorage["eXide.layout.south"] = layout.state.south.isClosed ? "closed" : "open";
            localStorage["eXide.layout.west"] = layout.state.west.isClosed ? "closed" : "open";
            localStorage["eXide.layout.east"] = layout.state.east.isClosed ? "closed" : "open";
            localStorage["eXide.layout.resultPanel"] = resultPanel;
			editor.saveState();
			deploymentEditor.saveState();
		},
		
        getLogin: function(callback) {
            $.ajax({
                url: "login",
                dataType: "json",
                success: function(data) {
                    eXide.app.login = data;
                    $("#user").text("Logged in as " + eXide.app.login.user + ". ");
                    if (callback) callback(eXide.app.login.user);
                },
                error: function (xhr, textStatus) {
                    eXide.app.login = null;
                    $("#user").text("Login");
                    if (callback) callback(null);
                }
            })
        },
        
        enforceLogin: function() {
            eXide.app.requireLogin(function() {
                if (!eXide.app.login || eXide.app.login.user === "guest") {
                    eXide.app.enforceLogin();
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
        
        showPreferences: function() {
            preferences.show();
        },
        
        getPreference: function(key) {
            return preferences.get(key);
        },

        startDebug: function() {
            var _class1 = "ui-icon-stop";
            var _class2 = "ui-icon-play";
            var _icon = $("#debug span.ui-icon");
            if (_icon.hasClass(_class1)){
                _icon.removeClass(_class1);
                _icon.addClass(_class2);
            } else {
                _icon.removeClass(_class2);
                _icon.addClass(_class1);
            }
            editor.exec("debug");
            $.log("start debugging click");
        },

        stepOver: function() {
            editor.exec("stepOver");
        },

        stepInto: function() {
            editor.exec("stepInto");
        },
        
        setTheme: function(theme) {
            $("#outline-body").removeClass().addClass(theme.cssClass);
            $("#results-body").removeClass().addClass(theme.cssClass);
        },
        
        updateStatus: function(doc) {
            $("#syntax").val(doc.getSyntax());
            $("#status span").text(eXide.util.normalizePath(doc.getPath()));
            if (!doc.isNew() && (doc.getSyntax() == "xquery" || doc.getSyntax() == "html" || doc.getSyntax() == "xml")) {
                $("#status a").attr("href", doc.getExternalLink());
                $("#status a").css("visibility", "visible");
            } else {
                $("#status a").css("visibility", "hidden");
            }
        },
        
        showResultsPanel: function() {
            $("#layout-container").layout().open(resultPanel);
			//layout.sizePane("south", 300);
			eXide.app.resize(true);
        },
        
        prepareResultsPanel: function(target) {
            var contents = $("#results-body").parent().contents().detach();
            contents.appendTo(".ui-layout-" + target);
        },
        
        switchResultsPanel: function() {
            var target = resultPanel === "south" ? "east" : "south";
            eXide.app.prepareResultsPanel(target);
            $("#layout-container").layout().close(resultPanel);
            resultPanel = target;
            if (resultPanel === "south") {
                $(".layout-switcher").attr("src", "resources/images/layouts_split.png");
            } else {
                $(".layout-switcher").attr("src", "resources/images/layouts_split_vertical.png");
            }
            eXide.app.showResultsPanel();
        },
        
        initStatus: function(msg) {
            $("#splash-status").text(msg);
        },
        
		initGUI: function(menu) {
            var layoutState = {
                south: "closed",
                west: "open",
                east: "closed"
            };
            if (eXide.util.supportsHtml5Storage && localStorage.getItem("eXide.firstTime")) {
                layoutState.west = localStorage.getItem("eXide.layout.west");
                layoutState.east = localStorage.getItem("eXide.layout.east");
                layoutState.south = localStorage.getItem("eXide.layout.south");
                resultPanel = localStorage["eXide.layout.resultPanel"] || "south";
            }
            $.log("resultPanel: %s", resultPanel);
			var layout = $("#layout-container").layout({
				enableCursorHotkey: false,
                spacing_open: 6,
                spacing_closed: 8,
				north__size: 72,
				north__resizable: false,
				north__closable: false,
                north__showOverflowOnHover: true,
                north__spacing_open: 0,
				south__minSize: 200,
                south__size: 300,
				south__initClosed: layoutState.south !== "closed",
                south__contentSelector: "#results-body",
                south__onresize: eXide.app.resize,
                south__onopen: eXide.app.resize,
				west__size: 200,
				west__initClosed: layoutState.west == "closed",
				west__contentSelector: ".content",
                west__onopen: eXide.app.resize,
                east__minSize: 300,
                east__size: 450,
                east__initClosed: layoutState.east == "closed",
                east__onresize: eXide.app.resize,
                east__onopen: eXide.app.resize,
				center__minSize: 300,
			    center__onresize: eXide.app.resize,
				center__contentSelector: ".content"
			});
            eXide.app.prepareResultsPanel(resultPanel);
			$("#open-dialog").dialog({
                appendTo: "#layout-container",
				title: "Open file",
				modal: false,
		        autoOpen: false,
		        height: 480,
		        width: 600,
				open: function() { dbBrowser.init(); },
				resize: function() { dbBrowser.resize(); }
			});
			$("#login-dialog").dialog({
                appendTo: "#layout-container",
				title: "Login",
				modal: true,
				autoOpen: false,
				buttons: {
					"Login": function() {
                        var user = $("#login-form input[name=\"user\"]").val();
                        var password = $("#login-form input[name=\"password\"]").val();
                        var params = {
                            user: user, password: password
                        }
                        if ($("#login-form input[name=\"duration\"]").is(":checked")) {
                            params.duration = "P14D";
                        }
						$.ajax({
							url: "login",
							data: params,
                            dataType: "json",
							success: function (data) {
								eXide.app.login = data;
								$.log("Logged in as %s. Is dba: %s", eXide.app.login.user, eXide.app.login.isAdmin);
								$("#login-dialog").dialog("close");
								$("#user").text("Logged in as " + eXide.app.login.user + ". ");
								editor.focus();
							},
							error: function (xhr, status, data) {
								$("#login-error").text("Login failed. " + data);
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
                appendTo: "#layout-container",
				title: "Keyboard Shortcuts",
				modal: false,
				autoOpen: false,
				height: 400,
                width: 350,
				buttons: {
					"Close": function () { $(this).dialog("close"); }
				},
				open: function () {
					eXide.edit.commands.help($("#keyboard-help"), editor);
				}
			});
            $("#about-dialog").dialog({
                appendTo: "#layout-container",
                title: "About",
                modal: false,
                autoOpen: false,
                height: 300,
                width: 450,
                buttons: {
    				"Close": function () { $(this).dialog("close"); }
				}
            });
            $("#dialog-templates").dialog({
                appendTo: "#layout-container",
    			title: "New document",
				modal: false,
		        autoOpen: false,
		        height: 280,
		        width: 550,
                dataType: "json",
                open: function() {
                    $.ajax({
                	    url: "modules/get-template.xql",
            			type: "POST",
            			success: function(data) {
                		    templates = data;
                            $("#dialog-templates .templates").hide();
                            $("#dialog-templates .type-select").val("");
            			}
                    });
                },
                buttons: {
				    "Cancel": function () { $(this).dialog("close"); editor.focus(); },
                    "Create": function() {
                        var mode = $(this).find(".type-select").val();
                        var template = $(this).find(".templates select").val();
                        $.log("creating new doc with mode: %s and template: %s", mode, template);
                        editor.newDocumentFromTemplate(mode, template);
                        $(this).dialog("close");
                        editor.focus();
                    }
                }
			});
            $("#dialog-templates .type-select").change(function() {
                var templ = $("#dialog-templates .templates");
                var templSel = $("select", templ);
                var type = $(this).val();
                templSel.empty();
                var mode = templates[type];
                if (mode) {
                    var options = "<option value=''>None</option>";
                    for (var i = 0; i < mode.length; i++) {
                        options += "<option value='" + mode[i].name + "'>" + mode[i].description + "</option>";
                    }
                    templSel.html(options);
                    templ.show();
                } else {
                    templ.hide();
                }
            });
            
            eXide.util.Popup.init("#autocomplete-box", editor);
            
            $(".toolbar-buttons").buttonset();
            
			// initialize buttons and menu events
            var button = $("#open").button("option", "icons", { primary: "ui-icon-folder-open" });
			button.click(eXide.app.openDocument);
            menu.click("#menu-file-open", eXide.app.openDocument, "openDocument");
			
            button = $("#close").button("option", "icons", { primary: "ui-icon-close" });
			button.click(eXide.app.closeDocument);
			menu.click("#menu-file-close", eXide.app.closeDocument, "closeDocument");
			
            button = $("#new").button("option", "icons", { primary: "ui-icon-document" });
			button.click(function() {
                eXide.app.newDocumentFromTemplate();
			});
            
            button = $("#new-xquery").button("option", "icons", { primary: "ui-icon-document" });
			button.click(function() {
                eXide.app.newDocument(null, "xquery");
			});
			menu.click("#menu-file-new", eXide.app.newDocumentFromTemplate, "newDocumentFromTemplate");
    		menu.click("#menu-file-new-xquery", function() {
                eXide.app.newDocument(null, "xquery");
    		}, "newXQuery");

            button = $("#run").button("option", "icons", { primary: "ui-icon-play" });
			button.click(function(ev) { eXide.app.runQuery() });

            button = $("#debug").button("option", "icons", { primary: "ui-icon-seek-end" });
            button.click(eXide.app.startDebug);

            
            button = $("#debug-actions #step-over").button("option", "icons", { primary: "ui-icon-seek-end" });
            button.click(eXide.app.stepOver);

            button = $("#debug-actions #step-into").button("option", "icons", { primary: "ui-icon-seek-end" });
            button.click(eXide.app.stepInto);

            button = $("#debug-actions #step-out").button("option", "icons", { primary: "ui-icon-seek-end" });
            button.click(eXide.app.startDebug);

            button = $("#validate").button("option", "icons", { primary: "ui-icon-check" });

			button.click(eXide.app.checkQuery);
            
            button = $("#save").button("option", "icons", { primary: "ui-icon-disk" });
			button.click(eXide.app.saveDocument);
			menu.click("#menu-file-save", eXide.app.saveDocument, "saveDocument");
            menu.click("#menu-file-save-as", eXide.app.saveDocumentAs);
			
            menu.click("#menu-file-reload", eXide.app.reloadDocument);
            
            button = $("#download").button("option", "icons", { primary: "ui-icon-transferthick-e-w" });
			button.click(eXide.app.download);
            
			menu.click("#menu-file-download", eXide.app.download);
			menu.click("#menu-file-manager", eXide.app.manage, "dbManager");
			// menu-only events
			menu.click("#menu-deploy-new", eXide.app.newDeployment);
			menu.click("#menu-deploy-edit", eXide.app.deploymentSettings);
			menu.click("#menu-deploy-deploy", eXide.app.deploy);
			menu.click("#menu-deploy-sync", eXide.app.synchronize, "synchronize");
            menu.click("#menu-deploy-download", eXide.app.downloadApp);
			menu.click("#menu-edit-undo", function () {
				editor.editor.undo();
			}, "undo");
			menu.click("#menu-edit-redo", function () {
				editor.editor.redo();
			}, "redo");
            menu.click("#menu-edit-find", function() {
                var config = require("ace/config");
                config.loadModule("ace/ext/searchbox", function(e) {e.Search(editor.editor)});
            }, "searchIncremental");
            menu.click("#menu-edit-toggle-comment", function () {
                editor.editor.toggleCommentLines();
            }, "toggleComment");
			menu.click("#menu-edit-preferences", function() {
                preferences.show(); 		
			}, "preferences");
            menu.click("#menu-navigate-definition", function () {
                editor.exec("gotoDefinition");
            }, "gotoDefinition");
            menu.click("#menu-navigate-modules", function () {
                var doc = editor.getActiveDocument();
	    		eXide.find.Modules.select(doc.syntax);
            }, "findModule");
            menu.click("#menu-navigate-info", function() {
                editor.exec("showFunctionDoc");
            }, "functionDoc");
            menu.click("#menu-navigate-symbol", function() {
                editor.exec("gotoSymbol");
            }, "gotoSymbol");
			menu.click("#menu-deploy-run", eXide.app.openApp, "openApp");
			
            menu.click("#menu-help-keyboard", function (ev) {
				$("#keyboard-help").dialog("open");
			});
            menu.click("#menu-help-about", function (ev) {
				$("#about-dialog").dialog("open");
			});
            // menu.click("#menu-help-documentation", function(ev) {
            //     eXide.util.Help.show();
            // });
            menu.click("#menu-help-documentation", function(ev) {
                window.open("docs/doc.html");
            });
			// syntax drop down
			$("#syntax").change(function () {
				editor.setMode($(this).val());
			});
			// register listener to update syntax drop down
			editor.addEventListener("activate", null, function (doc) {
                eXide.app.updateStatus(doc);
                projects.findProject(doc.getBasePath(), function(app) {
                    if (app) {
                        $("#toolbar-current-app").text(app.abbrev);
                        $("#menu-deploy-active").text(app.abbrev);
                    } else {
                        $("#toolbar-current-app").text("unknown");
                        $("#menu-deploy-active").text("unknown");
                    }
                });
			});
			
			$("#user").click(function (ev) {
				ev.preventDefault();
				if (eXide.app.login) {
					// logout
					$.get("login?logout=logout");
					$("#user").text("Login");
					eXide.app.login = null;
				} else {
					$("#login-dialog").dialog("open");
				}
			});
            if (!eXide.util.supportsFullScreen()) {
                $("#toggle-fullscreen").hide();
            }
            $("#toggle-fullscreen").click(function(ev) {
                ev.preventDefault();
                eXide.util.requestFullScreen(document.getElementById("fullscreen"));
            });
            $(".results-container .layout-switcher").click(eXide.app.switchResultsPanel);
			$('.results-container .next').click(eXide.app.browseNext);
			$('.results-container .previous').click(eXide.app.browsePrevious);
            $("#serialization-mode").change(function(ev) {
                if (lastQuery) {
                    eXide.app.runQuery(lastQuery);
                }
            });
            $("#error-status").mouseover(function(ev) {
                var error = this;
                $("#ext-status-bar").each(function() {
                    this.innerHTML = error.innerHTML;
                    $(this).css("display", "block");
                });
            });
            $("#ext-status-bar").mouseout(function(ev) {
               $(this).css("display", "none");
            });
            $(window).blur(function() {
                hasFocus = false;
            });
            $(window).focus(function() {
                var checkLogin = !hasFocus;
                hasFocus = true;
                if (checkLogin) {
                   eXide.app.getLogin();
                } 
            });
            
            // first time startup dialog
            $("#dialog-startup").dialog({
                appendTo: "#layout-container",
        		modal: false,
                title: "Quick Start",
    			autoOpen: false,
                width: 400,
                height: 300,
    			buttons: {
                    "OK" : function() { $(this).dialog("close"); }
    			}
    		});
            if (!eXide.util.supportsHtml5Storage)
    		    return;
            // if local storage contains eXide properties, the app has already
            // been started before and we do not show the welcome dialog
            var showHints = localStorage.getItem("eXide.firstTime");
            if (!showHints || showHints == 1) {
                $("#dialog-startup").dialog("open");
            }
		}
	};
}());