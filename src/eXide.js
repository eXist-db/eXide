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
// test 
$(document).ready(function() {
    window.name = "eXide";
    
    jQuery.event.props.push( "dataTransfer" );
    
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
        if (openDoc) {
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
eXide.app = (function(util) {
    
	var editor;

    var layout;
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
    
    var allowDnd = true;
    
    // used to detect when window looses focus
    var hasFocus = true;
    
    var resultPanel = "south";
    
    var webResources = {
        "html": 1,
        "javascript": 1,
        "css": 1,
        "less": 1
    };
    
	var app = {
        
		init: function(afterInitCallback) {
		    if (!Modernizr.flexbox) {
		        $("#startup-error").show();
		        return;
            }
            
            projects = new eXide.edit.Projects();
            menu = new util.Menubar($(".menu"));
			editor = new eXide.edit.Editor(document.getElementById("editor"), menu);
			deploymentEditor = new eXide.edit.PackageEditor(projects);
			
			dbBrowser = new eXide.browse.Browser(document.getElementById("open-dialog"));
			dbBrowser.addEventListener("upload-open", function(isOpen) {
			    allowDnd = !isOpen;
			});
			
            deploymentEditor.addEventListener("change", null, function(collection) {
                dbBrowser.changeToCollection(collection);
                app.openDocument();
            });
			preferences = new util.Preferences(editor);
			
            editor.addEventListener("setTheme", app.setTheme);
            
            app.initGUI(menu);
			
			var dnd = new eXide.util.DnD("body");
			dnd.addEventListener("drop", app.dropFile);
			
            // save restored paths for later
            app.getLogin(function() {
                app.initStatus("Restoring state");
                app.restoreState(function(restored) {
                    editor.init();
                    if (afterInitCallback) {
                        afterInitCallback(restored);
                    }
                    // dirty workaround to fix editor height
                    // var southStatus = localStorage.getItem("eXide.layout.south");
                    // $("#layout-container").layout().toggle("south");
                    if (eXide.configuration.allowGuest) {
                        $("#splash").fadeOut(400);
                    } else {
                        app.requireLogin(function() {
                            $("#splash").fadeOut(400);
                        });
                    }
                });
            });
		    
		    editor.addEventListener("outlineChange", app.onOutlineChange);
            editor.validator.addEventListener("documentValid", function(doc) {
                if (doc.isXQuery() && $("#live-preview").is(":checked")) {
                    app.runQuery(doc.getPath(), true);
                }
            });
            editor.addEventListener("saved", function(doc) {
                if ($("#live-preview").is(":checked") && webResources[doc.getSyntax()]) {
                    document.getElementById("results-iframe").contentDocument.location.reload(true);
                }
            });
            
			$(window).resize(app.resize);
			
			$(window).unload(function () {
				app.saveState();
			});
            
            eXide.find.Modules.addEventListener("open", null, function (module) {
                app.findDocument(module.at);
            });
            eXide.find.Modules.addEventListener("import", null, function (module) {
                editor.exec("importModule", module.prefix, module.uri, module.at);
            });
		},

        version: function() {
            return $("#eXide-version").text();
        },
        
        hasFocus: function() {
            return hasFocus;
        },
        
        getEditor: function() {
            return editor;
        },
        
        getMenu: function() {
            return menu;
        },
        
		resize: function(resizeIframe) {
			var panel = $("#editor");
            if (resizeIframe) {
                var resultsContainer = $(".panel-" + resultPanel);
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
        
        beforeResize: function() {
            if ($("#serialization-mode").val() == "html") {
                $("#results-iframe").css("display", "none");
            }
        },
        
        afterResize: function() {
            editor.resize();
            if ($("#serialization-mode").val() == "html") {
                $("#results-iframe").css("display", "");
            }
        },
        
		newDocument: function(data, type) {
			editor.newDocument(data, type);
		},

        newDocumentFromTemplate: function() {
            $("#dialog-templates").dialog("open");
            //editor.newDocumentFromTemplate("collection-config");
        },

        dropFile: function(files) {
            if (!allowDnd) {
                return;
            }
            if (Modernizr.filereader) {
                var reader = new FileReader();
                for (var i = 0; i < files.length; i++) {
                    var mime = eXide.util.mimeTypes.getLangFromMime(files[i].type) || "xquery";
                    reader.onloadend = function(e) {
                        app.newDocument(this.result, mime);
                    };
                    reader.readAsText(files[i]);
                }
            } else {
                util.message("Your browser does not support drag and drop of files.");
            }
        },
        
		findDocument: function(path, line) {
			var doc = editor.getDocument(path);
			if (doc == null) {
				var resource = {
						name: path.match(/[^\/]+$/)[0],
						path: path
				};
				app.$doOpenDocument(resource, function() {
				    if (line) {
        			    editor.editor.gotoLine(line);
        			}
				});
			} else {
				editor.switchTo(doc);
				if (line) {
    			    editor.editor.gotoLine(line);
    			}
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
					app.$doOpenDocument(resource, function(doc) {
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
				"open": app.openSelectedDocument
			});
			$("#open-dialog").dialog("open");
		},

		openSelectedDocument: function(close) {
			var resource = dbBrowser.getSelection();
			if (resource) {
				app.$doOpenDocument(resource);
			}
			if (close == undefined || close)
				$("#open-dialog").dialog("close");
		},

		$doOpenDocument: function(resource, callback, reload) {
			resource.path = util.normalizePath(resource.path);
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
                        var mime = util.mimeTypes.getMime(xhr.getResponseHeader("Content-Type"));
                        var externalPath = xhr.getResponseHeader("X-Link");
                        editor.openDocument(data, mime, resource, externalPath);
                    }
					if (callback) {
						callback(resource);
					}
                    return true;
				},
				error: function (xhr, status) {
					util.error("Failed to load document " + resource.path + ": " + 
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
                app.$reloadDocument(doc);
            } else {
                util.Dialog.input("Reload Document", "Do you really want to reload the document?", function() {
                    app.$reloadDocument(doc);
                });
            }
        },
        
        $reloadDocument: function(doc) {
            var resource = {
                name: doc.getName(),
                path: doc.getPath()
            };
            app.$doOpenDocument(resource, null, true);
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

        closeAll: function() {
            editor.forEachDocument(function(doc) {
                if (doc.isSaved()) {
                    editor.closeDocument(doc);
                } else {
                    util.message("Not closing unsaved document " + doc.getName());
                }
            });
        },
        
		saveDocument: function() {
            app.requireLogin(function () {
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
                                app.updateStatus(this);
								app.syncDirectory(this.getBasePath())
                                app.liveReload();
    						}, function (msg) {
    							util.Dialog.warning("Failed to Save Document", msg);
    						});
    					}
    				});
    				$("#open-dialog").dialog("open");
    			} else {
    				editor.saveDocument(null, function () {
    					util.message(editor.getActiveDocument().getName() + " stored.");
                        deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                        app.liveReload();
    				}, function (msg) {
    					util.Dialog.warning("Failed to Save Document", msg);
    				});
    			}
            });
		},

        saveDocumentAs: function() {
            app.requireLogin(function () {
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
                            app.updateStatus(this);
							app.syncDirectory(this.getBasePath())
                            app.liveReload();
    					}, function (msg) {
    						util.Dialog.warning("Failed to Save Document", msg);
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
				util.error("There are unsaved changes in the document. Please save it first.");
				return;
			}
			window.location.href = "modules/load.xql?download=true&path=" + encodeURIComponent(doc.getPath());
		},
        
		runQuery: function(path, livePreview) {
            function showResultsPanel() {
                editor.updateStatus("");
				editor.clearErrors();
				app.showResultsPanel();
				
				startOffset = 1;
				currentOffset = 1;
            }

            if (!(eXide.configuration.allowExecution || app.login.isAdmin)) {
                util.error("You are not allowed to execute XQuery code.");
                return;
            }
            switch (editor.getActiveDocument().getSyntax()) {
                case "html":
                    showResultsPanel();
                    var iframe = document.getElementById("results-iframe");
                    $(iframe).show();
                    if (path) {
                        iframe.src = editor.getActiveDocument().getExternalLink();
                    } else {
                        $(iframe).contents().find('html').html(editor.getText());
                    }
                    $("#serialization-mode").attr("disabled", "disabled").val("html");
                    break;
                case "javascript":
                    showResultsPanel();
                    var iframe = document.getElementById("results-iframe");
                    $(iframe).show();
                    var code = editor.getText();
                    code = "<script type=\"text/javascript\">" + code + "</script>";
                    $(iframe).contents().find('html').html(code);
                    $("#serialization-mode").attr("disabled", "disabled").val("html");
                    break;
                default:
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
        				dataType: serializationMode == "adaptive" || serializationMode == "html5" || serializationMode == "xhtml" || serializationMode == "xhtml5" || serializationMode == "json" || serializationMode == "text" || serializationMode == "xml" || serializationMode == "microxml" ? "xml" : "text",
        				data: { "qu": code, "base": moduleLoadPath, "output": serializationMode },
        				success: function (data, status, xhr) {
                            switch (serializationMode) {
                                case "adaptive":
                                case "html5":
                                case "xhtml":
                                case "xhtml5":
                                case "json":
                                case "text":
                                case "xml":
                                case "microxml":
                                    $("#results-iframe").hide();
                					var elem = data.documentElement;
                					if (elem.nodeName == 'error') {
                				        var msg = $(elem).text();
                				        //util.error(msg, "Compilation Error");
                				        editor.evalError(msg, !livePreview);
                					} else {
                						showResultsPanel();
                						hitCount = elem.getAttribute("hits");
                						endOffset = startOffset + 10 - 1;
                						if (hitCount < endOffset)
                							endOffset = hitCount;
                						util.message("Query returned " + hitCount + " item(s) in " + elem.getAttribute("elapsed") + "s");
                						app.retrieveNext();
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
        					util.error(xhr.responseText, "Server Error");
        				}
        			});
                    break;
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
		        $("#serialization-mode").removeAttr("disabled");
		        var serializationMode = $("#serialization-mode").val();
		        var autoExpandMatches = $("#auto-expand-matches").is(":checked");
		        var indentResults = $("#indent-results").is(":checked");
		        var url = 'results/' + currentOffset;
				currentOffset++;
				$.ajax({
					url: url,
					dataType: 'html',
					data: { "output": serializationMode, "auto-expand-matches": autoExpandMatches, "indent": indentResults },
					success: function (data) {
						$('.results-container .results').append(data);
						$(".results-container .current").text("Showing results " + startOffset + " to " + (currentOffset - 1) +
								" of " + hitCount);
						$(".results-container .pos:last a").click(function () {
							app.findDocument($(this).data("path"));
							return false;
						});
						app.retrieveNext();
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
				app.retrieveNext();
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
				app.retrieveNext();
			}
			return false;
		},
		
		syncDirectory : function(collection) {
			editor.directory.reload(collection)
		},
		
		syncManager : function(collection) {
			if($("#open-dialog").is(":visible")){
				dbBrowser.resources.collection = collection
				dbBrowser.resources.reload()
			}
		},
		
		manage: function() {
			app.requireLogin(function() {
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
			app.requireLogin(function() {
                $.log("Editing deployment settings for collection: %s", collection[1]);
    		    deploymentEditor.open(collection[1]);
			});
		},
		
		newDeployment: function() {
			app.requireLogin(function() {
    			deploymentEditor.open();
			});
		},
		
		deploy: function() {
            app.requireLogin(function() {
    			var path = editor.getActiveDocument().getPath();
    			var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
    				util.error("The file open in the editor does not belong to an application package!");
    				return false;
    			}
    			$.log("Deploying application from collection: %s", collection[1]);
    			deploymentEditor.deploy(collection[1]);
            });
			return false;
		},
		
		synchronize: function() {
            app.requireLogin(function () {
                var path = editor.getActiveDocument().getPath();
        		var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.synchronize(collection[1]);
            });
		},
		
        gitCheckout: function() {
            app.requireLogin(function () {
                var path = editor.getActiveDocument().getPath();
        		var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.gitCheckout(collection[1]);
            });
		},
        gitCommit: function() {
            app.requireLogin(function () {
                var path = editor.getActiveDocument().getPath();
        		var collection = /^(.*)\/[^\/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.gitCommit(collection[1]);
            });
		},
        
        downloadApp: function () {
            app.requireLogin(function() {
                var path = editor.getActiveDocument().getPath();
            	var collection = /^(.*)\/[^\/]+$/.exec(path);
                $.log("downloading %s", collection);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.download(collection[1]);
            });
        },
        
		openApp: function (firstLoad) {
			var path = editor.getActiveDocument().getPath();
			var collection = /^(.*)\/[^\/]+$/.exec(path);
			if (!collection) {
                util.error("The file open in the editor does not belong to an application package!");
				return;
			}
			deploymentEditor.runApp(collection[1], firstLoad);
		},
        
        runAppOrQuery: function() {
            var doc = editor.getActiveDocument();
            var project = projects.getProjectFor(doc.getPath());
            if (project) {
                var url = project.url.replace(/\/{2,}/, "/");
                var link = eXide.configuration.context + url + "/";
                app.ensureSaved(function() {
                    project.win = window.open(link, project.abbrev);
                    project.win.focus();
                });
            } else if (!doc.isNew() && (doc.getSyntax() == "xquery")) {
                app.ensureSaved(function() {
                    window.open(doc.getExternalLink(), doc.getName());
                });
            }
        },
        
        toggleRunStatus: function(doc) {
            var project = projects.getProjectFor(doc.getPath());
            var enable = (project || (!doc.isNew() && doc.getSyntax() == "xquery"));
            $("#run").button("option", "disabled", !enable);
            enable = (doc.getSyntax() == "xquery" || doc.getSyntax() == "html" ||
                doc.getSyntax() == "javascript");
            $("#eval").button("option", "disabled", !enable);
        },
        
        ensureSaved: function(callback) {
            if (!editor.getActiveDocument().isSaved()) {
                app.requireLogin(function () {
                    eXide.util.Dialog.input("Save document?", "The current document has not been saved. Save now?", function() {
                            editor.saveDocument(null, function () {
                				util.message(editor.getActiveDocument().getName() + " stored.");
                                callback();
                			}, function (msg) {
                				util.Dialog.warning("Failed to Save Document", msg);
                			});
                    });
                });
            } else {
                callback();
            }
        },
        
		restoreState: function(callback) {
			if (!util.supportsHtml5Storage)
				return false;
			var sameVersion = preferences.read();
			if (!sameVersion) {
			    util.Dialog.message("Version Note", "It seems another version of eXide has been " +
			        "used from this browser before. If you experience any display issues, please clear your browser's cache " +
                    "(holding shift while clicking on the reload icon should usually be sufficient).");
			}
			layout.restoreState(sameVersion);
			
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
                    app.newDocument("", "xquery");
                } else {
                    var active = localStorage["eXide.activeTab"];
                    if (active) {
                        app.findDocument(active);
                    }
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
            app.$doOpenDocument(doc, function() {
                if (doc.line) {
                    editor.editor.gotoLine(doc.line + 1);
                }
                self.restoreDocs(docs, callback);
            });
        },
        
		saveState: function() {
			if (!util.supportsHtml5Storage)
				return;
			localStorage.clear();
			preferences.save();
			layout.saveState();
			
            localStorage["eXide.layout.resultPanel"] = resultPanel;
            if (editor.getActiveDocument()) {
                localStorage["eXide.activeTab"] = editor.getActiveDocument().path;
            }
			editor.saveState();
			deploymentEditor.saveState();
		},
		
        getLogin: function(callback) {
            $.ajax({
                url: "login",
                dataType: "json",
                success: function(data) {
                    if (data && data.user) {
                        app.login = data;
                        $("#user").text("Logged in as " + app.login.user + ". ");
                        if (callback) callback(app.login.user);
                    } else {
                        app.login = null;
                        if (callback) callback(null);
                    }
                },
                error: function (xhr, textStatus) {
                    app.login = null;
                    $("#user").text("Login");
                    if (callback) callback(null);
                }
            })
        },
        
        enforceLogin: function() {
            app.requireLogin(function() {
                if (!app.login || app.login.user === "guest") {
                    app.enforceLogin();
                }
            });
        },
        
		$checkLogin: function () {
			if (app.login)
				return true;
			util.error("Warning: you are not logged in.");
			return false;
		},
		
        requireLogin: function(callback) {
            if (!app.login) {
                $("#login-dialog").dialog("option", "close", function () {
                    if (app.login) {
                        callback();
                    } else {
                        util.error("Warning: you are not logged in!");
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
            $("#outline-body,#directory-body,#results-body ").removeClass().addClass(theme.cssClass);
        },
        
        updateStatus: function(doc) {
            $("#syntax").val(doc.getSyntax());
            $("#status .path").text(util.normalizePath(doc.getPath()));
            if (!doc.isNew() && (doc.getSyntax() == "xquery" || doc.getSyntax() == "html" || doc.getSyntax() == "xml")) {
                $("#status a").attr("href", doc.getExternalLink());
                $("#status a").css("visibility", "visible");
            } else {
                $("#status a").css("visibility", "hidden");
            }
        },
       
        showResultsPanel: function() {
			layout.show(resultPanel, true);
			app.resize(true);
        },
        
        toggleResultsPanel: function() {
            layout.toggle(resultPanel);
			app.resize(true);
        },
        
        prepareResultsPanel: function(target, switchPanels) {
            var iframe = document.getElementById("results-iframe");
            var contents = $("#results-body").parent().children(":not(.resize-handle)").detach();
            contents.appendTo(".panel-" + target);
            if ($("#serialization-mode").val() == "html") {
                $(iframe).show();
                $("#serialization-mode").attr("disabled", "disabled").val("html");
                if (switchPanels) {
                    app.runQuery();
                }
            } else {
                $("#results-iframe").hide();
            }
        },
        
        switchResultsPanel: function() {
            var target = resultPanel === "south" ? "east" : "south";
            app.prepareResultsPanel(target, true);
            layout.hide(resultPanel);

            resultPanel = target;
            if (resultPanel === "south") {
                $(".layout-switcher").attr("src", "resources/images/layouts_split.png");
            } else {
                $(".layout-switcher").attr("src", "resources/images/layouts_split_vertical.png");
            }
            app.showResultsPanel();
        },
        
        initStatus: function(msg) {
            $("#splash-status").text(msg);
        },
       
        git: function() {
            var gitUrl ='modules/git.xql',
                gitError = function(xhr, status) {
                           util.error("Failed to apply configuration: " + xhr.responseText);
                       },
                showResultsPanel = function() {
                    editor.updateStatus("");
				    editor.clearErrors();
				    app.showResultsPanel();
				    startOffset = 1;
				    currentOffset = 1;
                },       
                gitShow = function (data, status, xhr) {
                                showResultsPanel();
                                var iframe = document.getElementById("results-iframe");
                                $(iframe).show();
                                iframe.contentWindow.document.open('text/html', 'replace');
                                iframe.contentWindow.document.write(JSON.stringify(data));
                                iframe.contentWindow.document.close();
                             };       
            
            return {
                 branch: function(gitApp)   {
                     console.info('git.branch');
                     if(!app.login.isAdmin) {return}   
                     $.ajax({ 
                        type: "GET",
                        url: gitUrl,
                        data: { target: gitApp.root, "git-command": "branch" },
                        dataType: "json",
                        success: function (data) {
                            var lines = data.stdout
                                    ? $.isArray(data.stdout.line)
                                        ? data.stdout.line 
                                        : [data.stdout.line]
                                            : [];
                            gitApp.gitBranch = $.map(lines,function(l, index){
                                var current = l.split(' ').pop()
                                if(/^\*/.test(l)) {
                                   gitApp.gitCurrentBranch = current ;
                                   gitApp.gitCurrentBranchIndex = index;
                                   }
                                 return current  
                                });
                            $("#toolbar-current-branch").text(gitApp.gitCurrentBranch);
                            $("#menu-git-active").text(gitApp.gitCurrentBranch);
                            $("#menu-git-working-dir").text(gitApp.workingDir);
                        },
                        error : gitError 
                     });   
                 },
                 command : function(gitApp, command,option, success){
                      if(!app.login.isAdmin) {return}
                     $.ajax({
                        type: "GET",
                        url: gitUrl,
                        data: { target: gitApp.root, "git-command": command, "git-option" : option },
                        dataType: "json",
                        success: function (data) {
                            if(typeof success =='function'){success(data)}
                            gitShow(data)
                        },
                        error : gitError 
                     });   
                 }
             }
        }(),
        
        findFiles: function() {
            var doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), function(app) {
                eXide.find.Files.open(doc, app, function(searchParams) {
                    editor.updateStatus("");
				    editor.clearErrors();
				    startOffset = 1;
				    currentOffset = 1;
				    
                    var iframe = document.getElementById("results-iframe");
                    $(iframe).show();
				    eXide.app.showResultsPanel();
                    
                    iframe.contentWindow.document.open('text/html', 'replace');
                    iframe.contentWindow.document.write("<html><body><p>Searching ...</p></body></html>");
                    iframe.contentWindow.document.close();
                    
                    iframe.src = "modules/search.xql?" + searchParams;
                });
            });
        },
       
        liveReload: function() {
            var doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), function(project) {
                if (project == null) {
                    return;
                }
                $.log("live reload: %s %s", project.liveReload, project.abbrev);
                if (project.liveReload) {
                    var url = project.url.replace(/\/{2,}/, "/");
                    var link = eXide.configuration.context + url + "/";
                    project.win = window.open(link, project.abbrev);
                    if (project.win && !project.win.closed) {
                        project.win.location.reload();
                    } else {
                        $.log("app window not found: %s", project.abbrev);
                    }
                }
            });
        },
        
        toggleLiveReload: function() {
            var doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), function(project) {
                if (!project) {
                    return;
                }
                project.liveReload = !project.liveReload;
                $("#menu-deploy-live span").attr("class", project.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
                if (project.liveReload && (!project.win || project.win.closed)) {
                    app.openApp(true);
                }
            });
        },
        
		initGUI: function(menu) {
            if (util.supportsHtml5Storage && localStorage.getItem("eXide.firstTime")) {
                resultPanel = localStorage["eXide.layout.resultPanel"] || "south";
            }
            layout = new app.Layout(editor);
            if (resultPanel == "south") {
                layout.hide("east");
            } else {
                layout.hide("south");
            }
            
            app.prepareResultsPanel(resultPanel);
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
				buttons: [
					{
					    text: "Login",
					    click: function() {
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
    							    if (!data.user) {
    							        $("#login-error").text("Login failed.");
    								    $("#login-dialog input:first").focus();
    							    } else {
        								app.login = data;
        								$.log("Logged in as %o. Is dba: %s", data, app.login.isAdmin);
        								$("#login-dialog").dialog("close");
        								$("#user").text("Logged in as " + app.login.user + ". ");
        								editor.focus();
    							    }
    							},
    							error: function (xhr, status, data) {
    								$("#login-error").text("Login failed. " + data);
    								$("#login-dialog input:first").focus();
    							}
					        });
					    },
					    icons: { primary: "fa fa-sign-in" }
					},
					{
					    text: "Cancel",
					    icons: { primary: "fa fa-times" },
					    click: function () { $(this).dialog("close"); editor.focus(); }
					}
				],
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
            $("#version-warning").dialog({
                appendTo: "#layout-container",
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
            
            util.Popup.init("#autocomplete-box", editor);
            
            $(".toolbar-buttons").buttonset();
            
			// initialize buttons and menu events
            var button = $("#open").button("option", "icons", { primary: "fa fa-folder-open-o" });
			button.click(app.openDocument);
            menu.click("#menu-file-open", app.openDocument);
			
            button = $("#close").button("option", "icons", { primary: "fa fa-times" });
			button.click(app.closeDocument);
			menu.click("#menu-file-close", app.closeDocument);
			
			menu.click("#menu-file-close-all", app.closeAll);
			
            button = $("#new").button("option", "icons", { primary: "fa fa-file-o" });
			button.click(function() {
                app.newDocumentFromTemplate();
			});
            
            button = $("#new-xquery").button("option", "icons", { primary: "fa fa-file-code-o" });
			button.click(function() {
                app.newDocument(null, "xquery");
			});
			menu.click("#menu-file-new", app.newDocumentFromTemplate);
    		menu.click("#menu-file-new-xquery", function() {
                app.newDocument(null, "xquery");
    		});

            button = $("#eval").button("option", "icons", { primary: "fa fa-cogs" });
            button.button("option", "disabled", true);
			button.click(function(ev) { app.runQuery() });

            button = $("#run").button("option", "icons", { primary: "fa fa-play" });
			button.click(function(ev) { app.runAppOrQuery() });
			
            button = $("#debug").button("option", "icons", { primary: "fa fa-fast-forward" });
            button.click(app.startDebug);

            
            button = $("#debug-actions #step-over").button("option", "icons", { primary: "fa fa-fast-forward" });
            button.click(app.stepOver);

            button = $("#debug-actions #step-into").button("option", "icons", { primary: "fa fa-fast-forward" });
            button.click(app.stepInto);

            button = $("#debug-actions #step-out").button("option", "icons", { primary: "fa fa-fast-forward" });
            button.click(app.startDebug);

            button = $("#validate").button("option", "icons", { primary: "fa fa-check" });

			button.click(app.checkQuery);
            
            button = $("#save").button("option", "icons", { primary: "fa fa-save" });
			button.click(app.saveDocument);
			menu.click("#menu-file-save", app.saveDocument);
            menu.click("#menu-file-save-as", app.saveDocumentAs);
			
            menu.click("#menu-file-reload", app.reloadDocument);
            
			menu.click("#menu-file-download", app.download);
			menu.click("#menu-file-manager", app.manage);
			// menu-only events
			menu.click("#menu-deploy-new", app.newDeployment);
			menu.click("#menu-deploy-edit", app.deploymentSettings);
			menu.click("#menu-deploy-live", app.toggleLiveReload);
			menu.click("#menu-deploy-sync", app.synchronize);
            menu.click("#menu-deploy-download", app.downloadApp);
            
            menu.click("#menu-git-checkout", app.gitCheckout);
            menu.click("#menu-git-commit", app.gitCommit);
            
			menu.click("#menu-edit-undo", function () {
				editor.editor.undo();
			});
			menu.click("#menu-edit-redo", function () {
				editor.editor.redo();
			});
            menu.click("#menu-edit-find", function() {
                var config = require("ace/config");
                config.loadModule("ace/ext/searchbox", function(e) {e.Search(editor.editor)});
            });
            menu.click("#menu-edit-find-replace", function() {
                var config = require("ace/config");
                config.loadModule("ace/ext/searchbox", function(e) {e.Search(editor.editor, true)});
            });
            menu.click("#menu-edit-find-files", function() {
                app.findFiles();
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
            menu.click("#menu-navigate-info", function() {
                editor.exec("showFunctionDoc");
            });
            menu.click("#menu-navigate-symbol", function() {
                editor.exec("gotoSymbol");
            });
            menu.click("#menu-navigate-buffer", function() {
                editor.selectTab();
            });
            menu.click("#menu-navigate-commands", function() {
                app.getMenu().commandPalette();
            });
            menu.click("#menu-navigate-line", function() {
                editor.gotoLine();
            });
            menu.click("#menu-navigate-history", function() {
                editor.historyBack();
            });
            menu.click("#menu-navigate-toggle-results", function() {
                app.toggleResultsPanel();
            });
            menu.click("#menu-navigate-reset", function() {
                if (resultPanel !== "south") {
                    app.switchResultsPanel();
                }
                layout.reset();
            });
			menu.click("#menu-deploy-run", app.runAppOrQuery);
			
            menu.click("#menu-help-keyboard", function (ev) {
				$("#keyboard-help").dialog("open");
			});
            menu.click("#menu-help-about", function (ev) {
				$("#about-dialog").dialog("open");
			});
            // menu.click("#menu-help-documentation", function(ev) {
            //     util.Help.show();
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
                app.updateStatus(doc);
                projects.findProject(doc.getBasePath(), function(app) {
                    if (app) {
                        $("#toolbar-current-app").text(app.abbrev);
                        $("#menu-deploy-active").text(app.abbrev);
                        $("#menu-deploy-live span").attr("class", app.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
                        // update show/hide git stuff
                        if(app.git == "true" || app.git == true) {
                            $(".current-branch").show();
                            $("#menu-git").show();
                            // update git-status
                            eXide.app.git.branch(app);
                        } else {
                            $(".current-branch").hide();
                            $("#menu-git").hide();
                        }
                        
                    } else {
                        $("#toolbar-current-app").text("unknown");
                        $("#menu-deploy-active").text("unknown");
                        $(".current-branch").hide();
                        $("#menu-git").hide();
                    }
                });
			});
			
            
			$("#user").click(function (ev) {
				ev.preventDefault();
				if (app.login) {
					// logout
					$.get("login?logout=logout");
					$("#user").text("Login");
					app.login = null;
				} else {
					$("#login-dialog").dialog("open");
				}
			});
            if (!util.supportsFullScreen()) {
                $("#toggle-fullscreen").hide();
            }
            $("#toggle-fullscreen").click(function(ev) {
                ev.preventDefault();
                util.requestFullScreen(document.getElementById("fullscreen"));
            });
            $(".results-container .layout-switcher").click(app.switchResultsPanel);
			$('.results-container .next').click(app.browseNext);
			$('.results-container .previous').click(app.browsePrevious);
            $("#serialization-mode").change(function(ev) {
                if (lastQuery) {
                    app.runQuery(lastQuery);
                }
            });
            $("#error-status").mouseover(function(ev) {
                var error = this;
                $("#ext-status-bar").each(function() {
                    this.innerHTML = error.innerHTML;
                    $(this).css("display", "block");
                });
            });
            $("#ext-status-bar,#error-status").mouseout(function(ev) {
               $("#ext-status-bar").css("display", "none");
            });
            $(window).blur(function() {
                hasFocus = false;
            });
            $(window).focus(function() {
                var checkLogin = !hasFocus;
                hasFocus = true;
                if (checkLogin) {
                   app.getLogin();
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
            if (!util.supportsHtml5Storage)
    		    return;
            // if local storage contains eXide properties, the app has already
            // been started before and we do not show the welcome dialog
            var showHints = localStorage.getItem("eXide.firstTime");
            if (!showHints || showHints == 1) {
                $("#dialog-startup").dialog("open");
            }
		}
	};
	
	return app;
}(eXide.util));
