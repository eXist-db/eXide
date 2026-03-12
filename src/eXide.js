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
document.addEventListener("DOMContentLoaded", function() {
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
    var numberOfResults = 10;
    var activeResultIdx = -1;

	var login = null;

    var allowDnd = true;

    // used to detect when window looses focus
    var hasFocus = true;

    var resultPanel = "south";

    var monitor = null;

    var dialogs = {};

    /**
     * Apply CM6 syntax highlighting to a result content element.
     * Detects the language from the serialization mode and uses
     * highlightTree to produce highlighted spans.
     */
    function highlightResultContent(contentEl) {
        if (!CM6.highlightTree) return;
        var text = contentEl.textContent;
        if (!text || text.length === 0) return;

        var serializationMode = document.getElementById("serialization-mode").value;
        var langSupport;
        switch (serializationMode) {
            case "xml":
            case "xhtml":
            case "xhtml5":
            case "microxml":
                langSupport = CM6.xml();
                break;
            case "json":
                langSupport = CM6.json();
                break;
            case "html5":
                langSupport = CM6.html();
                break;
            default:
                // Sniff content: XML starts with < or whitespace+<
                if (/^\s*</.test(text)) {
                    langSupport = CM6.xml();
                } else if (/^\s*[\[{]/.test(text)) {
                    langSupport = CM6.json();
                } else {
                    return; // plain text, no highlighting
                }
        }
        var lang = langSupport.language;
        var tree = lang.parser.parse(text);
        var parts = [];
        var pos = 0;
        CM6.highlightTree(tree, CM6.classHighlighter, function(from, to, classes) {
            if (from > pos) {
                parts.push(document.createTextNode(text.slice(pos, from)));
            }
            var span = document.createElement("span");
            span.className = classes;
            span.textContent = text.slice(from, to);
            parts.push(span);
            pos = to;
        });
        if (pos < text.length) {
            parts.push(document.createTextNode(text.slice(pos)));
        }
        if (parts.length > 0) {
            contentEl.textContent = "";
            for (var i = 0; i < parts.length; i++) {
                contentEl.appendChild(parts[i]);
            }
        }
    }

    var webResources = {
        "html": 1,
        "javascript": 1,
        "css": 1,
        "less": 1
    };

	var app = {

		init: function(afterInitCallback) {
		    if (!("flex" in document.documentElement.style)) {
		        document.getElementById("startup-error").style.display = "";
		        return;
            }

            projects = new eXide.edit.Projects();
            menu = new util.Menubar(document.querySelector(".menu"));
			editor = new eXide.edit.Editor(document.getElementById("editor"), menu);
			deploymentEditor = new eXide.edit.PackageEditor(projects);

			dbBrowser = new eXide.browse.Browser(document.getElementById("open-dialog"));


			preferences = new util.Preferences(editor);

            editor.addEventListener("setTheme", app.setTheme);

            app.initGUI(menu);

			var dnd = new eXide.util.DnD("body");
			dnd.addEventListener("drop", app.dropFile);

            // save restored paths for later
            app.getLogin(function() {
                app.initStatus("Restoring state");
                app.restoreState(function(restored) {
                    app.updateLayoutTop();
                    editor.init();
                    if (afterInitCallback) {
                        afterInitCallback(restored);
                    }
                    if (eXide.configuration.allowGuest) {
                        document.getElementById("splash").style.display = "none";
                    } else {
                        app.requireLogin(function() {
                            document.getElementById("splash").style.display = "none";
                        });
                    }
                });
            });

		    editor.addEventListener("outlineChange", app.onOutlineChange);
            editor.validator.addEventListener("documentValid", function(doc) {
                if (doc.isXQuery() && document.getElementById("live-preview").checked) {
                    app.runQuery(doc.getPath(), true);
                }
            });
            editor.addEventListener("saved", function(doc) {
                if (document.getElementById("live-preview").checked && webResources[doc.getSyntax()]) {
                    document.getElementById("results-iframe").contentDocument.location.reload(true);
                }
            });

			window.addEventListener("resize", function() {
			    app.updateLayoutTop();
			    app.resize();
			});

			window.addEventListener("unload", function () {
				app.saveState();
			});
		},

        version: function() {
            return document.getElementById("eXide-version").textContent;
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

		updateAuthStatus: function(user) {
		    var el = document.getElementById("user");
		    if (user) {
		        el.innerHTML = '<span class="auth-dot auth-dot-ok"></span>' + user;
		        el.title = "Click to logout";
		    } else {
		        el.textContent = "Login";
		        el.title = "Click to login";
		    }
		    // Start/stop monitor based on auth and panel visibility
		    var eastEl = document.querySelector(".panel-east");
		    var eastVisible = eastEl && eastEl.style.display !== "none";
		    if (app.login && app.login.isAdmin && eastVisible) {
		        if (!monitor) {
		            monitor = new eXide.app.Monitor();
		            monitor.init();
		        }
		        monitor.start();
		    } else if (monitor) {
		        monitor.stop();
		    }
		},

		toggleMonitor: function() {
		    if (!monitor) {
		        monitor = new eXide.app.Monitor();
		        monitor.init();
		    }
		    layout.toggle("east");
		    var eastEl = document.querySelector(".panel-east");
		    var isVisible = eastEl && eastEl.style.display !== "none";
		    if (isVisible) {
		        if (app.login && app.login.isAdmin) {
		            monitor.start();
		        } else {
		            monitor.showMessage("The monitoring panel is only available to the admin user or users in the dba group.");
		        }
		    } else {
		        monitor.stop();
		    }
		    app.$savePanelPrefs();
		},

		updateLayoutTop: function() {
		    var toolbarBtns = document.querySelector(".toolbar-buttons");
		    var layoutH = document.querySelector(".layout-horizontal");
		    if (toolbarBtns && layoutH) {
		        var fullscreen = document.getElementById("fullscreen");
		        var top = toolbarBtns.getBoundingClientRect().bottom -
		                  fullscreen.getBoundingClientRect().top + 2;
		        layoutH.style.top = top + "px";
		    }
		},

		resize: function(resizeIframe) {
			var panel = document.getElementById("editor");
            if (resizeIframe) {
                var resultsContainer = document.querySelector(".panel-" + resultPanel);
                var resultsBody = document.getElementById("results-body");
                var navbarEl = resultsContainer.querySelector(".navbar");
                var navbarHeight = navbarEl ? navbarEl.offsetHeight : 0;
                document.getElementById("results-iframe").style.width = resultsBody.clientWidth + "px";
                document.getElementById("results-iframe").style.height = (resultsContainer.clientHeight - navbarHeight - 8) + "px";
                resultsBody.style.height = (resultsContainer.clientHeight - navbarHeight - 8) + "px";
            }
			editor.resize();
		},

        beforeResize: function() {
            if (document.getElementById("serialization-mode").value == "html") {
                document.getElementById("results-iframe").style.display = "none";
            }
        },

        afterResize: function() {
            editor.resize();
            if (document.getElementById("serialization-mode").value == "html") {
                document.getElementById("results-iframe").style.display = "";
            }
        },

		newDocument: function(data, type) {
			editor.newDocument(data, type);
		},

        newDocumentFromTemplate: function() {
            dialogs["dialog-templates"].open();
        },

        dropFile: function(files) {
            if (!allowDnd) {
                return;
            }
            if (typeof FileReader !== "undefined") {
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
        			    editorUtils.gotoLine(editor.editor, line);
        			}
				});
			} else {
				editor.switchTo(doc);
				if (line) {
    			    editorUtils.gotoLine(editor.editor, line);
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
			dialogs["open-dialog"].setTitle("Open Document");
			dialogs["open-dialog"].setButtons({
			    "Cancel": function() { dialogs["open-dialog"].close(); editor.focus(); },
			    "Open": function(){ app.openSelectedDocument(null, true);}
			});
			dialogs["open-dialog"].open();
		},

		openSelectedDocument: function(doc, close) {
			var resource = doc || dbBrowser.getSelection();
			if (resource) {
				app.$doOpenDocument(resource);
			}
			if (close == undefined || close)
				dialogs["open-dialog"].close();
		},

        downloadSelectedResources: function(resources, close) {
			if (resources) {
                resources.forEach(resource => {
                    app.download(resource.key);
                })
			}else {
                util.Dialog.warning("Invalid selection","The Download Selected command requires that resources be selected. Please select resources for download.")
            }
			if (close == undefined || close)
				dialogs["open-dialog"].close();
		},

		$doOpenDocument: function(resource, callback, reload, forceText) {
			resource.path = util.normalizePath(resource.path);
            var indentOnOpen = document.getElementById("indent-on-open").checked;
            var expandXIncludesOnOpen = document.getElementById("expand-xincludes-on-open").checked;
            var omitXMLDeclatarionOnOpen = document.getElementById("omit-xml-decl-on-open").checked;
            var doc = editor.getDocument(resource.path);
            if (doc && !reload) {
                editor.switchTo(doc);
                if (callback) {
                    callback(resource);
                }
                return true;
            }
			var params = new URLSearchParams({
			    "path": resource.path,
			    "indent": indentOnOpen,
			    "expand-xincludes": expandXIncludesOnOpen,
			    "omit-xml-decl": omitXMLDeclatarionOnOpen
			});
			fetch("modules/load.xq?" + params.toString())
			    .then(function(response) {
			        if (!response.ok) {
			            throw { status: response.status, statusText: response.statusText };
			        }
			        var contentType = response.headers.get("Content-Type") || "";
			        var externalPath = response.headers.get("X-Link");
			        var baseMime = contentType.replace(/;.*$/, "").trim();
			        // Show binary files in a preview overlay
			        if (!reload && !forceText && /^image\/|^audio\/|^video\/|^application\/pdf|^application\/octet-stream|^application\/zip/.test(baseMime)) {
			            var fileUrl = externalPath || ("rest" + resource.path);
			            var fileName = resource.name || resource.path.replace(/^.*\//, "");
			            app.$showBinaryPreview(fileUrl, fileName, baseMime, resource, callback);
			            if (callback) { callback(null); }
			            return true;
			        }
			        return response.text().then(function(data) {
			            if (reload) {
			                editor.reload(data);
			            } else {
			                var mime = forceText ? "text/text" : util.mimeTypes.getMime(contentType);
			                editor.openDocument(data, mime, resource, externalPath);
			            }
			            if (callback) {
			                callback(resource);
			            }
			            return true;
			        });
			    })
			    .catch(function(err) {
			        util.error("Failed to load document " + encodeURI(resource.path) + ": " +
			            (err.status || "") + " " + (err.statusText || err.message || ""));
			        if (callback) {
			            callback(null);
			        }
			        return false;
			    });
		},

		$showBinaryPreview: function(fileUrl, fileName, mime, resource, callback) {
		    // Remove existing overlay
		    var existing = document.getElementById("binary-preview-overlay");
		    if (existing) existing.remove();

		    var overlay = document.createElement("div");
		    overlay.id = "binary-preview-overlay";
		    overlay.className = "binary-preview-overlay";

		    var panel = document.createElement("div");
		    panel.className = "binary-preview-panel";

		    // Header
		    var header = document.createElement("div");
		    header.className = "binary-preview-header";
		    var title = document.createElement("span");
		    title.className = "binary-preview-title";
		    title.textContent = fileName;
		    title.title = fileName;
		    header.appendChild(title);
		    var closeBtn = document.createElement("button");
		    closeBtn.className = "binary-preview-close";
		    closeBtn.textContent = "\u2715";
		    closeBtn.title = "Close";
		    header.appendChild(closeBtn);
		    panel.appendChild(header);

		    // Content
		    var content = document.createElement("div");
		    content.className = "binary-preview-content";
		    if (/^image\//.test(mime)) {
		        var img = document.createElement("img");
		        img.src = fileUrl;
		        img.alt = fileName;
		        content.appendChild(img);
		    } else if (mime === "application/pdf") {
		        var embed = document.createElement("embed");
		        embed.src = fileUrl;
		        embed.type = "application/pdf";
		        embed.style.width = "100%";
		        embed.style.height = "100%";
		        content.appendChild(embed);
		    } else if (/^audio\//.test(mime)) {
		        var audio = document.createElement("audio");
		        audio.src = fileUrl;
		        audio.controls = true;
		        content.appendChild(audio);
		    } else if (/^video\//.test(mime)) {
		        var video = document.createElement("video");
		        video.src = fileUrl;
		        video.controls = true;
		        video.style.maxWidth = "100%";
		        video.style.maxHeight = "100%";
		        content.appendChild(video);
		    } else {
		        var msg = document.createElement("div");
		        msg.className = "binary-preview-nopreview";
		        msg.innerHTML = '<i class="fa fa-file-o" style="font-size:48px;margin-bottom:12px;display:block"></i>No preview available<br><small>' + mime + '</small>';
		        content.appendChild(msg);
		    }
		    panel.appendChild(content);

		    // Footer
		    var footer = document.createElement("div");
		    footer.className = "binary-preview-footer";
		    var openBtn = document.createElement("button");
		    openBtn.textContent = "Open in New Tab";
		    openBtn.addEventListener("click", function() {
		        window.open(fileUrl, fileName);
		    });
		    var dlBtn = document.createElement("button");
		    dlBtn.textContent = "Download";
		    dlBtn.addEventListener("click", function() {
		        var a = document.createElement("a");
		        a.href = fileUrl;
		        a.download = fileName;
		        a.click();
		    });
		    var openTextBtn = document.createElement("button");
		    openTextBtn.textContent = "Open Anyway";
		    openTextBtn.title = "Open as plain text in the editor";
		    openTextBtn.addEventListener("click", function() {
		        close();
		        app.$doOpenDocument(resource, callback, false, true);
		    });
		    var cancelBtn = document.createElement("button");
		    cancelBtn.textContent = "Close";
		    cancelBtn.addEventListener("click", close);
		    footer.appendChild(openTextBtn);
		    footer.appendChild(openBtn);
		    footer.appendChild(dlBtn);
		    footer.appendChild(cancelBtn);
		    panel.appendChild(footer);

		    overlay.appendChild(panel);
		    document.body.appendChild(overlay);

		    function close() {
		        overlay.remove();
		    }
		    closeBtn.addEventListener("click", close);
		    overlay.addEventListener("click", function(e) {
		        if (e.target === overlay) close();
		    });
		    document.addEventListener("keydown", function onKey(e) {
		        if (e.key === "Escape") {
		            close();
		            document.removeEventListener("keydown", onKey);
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
				if (!dialogs["dialog-confirm-close"]) {
				    dialogs["dialog-confirm-close"] = eXide.util.DialogManager.create(
				        document.getElementById("dialog-confirm-close"), {
				            appendTo: "#layout-container",
				            modal: true,
				            width: 420,
				            buttons: {
				                "Close": function() {
				                    dialogs["dialog-confirm-close"].close();
				                    editor.closeDocument();
				                },
				                "Cancel": function() {
				                    dialogs["dialog-confirm-close"].close();
				                }
				            }
				        }
				    );
				}
				dialogs["dialog-confirm-close"].open();
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
                    dbBrowser.changeToCollection("/db");
        			dbBrowser.reload(["reload", "create"], "save");
    				dialogs["open-dialog"].setTitle("Save Document");
    				dialogs["open-dialog"].setButtons({
    					"Cancel": function() {
                            dialogs["open-dialog"].close();
        				},
    					"Save": function() {
                            if(editor.getActiveDocument().isXQuery() && !/([^\s\\])*\.xq.?/.test(dbBrowser.getSelection().name)) {
                                util.Dialog.warning("Failed to Save Document", "Your current file is an XQuery file, but you are trying to save it with a non-XQuery file extension (.xq, .xqm etc).  If you intended this to be another file type such as XML, copy and paste the content into a New file created using the \u201cNew\u201d button.");
                                return;
                            }

    						editor.saveDocument(dbBrowser.getSelection(), function () {
    							dialogs["open-dialog"].close();
                                deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                                app.updateStatus(this);
								app.syncDirectory(this.getBasePath())
                                app.liveReload();
    						}, function (msg) {
    							util.Dialog.warning("Failed to Save Document", msg);
    						});
    					}
    				});
    				dialogs["open-dialog"].open();
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
                if (editor.getActiveDocument().getPath().match('^__new__')) {
                    dbBrowser.changeToCollection("/db");
                }else {
                    dbBrowser.changeToCollection(editor.getActiveDocument().getBasePath());
                }
                dbBrowser.reload(["reload", "create"], "save");
    			dialogs["open-dialog"].setTitle("Save Document As ...");
    			dialogs["open-dialog"].setButtons({
    				"Cancel": function() {
                        dialogs["open-dialog"].close();
    				},
    				"Save": function() {
                         if(editor.getActiveDocument().isXQuery() && !/([^\s\\])*\.xq.?/.test(dbBrowser.getSelection().name)) {
                            util.Dialog.warning("Failed to Save Document", "Your current file is an XQuery file, but you are trying to save it with a non-XQuery file extension (.xq, .xqm etc).  If you intended this to be another file type such as XML, copy and paste the content into a New file created using the \u201cNew\u201d button.");
                            return;
                        }

    					editor.saveDocument(dbBrowser.getSelection(), function () {
    						dialogs["open-dialog"].close();
                            deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                            app.updateStatus(this);
							app.syncDirectory(this.getBasePath())
                            app.liveReload();
    					}, function (msg) {
    						util.Dialog.warning("Failed to Save Document", msg);
    					});
    				}
    			});
    			dialogs["open-dialog"].open();
            });
        },

        exec: function() {
            editor.exec(arguments);
        },

        download: function(path) {
            var indentOnDownload = document.getElementById("indent-on-download").checked;
            var expandXIncludesOnDownload = document.getElementById("expand-xincludes-on-download").checked;
            var omitXMLDeclatarionOnDownload = document.getElementById("omit-xml-decl-on-download").checked;
			var doc = editor.getActiveDocument();
			if (!path && (doc.getPath().match("^__new__") || !doc.isSaved())) {
				util.error("There are unsaved changes in the document. Please save it first.");
				return;
			}
            var path = path || doc.getPath()
            const url = "modules/load.xq?download=true&path=" + encodeURIComponent(path) + "&indent=" + indentOnDownload + "&expand-xincludes=" + expandXIncludesOnDownload + "&omit-xml-decl=" + omitXMLDeclatarionOnDownload;
            fetch(url)
            .then(resp => resp.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = decodeURI(path.split("/").slice(-1)[0]);;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            })
		},

		runQuery: function(path, livePreview) {
            function showResultsPanel() {
                editor.updateStatus("");
				editor.clearErrors();
				app.showResultsPanel();

				startOffset = 1;
				currentOffset = 1;
                activeResultIdx = -1;
            }

            if (!(eXide.configuration.allowExecution || app.login.isAdmin)) {
                util.error("You are not allowed to execute XQuery code.");
                return;
            }
            switch (editor.getActiveDocument().getSyntax()) {
                case "html":
                    showResultsPanel();
                    var iframe = document.getElementById("results-iframe");
                    iframe.style.display = "";
                    if (path) {
                        iframe.src = editor.getActiveDocument().getExternalLink();
                    } else {
                        iframe.contentDocument.documentElement.innerHTML = editor.getText();
                    }
                    document.getElementById("serialization-mode").setAttribute("disabled", "disabled");
                    document.getElementById("serialization-mode").value = "html";
                    break;
                case "javascript":
                    showResultsPanel();
                    var iframe = document.getElementById("results-iframe");
                    iframe.style.display = "";
                    var code = editor.getText();
                    code = "<script type=\"text/javascript\">" + code + "</script>";
                    iframe.contentDocument.documentElement.innerHTML = code;
                    document.getElementById("serialization-mode").setAttribute("disabled", "disabled");
                    document.getElementById("serialization-mode").value = "html";
                    break;
                default:
                    var code = editor.getText();
                    if (path) {
                        var doc = editor.getDocument(path);
                        if (doc) {
                            code = doc.getText();
                        } else {
                            return;
                        }
                    } else {
                        lastQuery = editor.getActiveDocument().getPath();
                    }
        			eXide.util.message("Running query ...");

                    document.getElementById("serialization-mode").removeAttribute("disabled");
                    var serializationMode = document.getElementById("serialization-mode").value;
        			var moduleLoadPath = "xmldb:exist://" + editor.getActiveDocument().getBasePath();
        			document.querySelectorAll('.results-container .results').forEach(function(el) { el.innerHTML = ""; });
        			var formData = new URLSearchParams();
        			formData.append("qu", code);
        			formData.append("base", moduleLoadPath);
        			formData.append("output", serializationMode);
        			var expectXml = (serializationMode == "adaptive" || serializationMode == "html5" || serializationMode == "xhtml" || serializationMode == "xhtml5" || serializationMode == "json" || serializationMode == "text" || serializationMode == "xml" || serializationMode == "microxml");
        			fetch("execute", {
        			    method: "POST",
        			    headers: { "Content-Type": "application/x-www-form-urlencoded" },
        			    body: formData.toString()
        			}).then(function(response) {
        			    if (!response.ok) {
        			        return response.text().then(function(text) {
        			            util.error(text, "Server Error");
        			        });
        			    }
        			    if (expectXml) {
        			        return response.text().then(function(text) {
        			            var parser = new DOMParser();
        			            var data = parser.parseFromString(text, "text/xml");
                                document.getElementById("results-iframe").style.display = "none";
            					var elem = data.documentElement;
            					if (elem.nodeName == 'error') {
            				        var msg = elem.textContent;
            				        editor.evalError(msg, !livePreview);
            					} else {
            						showResultsPanel();
            						hitCount = elem.getAttribute("hits");
            						endOffset = startOffset + numberOfResults - 1;
            						if (hitCount < endOffset)
            							endOffset = hitCount;
            						util.message("Query returned " + hitCount + " item(s) in " + elem.getAttribute("elapsed") + "s");
            						app.retrieveNext();
            					}
        			        });
        			    } else {
        			        return response.text().then(function(data) {
                                showResultsPanel();
                                var iframe = document.getElementById("results-iframe");
                                iframe.style.display = "";
                                iframe.contentWindow.document.open('text/html', 'replace');
                                iframe.contentWindow.document.write(data);
                                iframe.contentWindow.document.close();
        			        });
        			    }
        			}).catch(function(err) {
        			    util.error(err.message || String(err), "Server Error");
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
			console.log("retrieveNext: %d", currentOffset);
		    if (currentOffset > 0 && currentOffset <= endOffset) {
		        document.getElementById("serialization-mode").removeAttribute("disabled");
		        var serializationMode = document.getElementById("serialization-mode").value;
		        var autoExpandMatches = document.getElementById("auto-expand-matches").checked;
		        var indentResults = document.getElementById("indent-results").checked;
		        var url = 'results/' + currentOffset;
				currentOffset++;
				var params = new URLSearchParams({
				    "output": serializationMode,
				    "auto-expand-matches": autoExpandMatches,
				    "indent": indentResults
				});
				fetch(url + "?" + params.toString())
				    .then(function(response) {
				        if (!response.ok) throw new Error(response.statusText);
				        return response.text();
				    })
				    .then(function(data) {
                        var temp = document.createElement("div");
                        temp.innerHTML = data;
                        var resultNode = temp.firstElementChild;
                        if (resultNode) {
                            var firstChild = resultNode.querySelector(":first-child");
                            if (firstChild) {
                                firstChild.style.width = (Math.ceil(Math.log(endOffset + 1) / Math.LN10)) + 'ch';
                            }
                            document.querySelectorAll('.results-container .results').forEach(function(el) {
                                el.appendChild(resultNode);
                            });
                            var contentDiv = resultNode.querySelector('.content');
                            if (contentDiv) {
                                highlightResultContent(contentDiv);
                            }
                            document.querySelectorAll('.results-container .current').forEach(function(el) {
                                el.textContent = 'Showing results ' + startOffset + ' to ' + (currentOffset - 1) + ' of ' + hitCount;
                            });
                            var posLinks = resultNode.querySelectorAll('.pos a');
                            posLinks.forEach(function(link) {
                                link.addEventListener("click", function(e) {
                                    e.preventDefault();
                                    app.findDocument(this.dataset.path);
                                });
                            });
                            var copyBtns = resultNode.querySelectorAll('.copy-result');
                            copyBtns.forEach(function(btn) {
                                btn.addEventListener("click", function() {
                                    var sibling = btn.parentNode.querySelector('.content');
                                    var text = sibling ? sibling.textContent : "";
                                    navigator.clipboard.writeText(text).then(function() {
                                        btn.classList.remove('fa-clipboard');
                                        btn.classList.add('fa-check', 'copied');
                                        setTimeout(function() {
                                            btn.classList.remove('fa-check', 'copied');
                                            btn.classList.add('fa-clipboard');
                                        }, 1200);
                                    });
                                });
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
		        var howmany = numberOfResults;
		        endOffset = currentOffset + howmany - 1;
				if (hitCount < endOffset)
					endOffset = hitCount;
				activeResultIdx = -1;
				document.querySelectorAll(".results-container .results").forEach(function(el) { el.innerHTML = ""; });
				app.retrieveNext();
			}
			return false;
		},

		/** Called if user clicks on "previous" link in query results. */
		browsePrevious: function() {
			if (currentOffset > 0 && startOffset > 1) {
		        var count = numberOfResults;
		        startOffset = startOffset - count;
				if (startOffset < 1)
					startOffset = 1;
				currentOffset = startOffset;
				endOffset = currentOffset + (count - 1);
				if (hitCount < endOffset)
					endOffset = hitCount;
				activeResultIdx = -1;
				document.querySelectorAll(".results-container .results").forEach(function(el) { el.innerHTML = ""; });
				app.retrieveNext();
			}
			return false;
		},

		browseFirst: function() {
			if (currentOffset > 0 && startOffset > 1) {
				startOffset = 1;
				currentOffset = 1;
				endOffset = Math.min(numberOfResults, hitCount);
				activeResultIdx = -1;
				document.querySelectorAll(".results-container .results").forEach(function(el) { el.innerHTML = ""; });
				app.retrieveNext();
			}
			return false;
		},

		browseLast: function() {
			if (currentOffset > 0 && endOffset < hitCount) {
				startOffset = Math.floor((hitCount - 1) / numberOfResults) * numberOfResults + 1;
				currentOffset = startOffset;
				endOffset = hitCount;
				activeResultIdx = -1;
				document.querySelectorAll(".results-container .results").forEach(function(el) { el.innerHTML = ""; });
				app.retrieveNext();
			}
			return false;
		},

		syncDirectory : function(collection) {
			editor.directory.reload(collection)
		},

		syncManager : function(collection) {
			var openDialogEl = document.getElementById("open-dialog");
			if(openDialogEl && openDialogEl.style.display !== "none" && openDialogEl.offsetParent !== null){
				dbBrowser.resources.collection = collection
				dbBrowser.resources.reload()
			}
		},

		manage: function() {
			app.requireLogin(function() {
                dbBrowser.reload(["reload", "create", "upload", "properties", "open", "download", "cut", "copy", "paste"], "manage");
                dialogs["open-dialog"].setTitle("DB Manager");
                dialogs["open-dialog"].setButtons({
                    "Close": function() { dialogs["open-dialog"].close(); }
                });
                dialogs["open-dialog"].open();
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
    			console.log("Deploying application from collection: %s", collection[1]);
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
                console.log("downloading %s", collection);
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
            var syntax = doc.getSyntax();
            var enable = ((syntax == "xquery" || syntax == "html") && (project || !doc.isNew()));
            document.getElementById("launch").disabled = !enable;
            enable = (doc.getSyntax() == "xquery");
            document.getElementById("run").disabled = !enable;
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
			app.updateDarkModeIcon(preferences.get("theme"));
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
				// New documents always editable (writable not stored for __new__ docs)
				if (doc.path && doc.path.match(/^__new__/)) {
					doc.writable = true;
				}
                if (!doc.name) {
                    continue;
                }
				console.log("Restoring doc %s, going to line = %i", doc.path, doc.line);
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
                    editorUtils.gotoLine(editor.editor, doc.line + 1);
                }
                self.restoreDocs(docs, callback);
            });
        },

		saveState: function() {
			if (!util.supportsHtml5Storage || app._skipSaveState)
				return;
			localStorage.clear();
			preferences.save();
			layout.saveState();

            if (editor.getActiveDocument()) {
                localStorage["eXide.activeTab"] = editor.getActiveDocument().path;
            }
			editor.saveState();
			deploymentEditor.saveState();
		},

        getLogin: function(callback) {
            fetch("api/auth/whoami")
            .then(function(response) {
                if (!response.ok) throw new Error(response.statusText);
                return response.json();
            })
            .then(function(data) {
                if (data && data.isLoggedIn) {
                    app.login = data;
                    app.updateAuthStatus(app.login.user);
                    if (callback) callback(app.login.user);
                } else {
                    app.login = null;
                    app.updateAuthStatus(null);
                    if (callback) callback(null);
                }
            })
            .catch(function(err) {
                app.login = null;
                app.updateAuthStatus(null);
                if (callback) callback(null);
            });
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
                dialogs["login-dialog"]._onClose = function () {
                    if (app.login) {
                        callback();
                    } else {
                        util.error("Warning: you are not logged in!");
                    }
                };
                dialogs["login-dialog"].open();
                var firstInput = document.querySelector("#login-dialog input:first-of-type");
                if (firstInput) firstInput.focus();
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
            editor.exec("debug");
        },

        stepOver: function() {
            editor.exec("stepOver");
        },

        stepInto: function() {
            editor.exec("stepInto");
        },

        setTheme: function(theme) {
            document.body.classList.toggle("dark", theme.isDark);
        },

        updateDarkModeIcon: function(themeOrResolved) {
            var icon = document.querySelector("#toggle-dark-mode i");
            if (!icon) return;
            // Show sun when dark (click to go light), moon when light (click to go dark)
            var isDark = themeOrResolved === "dark" || document.body.classList.contains("dark");
            icon.className = isDark ? "fa fa-sun-o" : "fa fa-moon-o";
        },

        updateStatus: function(doc) {
            var syntax = doc.getSyntax();
            // Update status bar type segment
            var typeLabels = {text:"Text",xml:"XML",html:"HTML",xquery:"XQuery",javascript:"Javascript",css:"CSS",less:"Less",json:"JSON",markdown:"Markdown"};
            var typeVal = document.getElementById("status-type-value");
            if (typeVal) typeVal.textContent = typeLabels[syntax] || syntax;
            // Update popover active state
            document.querySelectorAll("#type-popover .type-popover-item").forEach(function(el) {
                el.classList.toggle("active", el.dataset.value === syntax);
            });
            var pathEl = document.querySelector("#status .path");
            var pathText = doc.isNew() ? doc.getName() : decodeURI(util.normalizePath(doc.getPath()));
            var copyBtn = document.getElementById("status-copy-url");
            var extLink = doc.getExternalLink();
            if (!extLink && !doc.isNew()) {
                // Compute fallback external link from path
                var ctx = eXide.configuration.context || "";
                extLink = ctx + "/rest" + doc.getPath();
            }
            if (!doc.isNew() && extLink) {
                if (pathEl.tagName !== "A") {
                    var a = document.createElement("a");
                    a.className = "path";
                    a.target = "_blank";
                    a.rel = "noopener";
                    pathEl.replaceWith(a);
                    pathEl = a;
                }
                pathEl.href = extLink;
                pathEl.textContent = pathText;
                pathEl.title = "Launch this saved resource in a new browser tab";
                copyBtn.style.display = "";
            } else {
                if (pathEl.tagName !== "SPAN") {
                    var span = document.createElement("span");
                    span.className = "path";
                    pathEl.replaceWith(span);
                    pathEl = span;
                }
                pathEl.textContent = pathText;
                copyBtn.style.display = "none";
            }
        },

        showResultsPanel: function() {
			layout.show(resultPanel, true);
			app.resize(true);
        },

        toggleCollectionsPanel: function() {
            layout.toggle("west");
            app.$savePanelPrefs();
            app.resize(true);
        },

        toggleResultsPanel: function() {
            layout.toggle(resultPanel);
			app.resize(true);
        },

        setWestPanel: function(visible) {
            if (visible) {
                layout.show("west", true);
            } else {
                layout.hide("west");
            }
            app.resize(true);
        },

        isWestPanelVisible: function() {
            var el = document.querySelector(".panel-west");
            return el && el.style.display !== "none" && el.offsetParent !== null;
        },

        setSouthPanel: function(visible) {
            if (visible) {
                layout.show(resultPanel, true);
            } else {
                layout.hide(resultPanel);
            }
            app.resize(true);
        },

        isSouthPanelVisible: function() {
            var el = document.querySelector(".panel-" + resultPanel);
            return el && el.style.display !== "none" && el.offsetParent !== null;
        },

        setEastPanel: function(visible) {
            var eastEl = document.querySelector(".panel-east");
            var isVisible = eastEl && eastEl.style.display !== "none";
            if (visible && !isVisible) {
                layout.show("east");
                if (!monitor) {
                    monitor = new eXide.app.Monitor();
                    monitor.init();
                }
                if (app.login && app.login.isAdmin) {
                    monitor.start();
                }
            } else if (!visible && isVisible) {
                layout.hide("east");
                if (monitor) monitor.stop();
            }
            app.resize(true);
        },

        isEastPanelVisible: function() {
            var el = document.querySelector(".panel-east");
            return !!(el && el.style.display !== "none");
        },

        setCollectionsView: function(view) {
            var treeView = document.getElementById("dir-tree-view");
            var flatView = document.getElementById("dir-flat-view");
            var toggleBtn = document.getElementById("toggle-dir-view");
            var isFolder = (view === "folder");
            if (treeView) treeView.style.display = isFolder ? "none" : "";
            if (flatView) flatView.style.display = isFolder ? "" : "none";
            if (toggleBtn) {
                toggleBtn.title = isFolder ? "Switch to tree view" : "Switch to folder view";
                var icon = toggleBtn.querySelector("i");
                if (icon) icon.className = isFolder ? "fa fa-sitemap" : "fa fa-folder-open-o";
            }
            if (editor && editor.directory && editor.directory.setFlatViewActive) {
                editor.directory.setFlatViewActive(isFolder);
            }
        },

        $savePanelPrefs: function() {
            try {
                var eastEl = document.querySelector(".panel-east");
                var eastVisible = !!(eastEl && eastEl.style.display !== "none");
                // Update both localStorage and the live preferences object
                // so saveState's localStorage.clear() + preferences.save() preserves the value
                preferences.preferences.showWestPanel = app.isWestPanelVisible();
                preferences.preferences.showSouthPanel = app.isSouthPanelVisible();
                preferences.preferences.showEastPanel = eastVisible;
                preferences.save();
            } catch(e) {}
        },

        initStatus: function(msg) {
            document.getElementById("splash-status").textContent = msg;
        },

        git: function() {
            var gitUrl ="modules/git.xq",
                gitError = function(response) {
                           response.text().then(function(text) {
                               util.error("Failed to apply configuration: " + text);
                           });
                       },
                showResultsPanel = function() {
                    editor.updateStatus("");
				    editor.clearErrors();
				    app.showResultsPanel();
				    startOffset = 1;
				    currentOffset = 1;
                },
                gitShow = function (data) {
                                showResultsPanel();
                                var iframe = document.getElementById("results-iframe");
                                iframe.style.display = "";
                                iframe.contentWindow.document.open('text/html', 'replace');
                                iframe.contentWindow.document.write(JSON.stringify(data));
                                iframe.contentWindow.document.close();
                             };

            return {
                 branch: function(gitApp)   {
                     console.info('git.branch');
                     if(!app.login.isAdmin) {return}
                     var params = new URLSearchParams({
                         target: gitApp.root,
                         "git-command": "branch"
                     });
                     fetch(gitUrl + "?" + params.toString())
                         .then(function(response) {
                             if (!response.ok) { gitError(response); return; }
                             return response.json();
                         })
                         .then(function(data) {
                             if (!data) return;
                             var lines = data.stdout
                                     ? Array.isArray(data.stdout.line)
                                         ? data.stdout.line
                                         : [data.stdout.line]
                                             : [];
                             gitApp.gitBranch = lines.map(function(l, index){
                                 var current = l.split(' ').pop()
                                 if(/^\*/.test(l)) {
                                    gitApp.gitCurrentBranch = current ;
                                    gitApp.gitCurrentBranchIndex = index;
                                    }
                                  return current
                                 });
                             document.getElementById("toolbar-current-branch").textContent = gitApp.gitCurrentBranch;
                             document.getElementById("menu-git-active").textContent = gitApp.gitCurrentBranch;
                             document.getElementById("menu-git-working-dir").textContent = gitApp.workingDir;
                         });
                 },
                 command : function(gitApp, command,option, success){
                      if(!app.login.isAdmin) {return}
                     var params = new URLSearchParams({
                         target: gitApp.root,
                         "git-command": command,
                         "git-option": option
                     });
                     fetch(gitUrl + "?" + params.toString())
                         .then(function(response) {
                             if (!response.ok) { gitError(response); return; }
                             return response.json();
                         })
                         .then(function(data) {
                             if (!data) return;
                             if(typeof success =='function'){success(data)}
                             gitShow(data)
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
                    iframe.style.display = "";
				    eXide.app.showResultsPanel();

                    iframe.contentWindow.document.open('text/html', 'replace');
                    iframe.contentWindow.document.write("<html><body><p>Searching ...</p></body></html>");
                    iframe.contentWindow.document.close();

                    iframe.src = "modules/search.xq?" + searchParams;
                });
            });
        },

        liveReload: function() {
            var doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), function(project) {
                if (project == null) {
                    return;
                }
                console.log("live reload: %s %s", project.liveReload, project.abbrev);
                if (project.liveReload) {
                    var url = project.url.replace(/\/{2,}/, "/");
                    var link = eXide.configuration.context + url + "/";
                    project.win = window.open(link, project.abbrev);
                    if (project.win && !project.win.closed) {
                        project.win.location.reload();
                    } else {
                        console.log("app window not found: %s", project.abbrev);
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
                document.querySelector("#menu-deploy-live span").setAttribute("class", project.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
                if (project.liveReload && (!project.win || project.win.closed)) {
                    app.openApp(true);
                }
            });
        },

		initGUI: function(menu) {
            resultPanel = "south";
            layout = new app.Layout(editor);
            layout.hide("east");

			dialogs["open-dialog"] = eXide.util.DialogManager.create(
			    document.getElementById("open-dialog"), {
                    appendTo: "#layout-container",
    				title: "Open file",
    				modal: false,
    		        height: 480,
    		        width: 640
			    }
			);
			var openDialogEl = document.getElementById("open-dialog");
			dialogs["open-dialog"].dialog.addEventListener("close", function() {});
			var origOpenDialogOpen = dialogs["open-dialog"].open;
			dialogs["open-dialog"].open = function() {
			    origOpenDialogOpen.call(dialogs["open-dialog"]);
			    dbBrowser.init();
			};

			dialogs["login-dialog"] = eXide.util.DialogManager.create(
			    document.getElementById("login-dialog"), {
                    appendTo: "#layout-container",
    				title: "Login",
    				modal: true,
    				width: 360
			    }
			);
			dialogs["login-dialog"]._onClose = null;
			dialogs["login-dialog"].dialog.addEventListener("close", function() {
			    if (dialogs["login-dialog"]._onClose) {
			        dialogs["login-dialog"]._onClose();
			        dialogs["login-dialog"]._onClose = null;
			    }
			});
			dialogs["login-dialog"].setButtons({
			    "Login": function() {
                    var user = document.querySelector("#login-form input[name=\"user\"]").value;
                    var password = document.querySelector("#login-form input[name=\"password\"]").value;
                    var formData = new URLSearchParams();
                    formData.append("user", user);
                    formData.append("password", password);
                    var durationEl = document.querySelector("#login-form input[name=\"duration\"]");
                    if (durationEl && durationEl.checked) {
                        formData.append("duration", "P14D");
                    }
					fetch("api/auth/session", {
					    method: "POST",
					    headers: {
					        "Content-Type": "application/x-www-form-urlencoded"
					    },
					    body: formData.toString()
					})
					.then(function(response) {
					    return response.json();
					})
					.then(function(data) {
					    if (!data.user) {
					        document.getElementById("login-error").textContent = "Login failed.";
					        var firstInput = document.querySelector("#login-dialog input:first-of-type");
					        if (firstInput) firstInput.focus();
					    } else {
						    app.login = data;
						    console.log("Logged in as %o. Is dba: %s", data, app.login.isAdmin);
						    dialogs["login-dialog"].close();
						    app.updateAuthStatus(app.login.user);
						    editor.focus();
					    }
					})
					.catch(function(err) {
					    document.getElementById("login-error").textContent = "Login failed. " + (err.message || "");
					    var firstInput = document.querySelector("#login-dialog input:first-of-type");
					    if (firstInput) firstInput.focus();
					});
			    },
			    "Cancel": function() {
			        dialogs["login-dialog"].close();
			        editor.focus();
			    }
			});
			var origLoginOpen = dialogs["login-dialog"].open;
			dialogs["login-dialog"].open = function() {
			    origLoginOpen.call(dialogs["login-dialog"]);
			    var loginDialogEl = document.getElementById("login-dialog");
			    var inputs = loginDialogEl.querySelectorAll("input");
			    inputs.forEach(function(input) { input.value = ""; });
			    var firstInput = loginDialogEl.querySelector("input:first-of-type");
			    if (firstInput) firstInput.focus();
			    document.getElementById("login-error").textContent = "";
			    inputs.forEach(function(input) {
			        input.addEventListener("keyup", function(e) {
			            if (e.keyCode == 13) {
			                var loginBtn = dialogs["login-dialog"].dialog.querySelector(".eXide-dialog-buttons button:first-of-type");
			                if (loginBtn) loginBtn.click();
			            }
			        });
			    });
			};

			dialogs["keyboard-help"] = eXide.util.DialogManager.create(
			    document.getElementById("keyboard-help"), {
                    appendTo: "#layout-container",
    				title: "Keyboard Shortcuts",
    				modal: false,
    				height: 400,
                    width: 350,
    				buttons: {
    					"Close": function () { dialogs["keyboard-help"].close(); }
    				}
			    }
			);
			var origKbHelpOpen = dialogs["keyboard-help"].open;
			dialogs["keyboard-help"].open = function() {
			    origKbHelpOpen.call(dialogs["keyboard-help"]);
			    eXide.edit.commands.help(document.getElementById("keyboard-help"), editor);
			};

            dialogs["about-dialog"] = eXide.util.DialogManager.create(
                document.getElementById("about-dialog"), {
                    appendTo: "#layout-container",
                    title: "About",
                    modal: false,
                    height: 300,
                    width: 450,
                    buttons: {
    				    "Close": function () { dialogs["about-dialog"].close(); }
				    }
                }
            );
            dialogs["dialog-templates"] = eXide.util.DialogManager.create(
                document.getElementById("dialog-templates"), {
                    appendTo: "#layout-container",
    			    title: "New Document",
    				modal: false,
    		        height: 280,
    		        width: 550,
                    buttons: {
				        "Cancel": function () { dialogs["dialog-templates"].close(); editor.focus(); },
                        "Create": function() {
                            var templEl = document.getElementById("dialog-templates");
                            var mode = templEl.querySelector(".type-select").value;
                            var template = templEl.querySelector(".templates select").value;
                            console.log("creating new doc with mode: %s and template: %s", mode, template);
                            editor.newDocumentFromTemplate(mode, template);
                            dialogs["dialog-templates"].close();
                            editor.focus();
                        }
                    }
                }
            );
            var origTemplOpen = dialogs["dialog-templates"].open;
            dialogs["dialog-templates"].open = function() {
                origTemplOpen.call(dialogs["dialog-templates"]);
                fetch("modules/get-template.xq", {
                    method: "POST"
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    templates = data;
                    var templatesDiv = document.querySelector("#dialog-templates .templates");
                    if (templatesDiv) templatesDiv.style.display = "none";
                    var typeSelect = document.querySelector("#dialog-templates .type-select");
                    if (typeSelect) {
                        typeSelect.value = "xquery";
                        typeSelect.dispatchEvent(new Event("change"));
                    }
                });
            };
            document.querySelector("#dialog-templates .type-select").addEventListener("change", function() {
                var templ = document.querySelector("#dialog-templates .templates");
                var templSel = templ.querySelector("select");
                var type = this.value;
                templSel.innerHTML = "";
                var mode = templates[type];
                if (mode) {
                    var options = "<option value=''>None</option>";
                    for (var i = 0; i < mode.length; i++) {
                        options += "<option value='" + mode[i].name + "'>" + mode[i].description + "</option>";
                    }
                    templSel.innerHTML = options;
                    templ.style.display = "";
                } else {
                    templ.style.display = "none";
                }
            });

			// initialize buttons and menu events
            var btnOpen = document.getElementById("open");
			btnOpen.addEventListener("click", app.openDocument);
            menu.click("#menu-file-open", app.openDocument);

            var btnClose = document.getElementById("close");
			btnClose.addEventListener("click", app.closeDocument);
			menu.click("#menu-file-close", app.closeDocument);

			menu.click("#menu-file-close-all", app.closeAll);

            var btnNew = document.getElementById("new");
			btnNew.addEventListener("click", function() {
                app.newDocumentFromTemplate();
			});

            var btnNewXquery = document.getElementById("new-xquery");
			btnNewXquery.addEventListener("click", function() {
                app.newDocument(null, "xquery");
			});
			menu.click("#menu-file-new", app.newDocumentFromTemplate);
    		menu.click("#menu-file-new-xquery", function() {
                app.newDocument(null, "xquery");
    		});

            var btnRun = document.getElementById("run");
            btnRun.disabled = true;
			btnRun.addEventListener("click", function(ev) { app.runQuery() });

            var btnLaunch = document.getElementById("launch");
			btnLaunch.addEventListener("click", function(ev) { app.runAppOrQuery() });

            var statusCursor = document.getElementById("status-cursor");
            if (statusCursor) {
                statusCursor.style.cursor = "pointer";
                statusCursor.title = "Go to Line";
                statusCursor.addEventListener("click", function() {
                    editor.gotoLine();
                });
            }

            document.getElementById("status-copy-url").addEventListener("click", function() {
                var pathEl = document.querySelector("#status .path");
                var path = pathEl ? pathEl.textContent : null;
                if (path) {
                    navigator.clipboard.writeText(path).then(function() {
                        app.showMessage("Path copied to clipboard");
                    });
                }
            });

            var btnToggleSplitPane = document.getElementById("toggle-split-pane");
            if (btnToggleSplitPane) {
                btnToggleSplitPane.addEventListener("click", function() {
                    var prefs = preferences.preferences;
                    prefs.splitPane = !prefs.splitPane;
                    var pw = document.querySelector('.panel-west');
                    if (pw) {
                        pw.classList.toggle('split-pane', prefs.splitPane);
                    }
                    btnToggleSplitPane.setAttribute('aria-pressed', prefs.splitPane ? 'true' : 'false');
                    btnToggleSplitPane.textContent = prefs.splitPane ? '\u229E' : '\u229F';
                    if (prefs.splitPane) {
                        editor.outline.toggle(true);
                        editor.directory.toggle(true);
                    } else {
                        // Restore tabbed mode: activate whichever tab is marked active
                        var tabs = document.querySelectorAll('#tabs-outline a.tab');
                        var activeIndex = 0;
                        tabs.forEach(function(t, i) { if (t.classList.contains('active')) activeIndex = i; });
                        editor.directory.toggle(activeIndex === 0);
                        editor.outline.toggle(activeIndex === 1);
                    }
                    preferences.save();
                });
            }

            var btnToggleOutline = document.getElementById("toggle-outline");
            if (btnToggleOutline) {
                btnToggleOutline.addEventListener("click", function() {
                    layout.toggle("west");
                    app.$savePanelPrefs();
                });
            }
            var btnToggleResults = document.getElementById("toggle-results");
            if (btnToggleResults) {
                btnToggleResults.addEventListener("click", function() {
                    layout.toggle(resultPanel);
                    app.$savePanelPrefs();
                });
            }

            var btnToggleMonitor = document.getElementById("toggle-monitor");
            if (btnToggleMonitor) {
                btnToggleMonitor.addEventListener("click", function() {
                    app.toggleMonitor();
                });
            }

            var btnMonitorClose = document.getElementById("monitor-close");
            if (btnMonitorClose) {
                btnMonitorClose.addEventListener("click", function() {
                    app.toggleMonitor();
                });
            }

            // delegate kill buttons in monitor
            var monRunning = document.getElementById("mon-running-body");
            if (monRunning) {
                monRunning.addEventListener("click", function(ev) {
                    var btn = ev.target.closest(".mon-kill");
                    if (btn && monitor) {
                        monitor.killQuery(btn.dataset.id);
                    }
                });
            }

            var btnDebug = document.getElementById("debug");
            if (btnDebug) btnDebug.addEventListener("click", app.startDebug);

            var btnStepOver = document.querySelector("#debug-actions #step-over");
            if (btnStepOver) btnStepOver.addEventListener("click", app.stepOver);

            var btnStepInto = document.querySelector("#debug-actions #step-into");
            if (btnStepInto) btnStepInto.addEventListener("click", app.stepInto);

            var btnStepOut = document.querySelector("#debug-actions #step-out");
            if (btnStepOut) btnStepOut.addEventListener("click", app.startDebug);

            var btnValidate = document.getElementById("validate");
			if (btnValidate) btnValidate.addEventListener("click", app.checkQuery);

            var btnSave = document.getElementById("save");
			btnSave.addEventListener("click", app.saveDocument);
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
				CM6.undo(editor.editor);
			});
			menu.click("#menu-edit-redo", function () {
				CM6.redo(editor.editor);
			});
            menu.click("#menu-edit-find", function() {
                CM6.openSearchPanel(editor.editor);
            });
            menu.click("#menu-edit-find-replace", function() {
                CM6.openSearchPanel(editor.editor);
            });
            menu.click("#menu-edit-find-files", function() {
                app.findFiles();
            });
            menu.click("#menu-edit-toggle-comment", function () {
                CM6.toggleComment(editor.editor);
            });
			menu.click("#menu-edit-preferences", function() {
                preferences.show();
			});
            menu.click("#menu-edit-format", function() {
                editor.exec("format");
            });
            menu.click("#menu-navigate-definition", function () {
                editor.exec("gotoDefinition");
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
            menu.click("#menu-view-toggle-collections", function() {
                app.toggleCollectionsPanel();
            });
            menu.click("#menu-view-toggle-results", function() {
                app.toggleResultsPanel();
            });
            menu.click("#menu-view-toggle-monitor", function() {
                app.toggleMonitor();
            });
            menu.click("#menu-view-reset", function() {
                layout.reset();
            });
            menu.click("#menu-view-reset-workspace", function() {
                if (confirm("This will clear all saved tabs, preferences, and layout state, then reload. Continue?")) {
                    app._skipSaveState = true;
                    Object.keys(localStorage).filter(function(k) { return k.startsWith("eXide."); }).forEach(function(k) { localStorage.removeItem(k); });
                    location.reload();
                }
            });
            menu.click("#menu-view-toggle-dark-mode", function() {
                document.getElementById("toggle-dark-mode").click();
            });
            menu.click("#menu-view-toggle-fullscreen", function() {
                util.requestFullScreen(document.getElementById("fullscreen"));
            });
			menu.click("#menu-deploy-run", app.runAppOrQuery);

            menu.click("#menu-help-keyboard", function (ev) {
				dialogs["keyboard-help"].open();
			});
            menu.click("#menu-help-about", function (ev) {
				dialogs["about-dialog"].open();
			});
            menu.click("#menu-help-documentation", function(ev) {
                window.open("https://github.com/eXist-db/eXide#readme");
            });
			// type popover in status bar
			(function() {
				var typeBtn = document.getElementById("status-type");
				var popover = document.getElementById("type-popover");
				var arrow = typeBtn ? typeBtn.querySelector(".status-segment-arrow") : null;
				if (typeBtn && popover) {
					typeBtn.addEventListener("click", function(ev) {
						ev.stopPropagation();
						var isOpen = popover.classList.toggle("open");
						if (arrow) arrow.innerHTML = isOpen ? "&#x25BC;" : "&#x25B2;";
					});
					popover.addEventListener("click", function(ev) {
						var item = ev.target.closest(".type-popover-item");
						if (!item) return;
						editor.setMode(item.dataset.value);
						var doc = editor.getActiveDocument();
						if (doc) app.updateStatus(doc);
						popover.classList.remove("open");
						if (arrow) arrow.innerHTML = "&#x25B2;";
					});
					document.addEventListener("click", function() {
						popover.classList.remove("open");
						if (arrow) arrow.innerHTML = "&#x25B2;";
					});
				}
			})();
			// register listener to update status bar segments
			editor.addEventListener("activate", null, function (doc) {
                app.updateStatus(doc);
                projects.findProject(doc.getBasePath(), function(app) {
                    if (app) {
                        var appEl = document.getElementById("toolbar-current-app");
                        appEl.textContent = app.abbrev;
                        var appLink = document.getElementById("toolbar-current-app-link");
                        appLink.classList.remove("unknown");
                        var appUrl = app.url ? (eXide.configuration.context + app.url.replace(/\/{2,}/, "/") + "/") : "#";
                        appLink.href = appUrl;
                        var appIcon = document.getElementById("toolbar-current-app-icon");
                        appIcon.src = eXide.configuration.context + "/apps/" + app.abbrev + "/icon.png";
                        appIcon.style.display = "";
                        appIcon.onerror = function() {
                            this.style.display = "none";
                            this.onerror = null;
                        };
                        document.getElementById("menu-deploy-active").textContent = app.abbrev;
                        document.querySelector("#menu-deploy-live span").setAttribute("class", app.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
                        // update show/hide git stuff
                        if(app.git == "true" || app.git == true) {
                            document.querySelectorAll(".current-branch").forEach(function(el) { el.style.display = ""; });
                            document.getElementById("menu-git").style.display = "";
                            // update git-status
                            eXide.app.git.branch(app);
                        } else {
                            document.querySelectorAll(".current-branch").forEach(function(el) { el.style.display = "none"; });
                            document.getElementById("menu-git").style.display = "none";
                        }

                    } else {
                        var appEl2 = document.getElementById("toolbar-current-app");
                        appEl2.textContent = "unknown";
                        var appLink2 = document.getElementById("toolbar-current-app-link");
                        appLink2.classList.add("unknown");
                        appLink2.removeAttribute("href");
                        var appIcon2 = document.getElementById("toolbar-current-app-icon");
                        appIcon2.style.display = "none";
                        document.getElementById("menu-deploy-active").textContent = "unknown";
                        document.querySelectorAll(".current-branch").forEach(function(el) { el.style.display = "none"; });
                        document.getElementById("menu-git").style.display = "none";
                    }
                });
			});


			document.getElementById("user").addEventListener("click", function (ev) {
				ev.preventDefault();
				if (app.login) {
					// logout
					fetch("api/auth/session?logout=true", { method: "DELETE" });
					app.updateAuthStatus(null);
					app.login = null;
				} else {
					dialogs["login-dialog"].open();
				}
			});
            if (!util.supportsFullScreen()) {
                document.getElementById("toggle-fullscreen").style.display = "none";
            }
            document.getElementById("toggle-fullscreen").addEventListener("click", function(ev) {
                ev.preventDefault();
                util.requestFullScreen(document.getElementById("fullscreen"));
            });
            document.getElementById("toggle-dark-mode").addEventListener("click", function(ev) {
                ev.preventDefault();
                // Toggle between light/dark for the current session only (does not save to preferences)
                var isDark = document.body.classList.contains("dark");
                var newTheme = isDark ? "light" : "dark";
                app.setTheme({ isDark: newTheme === "dark" });
                app.updateDarkModeIcon(newTheme);
            });
            document.querySelectorAll('.navbar .toggle-btn[id$="-btn"]').forEach(function(btn) {
                btn.addEventListener("click", function(e) {
                    e.preventDefault();
                    var cb = btn.querySelector('input[type="checkbox"]');
                    var checked = !cb.checked;
                    cb.checked = checked;
                    btn.classList.toggle('active', checked);
                });
            });

			document.querySelectorAll('.results-container #copy-all-clipboard').forEach(function(btnEl) {
			    btnEl.addEventListener("click", function(e) {
                    e.preventDefault();
                    var icon = btnEl.querySelector('.fa');
                    var res = '';
                    document.querySelectorAll("#results-body > div > div > div > div.item").forEach(function (item) { res += item.innerText; });
                    navigator.clipboard.writeText(res).then(function() {
                        icon.classList.remove('fa-clipboard');
                        icon.classList.add('fa-check');
                        btnEl.classList.add('copied');
                        eXide.util.message("Copied results to clipboard");
                        setTimeout(function () {
                            icon.classList.remove('fa-check');
                            icon.classList.add('fa-clipboard');
                            btnEl.classList.remove('copied');
                        }, 1200);
                    }, function(err) {
                        console.error('Could not copy text: ', err);
                    });
                });
			});
			document.querySelectorAll('.results-container .next').forEach(function(el) { el.addEventListener("click", app.browseNext); });
			document.querySelectorAll('.results-container .previous').forEach(function(el) { el.addEventListener("click", app.browsePrevious); });
			document.querySelectorAll('.results-container .first-page').forEach(function(el) { el.addEventListener("click", app.browseFirst); });
			document.querySelectorAll('.results-container .last-page').forEach(function(el) { el.addEventListener("click", app.browseLast); });

            function scrollToResult(idx) {
                var items = document.querySelectorAll('.results-container .results > .even, .results-container .results > .uneven');
                if (items.length === 0) return;
                idx = Math.max(0, Math.min(idx, items.length - 1));
                activeResultIdx = idx;
                items.forEach(function(el) { el.classList.remove('result-active'); });
                var target = items[idx];
                target.classList.add('result-active');
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            document.querySelectorAll('.results-container .result-prev').forEach(function(el) {
                el.addEventListener("click", function(e) {
                    e.preventDefault();
                    scrollToResult(activeResultIdx <= 0 ? 0 : activeResultIdx - 1);
                });
            });
            document.querySelectorAll('.results-container .result-next').forEach(function(el) {
                el.addEventListener("click", function(e) {
                    e.preventDefault();
                    scrollToResult(activeResultIdx < 0 ? 1 : activeResultIdx + 1);
                });
            });
            document.getElementById("number-of-results").addEventListener("change", function(ev) {
                numberOfResults = +document.getElementById("number-of-results").value;
            });
            document.getElementById("serialization-mode").addEventListener("change", function(ev) {
                if (lastQuery) {
                    app.runQuery(lastQuery);
                }
            });
            document.getElementById("error-status").addEventListener("mouseover", function(ev) {
                var error = this;
                var extBar = document.getElementById("ext-status-bar");
                if (extBar) {
                    extBar.innerHTML = error.innerHTML;
                    extBar.style.display = "block";
                }
            });
            var errorStatus = document.getElementById("error-status");
            var extStatusBar = document.getElementById("ext-status-bar");
            if (extStatusBar) {
                extStatusBar.addEventListener("mouseout", function(ev) {
                    extStatusBar.style.display = "none";
                });
            }
            if (errorStatus) {
                errorStatus.addEventListener("mouseout", function(ev) {
                    if (extStatusBar) extStatusBar.style.display = "none";
                });
            }
            window.addEventListener("blur", function() {
                hasFocus = false;
            });
            window.addEventListener("focus", function() {
                var checkLogin = !hasFocus;
                hasFocus = true;
                if (checkLogin) {
                   app.getLogin();
                }
            });

            dialogs["dialog-startup"] = eXide.util.DialogManager.create(
                document.getElementById("dialog-startup"), {
                    appendTo: "#layout-container",
        		    modal: false,
                    title: "Quick Start",
                    width: 400,
                    height: 300,
    			    buttons: {
                        "OK" : function() { dialogs["dialog-startup"].close(); }
    			    }
    		    }
    		);
            if (!util.supportsHtml5Storage)
    		    return;
            var showHints = localStorage.getItem("eXide.firstTime");
            if (!showHints || showHints == 1) {
                dialogs["dialog-startup"].open();
            }
		}
	};

	return app;
}(eXide.util));
