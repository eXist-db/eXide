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

import { eXide } from "./namespace.js";
import { commands } from "./commands.js";
import { PackageEditor, Projects } from "./deployment.js";
import { DialogManager } from "./dialog-utils.js";
import { DnD } from "./dnd.js";
import { editorUtils } from "./editor-utils.js";
import { Editor } from "./editor.js";
import { Files } from "./find.js";
import { Menubar } from "./menu.js";
import { Monitor } from "./monitor.js";
import { Preferences } from "./preferences.js";
import { Browser } from "./resources.js";
import { staticAnalysis } from "./static-analysis.js";
import { Dialog, mimeTypes, util } from "./util.js";
import { ws } from "./ws-transport.js";

function apiPath(dbPath) {
	return `api/storage/${dbPath.replace(/^\//, "").split("/").map(encodeURIComponent).join("/")}`;
}

// main entry point
document.addEventListener("DOMContentLoaded", () => {
    window.name = "eXide";

    // parse query parameters passed in by URL:
    const qs = (function(a) {
        if (a === "") return {};
        const b = {};
        for (let i = 0; i < a.length; ++i)
        {
            const p=a[i].split('=');
            if (p.length !== 2) continue;
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
        }
        return b;
    })(window.location.search.substr(1).split('&'));

    // check parameters passed in GET request
    eXide.app.init((restored) => {
        const openDoc = qs["open"];
        const snippet = qs["snip"];
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

/**
 * Static class for the main application. Controls the GUI.
 */
export const app = (function(util) {

	let editor;

    let layout;
	let deploymentEditor;
	let dbBrowser;
    let projects;
	let preferences;
    let templates = {};
    let menu;
    let lastQuery = null;
	let hitCount = 0;
	let startOffset = 0;
	let currentOffset = 0;
	let endOffset = 0;
    let numberOfResults = 10;
    let activeResultIdx = -1;

    const allowDnd = true;

    // used to detect when window looses focus
    let hasFocus = true;

    let resultPanel = "south";

    let monitor = null;

    const dialogs = {};

    /**
     * Apply CM6 syntax highlighting to a result content element.
     * Detects the language from the serialization mode and uses
     * highlightTree to produce highlighted spans.
     */
    function highlightResultContent(contentEl) {
        if (!CM6.highlightTree) return;
        const text = contentEl.textContent;
        if (!text || text.length === 0) return;

        const serializationMode = document.getElementById("serialization-mode").value;
        let langSupport;
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
                } else if (/^\s*[[{]/.test(text)) {
                    langSupport = CM6.json();
                } else {
                    return; // plain text, no highlighting
                }
        }
        const lang = langSupport.language;
        const tree = lang.parser.parse(text);
        const parts = [];
        let pos = 0;
        CM6.highlightTree(tree, CM6.classHighlighter, (from, to, classes) => {
            if (from > pos) {
                parts.push(document.createTextNode(text.slice(pos, from)));
            }
            const span = document.createElement("span");
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
            for (let i = 0; i < parts.length; i++) {
                contentEl.appendChild(parts[i]);
            }
        }
    }

    const webResources = {
        "html": 1,
        "javascript": 1,
        "css": 1,
        "less": 1
    };

	const app = {

		init(afterInitCallback) {
		    if (!("flex" in document.documentElement.style)) {
		        document.getElementById("startup-error").style.display = "";
		        return;
            }

            projects = new Projects();
            menu = new Menubar(document.querySelector(".menu"));
			editor = new Editor(document.getElementById("editor"), menu);
			deploymentEditor = new PackageEditor(projects);

			dbBrowser = new Browser(document.getElementById("open-dialog"));


			preferences = new Preferences(editor);

            editor.addEventListener("setTheme", app.setTheme);

            app.initGUI(menu);

			const dnd = new DnD("body");
			dnd.addEventListener("drop", app.dropFile);

            // save restored paths for later
            app.getLogin(() => {
                app.initStatus("Restoring state");
                app.restoreState((restored) => {
                    app.updateLayoutTop();
                    editor.init();

                    // Connect WebSocket for real-time LSP and monitoring
                    if (typeof ws !== "undefined" && ws.autoConnect) {
                        ws.autoConnect();

                        // Listen for pushed diagnostics from the server
                        ws.on("textDocument/publishDiagnostics", (data) => {
                            if (!data || !data.uri) return;
                            const doc = editor.getDocument(data.uri);
                            if (!doc) return;
                            const diagnostics = data.diagnostics;
                            if (!diagnostics || !Array.isArray(diagnostics) || diagnostics.length === 0) {
                                // Clear errors for this document
                                if (doc === editor.getActiveDocument()) {
                                    editor.updateStatus("");
                                    editor.clearErrors();
                                }
                                return;
                            }
                            // Apply first error to the active document
                            if (doc === editor.getActiveDocument()) {
                                const err = diagnostics[0];
                                if (err && err.message) {
                                    editor.updateStatus(err.message, `${doc.getPath()}#${err.line}`);
                                }
                            }
                        });
                    }

                    // Streaming-query WebSocket (eXide.wsEval / /ws/eval) is scaffolded
                    // for a future eXist-db feature that isn't yet released. AutoConnect
                    // is intentionally disabled here: with the endpoint missing on
                    // current eXist builds, browsers (most visibly Safari/WebKit; see
                    // PR #794 review) would loop open→close→reconnect indefinitely
                    // because the server accepts the WS upgrade and then immediately
                    // drops the connection. Re-enable once eXist-core's
                    // feature/websocket-eval branch lands and the endpoint is stable.
                    // if (typeof eXide.wsEval !== "undefined" && eXide.wsEval.autoConnect) {
                    //     eXide.wsEval.autoConnect();
                    // }

                    // Fetch registered module prefixes for static analysis
                    app.refreshModuleCache();

                    if (afterInitCallback) {
                        afterInitCallback(restored);
                    }
                    if (window._splashTimer) clearTimeout(window._splashTimer);
                    if (eXide.configuration.allowGuest) {
                        document.getElementById("splash").style.display = "none";
                    } else {
                        app.requireLogin(() => {
                            document.getElementById("splash").style.display = "none";
                        });
                    }
                });
            });

		    editor.addEventListener("outlineChange", app.onOutlineChange);
            editor.validator.addEventListener("documentValid", (doc) => {
                if (doc.isXQuery() && document.getElementById("live-preview").checked) {
                    app.runQuery(doc.getPath(), true);
                }
            });
            editor.addEventListener("saved", (doc) => {
                if (document.getElementById("live-preview").checked && webResources[doc.getSyntax()]) {
                    document.getElementById("results-iframe").contentDocument.location.reload(true);
                }
            });

			window.addEventListener("resize", () => {
			    app.updateLayoutTop();
			    app.resize();
			});

			window.addEventListener("unload", () => {
				app.saveState();
			});
		},

        version() {
            return document.getElementById("eXide-version").textContent;
        },

        hasFocus() {
            return hasFocus;
        },

        getEditor() {
            return editor;
        },

        getMenu() {
            return menu;
        },

        async refreshModuleCache() {
            try {
                const r = await fetch("api/editor/modules");
                const modules = await r.json();
                if (Array.isArray(modules) && typeof staticAnalysis !== "undefined") {
                    staticAnalysis.setRegisteredModules(modules);
                }
            } catch { /* ignore */ }
        },

		updateAuthStatus(user) {
		    const el = document.getElementById("user");
		    if (user) {
		        el.innerHTML = `<span class="auth-dot auth-dot-ok"></span>${user}`;
		        el.title = "Click to logout";
		    } else {
		        el.textContent = "Login";
		        el.title = "Click to login";
		    }
		    // Start/stop monitor based on auth and panel visibility
		    const eastEl = document.querySelector(".panel-east");
		    const eastVisible = eastEl && eastEl.style.display !== "none";
		    if (app.login && app.login.isAdmin && eastVisible) {
		        if (!monitor) {
		            monitor = new Monitor();
		            monitor.init();
		        }
		        monitor.start();
		    } else if (monitor) {
		        monitor.stop();
		    }
		},

		toggleMonitor() {
		    if (!monitor) {
		        monitor = new Monitor();
		        monitor.init();
		    }
		    layout.toggle("east");
		    const eastEl = document.querySelector(".panel-east");
		    const isVisible = eastEl && eastEl.style.display !== "none";
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

		updateLayoutTop() {
		    const toolbarBtns = document.querySelector(".toolbar-buttons");
		    const layoutH = document.querySelector(".layout-horizontal");
		    if (toolbarBtns && layoutH) {
		        const fullscreen = document.getElementById("fullscreen");
		        const top = toolbarBtns.getBoundingClientRect().bottom -
		                  fullscreen.getBoundingClientRect().top + 2;
		        layoutH.style.top = `${top}px`;
		    }
		},

		resize(resizeIframe) {
            if (resizeIframe) {
                const resultsContainer = document.querySelector(`.panel-${resultPanel}`);
                const resultsBody = document.getElementById("results-body");
                const navbarEl = resultsContainer.querySelector(".navbar");
                const navbarHeight = navbarEl ? navbarEl.offsetHeight : 0;
                document.getElementById("results-iframe").style.width = `${resultsBody.clientWidth}px`;
                document.getElementById("results-iframe").style.height = `${resultsContainer.clientHeight - navbarHeight - 8}px`;
                resultsBody.style.height = `${resultsContainer.clientHeight - navbarHeight - 8}px`;
            }
			editor.resize();
		},

        beforeResize() {
            if (document.getElementById("serialization-mode").value === "html") {
                document.getElementById("results-iframe").style.display = "none";
            }
        },

        afterResize() {
            editor.resize();
            if (document.getElementById("serialization-mode").value === "html") {
                document.getElementById("results-iframe").style.display = "";
            }
        },

		newDocument(data, type) {
			editor.newDocument(data, type);
		},

        newDocumentFromTemplate() {
            dialogs["dialog-templates"].open();
        },

        dropFile(files) {
            if (!allowDnd) {
                return;
            }
            if (typeof FileReader !== "undefined") {
                const reader = new FileReader();
                for (let i = 0; i < files.length; i++) {
                    const mime = mimeTypes.getLangFromMime(files[i].type) || "xquery";
                    reader.onloadend = function(e) {
                        app.newDocument(this.result, mime);
                    };
                    reader.readAsText(files[i]);
                }
            } else {
                util.message("Your browser does not support drag and drop of files.");
            }
        },

		findDocument(path, line) {
			const doc = editor.getDocument(path);
			if (doc == null) {
				const resource = {
						name: path.match(/[^/]+$/)[0],
						path
				};
				app.$doOpenDocument(resource, () => {
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

		locate(type, path, symbol) {
			if (path == null) {
				editor.exec("locate", type, symbol);
			} else {
				const doc = editor.getDocument(path);
				if (doc == null) {
					const resource = {
							name: path.match(/[^/]+$/)[0],
							path
					};
					app.$doOpenDocument(resource, (doc) => {
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

		openDocument() {
			dbBrowser.reload(["reload"], "open");
			dialogs["open-dialog"].setTitle("Open Document");
			dialogs["open-dialog"].setButtons({
			    "Cancel"() { dialogs["open-dialog"].close(); editor.focus(); },
			    "Open"(){ app.openSelectedDocument(null, true);}
			});
			dialogs["open-dialog"].open();
		},

		openSelectedDocument(doc, close) {
			const resource = doc || dbBrowser.getSelection();
			if (resource) {
				app.$doOpenDocument(resource);
			}
			if (close ?? true)
				dialogs["open-dialog"].close();
		},

        downloadSelectedResources(resources, close) {
			if (resources) {
                resources.forEach(resource => {
                    app.download(resource.key);
                })
			}else {
                Dialog.warning("Invalid selection","The Download Selected command requires that resources be selected. Please select resources for download.")
            }
			if (close ?? true)
				dialogs["open-dialog"].close();
		},

		async $doOpenDocument(resource, callback, reload, forceText) {
			resource.path = util.normalizePath(resource.path);
            const indentOnOpen = document.getElementById("indent-on-open").checked;
            const expandXIncludesOnOpen = document.getElementById("expand-xincludes-on-open").checked;
            const omitXMLDeclatarionOnOpen = document.getElementById("omit-xml-decl-on-open").checked;
            const doc = editor.getDocument(resource.path);
            if (doc && !reload) {
                editor.switchTo(doc);
                if (callback) {
                    callback(resource);
                }
                return true;
            }
			const params = new URLSearchParams({
			    "indent": indentOnOpen,
			    "expand-xincludes": expandXIncludesOnOpen,
			    "omit-xml-decl": omitXMLDeclatarionOnOpen
			});
			try {
			    const response = await fetch(`${apiPath(resource.path)}?${params.toString()}`);
			    if (!response.ok) {
			        throw { status: response.status, statusText: response.statusText };
			    }
			    const data = await response.json();
			    const baseMime = data.mime || "";
			    const externalPath = data.externalPath;
			    // Show binary files in a preview overlay
			    if (!reload && !forceText && data.binary &&
			        /^image\/|^audio\/|^video\/|^application\/pdf|^application\/octet-stream|^application\/zip/.test(baseMime)) {
			        const fileUrl = externalPath || (`rest${resource.path}`);
			        const fileName = resource.name || resource.path.replace(/^.*\//, "");
			        app.$showBinaryPreview(fileUrl, fileName, baseMime, resource, callback);
			        if (callback) { callback(null); }
			        return true;
			    }
			    const content = data.content || "";
			    if (reload) {
			        editor.reload(content);
			    } else {
			        const mime = forceText ? "text/text" : mimeTypes.getMime(baseMime);
			        editor.openDocument(content, mime, resource, externalPath);
			    }
			    if (callback) {
			        callback(resource);
			    }
			    return true;
			} catch (err) {
			    util.error(`Failed to load document ${encodeURI(resource.path)}: ${err.status || ""} ${err.statusText || err.message || ""}`);
			    if (callback) {
			        callback(null);
			    }
			    return false;
			}
		},

		$showBinaryPreview(fileUrl, fileName, mime, resource, callback) {
		    // Remove existing overlay
		    const existing = document.getElementById("binary-preview-overlay");
		    if (existing) existing.remove();

		    const overlay = document.createElement("div");
		    overlay.id = "binary-preview-overlay";
		    overlay.className = "binary-preview-overlay";

		    const panel = document.createElement("div");
		    panel.className = "binary-preview-panel";

		    // Header
		    const header = document.createElement("div");
		    header.className = "binary-preview-header";
		    const title = document.createElement("span");
		    title.className = "binary-preview-title";
		    title.textContent = fileName;
		    title.title = fileName;
		    header.appendChild(title);
		    const closeBtn = document.createElement("button");
		    closeBtn.className = "binary-preview-close";
		    closeBtn.textContent = "\u2715";
		    closeBtn.title = "Close";
		    header.appendChild(closeBtn);
		    panel.appendChild(header);

		    // Content
		    const content = document.createElement("div");
		    content.className = "binary-preview-content";
		    if (/^image\//.test(mime)) {
		        const img = document.createElement("img");
		        img.src = fileUrl;
		        img.alt = fileName;
		        content.appendChild(img);
		    } else if (mime === "application/pdf") {
		        const embed = document.createElement("embed");
		        embed.src = fileUrl;
		        embed.type = "application/pdf";
		        embed.style.width = "100%";
		        embed.style.height = "100%";
		        content.appendChild(embed);
		    } else if (/^audio\//.test(mime)) {
		        const audio = document.createElement("audio");
		        audio.src = fileUrl;
		        audio.controls = true;
		        content.appendChild(audio);
		    } else if (/^video\//.test(mime)) {
		        const video = document.createElement("video");
		        video.src = fileUrl;
		        video.controls = true;
		        video.style.maxWidth = "100%";
		        video.style.maxHeight = "100%";
		        content.appendChild(video);
		    } else {
		        const msg = document.createElement("div");
		        msg.className = "binary-preview-nopreview";
		        msg.innerHTML = `<i class="fa fa-file-o" style="font-size:48px;margin-bottom:12px;display:block"></i>No preview available<br><small>${mime}</small>`;
		        content.appendChild(msg);
		    }
		    panel.appendChild(content);

		    // Footer
		    const footer = document.createElement("div");
		    footer.className = "binary-preview-footer";
		    const openBtn = document.createElement("button");
		    openBtn.textContent = "Open in New Tab";
		    openBtn.addEventListener("click", () => {
		        window.open(fileUrl, fileName);
		    });
		    const dlBtn = document.createElement("button");
		    dlBtn.textContent = "Download";
		    dlBtn.addEventListener("click", () => {
		        const a = document.createElement("a");
		        a.href = fileUrl;
		        a.download = fileName;
		        a.click();
		    });
		    const openTextBtn = document.createElement("button");
		    openTextBtn.textContent = "Open Anyway";
		    openTextBtn.title = "Open as plain text in the editor";
		    openTextBtn.addEventListener("click", () => {
		        close();
		        app.$doOpenDocument(resource, callback, false, true);
		    });
		    const cancelBtn = document.createElement("button");
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
		    overlay.addEventListener("click", (e) => {
		        if (e.target === overlay) close();
		    });
		    document.addEventListener("keydown", function onKey(e) {
		        if (e.key === "Escape") {
		            close();
		            document.removeEventListener("keydown", onKey);
		        }
		    });
		},

        reloadDocument() {
            const doc = editor.getActiveDocument();
            if (doc.isSaved()) {
                app.$reloadDocument(doc);
            } else {
                Dialog.input("Reload Document", "Do you really want to reload the document?", () => {
                    app.$reloadDocument(doc);
                }, { action: "Reload" });
            }
        },

        $reloadDocument(doc) {
            const resource = {
                name: doc.getName(),
                path: doc.getPath()
            };
            app.$doOpenDocument(resource, null, true);
        },

		closeDocument() {
			if (!editor.getActiveDocument().isSaved()) {
				if (!dialogs["dialog-confirm-close"]) {
				    dialogs["dialog-confirm-close"] = DialogManager.create(
				        document.getElementById("dialog-confirm-close"), {
				            appendTo: "#layout-container",
				            title: "Close Document",
				            modal: true,
				            width: 420,
				            buttons: {
				                "Close Without Saving": {
				                    separate: true,
				                    click() {
				                        dialogs["dialog-confirm-close"].close();
				                        editor.closeDocument();
				                    }
				                },
				                "Cancel"() {
				                    dialogs["dialog-confirm-close"].close();
				                },
				                "Save"() {
				                    dialogs["dialog-confirm-close"].close();
				                    app.saveDocument(() => {
				                        editor.closeDocument();
				                    });
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

        closeAll() {
            editor.forEachDocument((doc) => {
                if (doc.isSaved()) {
                    editor.closeDocument(doc);
                } else {
                    util.message(`Not closing unsaved document ${doc.getName()}`);
                }
            });
        },

		/**
		 * @param onSaved optional function, called once the document was stored.
		 *   (Also used as a click handler, so anything but a function is ignored.)
		 */
		saveDocument(onSaved) {
            const afterSave = typeof onSaved === "function" ? onSaved : function() {};
            app.requireLogin(() => {
                if (editor.getActiveDocument().getPath().match('^__new__')) {
                    dbBrowser.changeToCollection("/db");
        			dbBrowser.reload(["reload", "create"], "save");
    				dialogs["open-dialog"].setTitle("Save Document");
    				dialogs["open-dialog"].setButtons({
    					"Cancel"() {
                            dialogs["open-dialog"].close();
        				},
    					"Save"() {
                            if(editor.getActiveDocument().isXQuery() && !/([^\s\\])*\.xq.?/.test(dbBrowser.getSelection().name)) {
                                Dialog.warning("Failed to Save Document", "Your current file is an XQuery file, but you are trying to save it with a non-XQuery file extension (.xq, .xqm etc).  If you intended this to be another file type such as XML, copy and paste the content into a New file created using the \u201cNew\u201d button.");
                                return;
                            }

    						editor.saveDocument(dbBrowser.getSelection(), function () {
    							dialogs["open-dialog"].close();
                                deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                                app.updateStatus(this);
								app.syncDirectory(this.getBasePath())
                                app.liveReload();
                                afterSave();
    						}, (msg) => {
    							Dialog.warning("Failed to Save Document", msg);
    						});
    					}
    				});
    				dialogs["open-dialog"].open();
					const nameInput = document.querySelector("#open-dialog input[name='resource']");
					if (nameInput) nameInput.focus();
    			} else {
    				editor.saveDocument(null, () => {
    					util.message(`${editor.getActiveDocument().getName()} stored.`);
                        deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                        app.liveReload();
                        afterSave();
    				}, (msg) => {
    					Dialog.warning("Failed to Save Document", msg);
    				});
    			}
            });
		},

        saveDocumentAs() {
            app.requireLogin(() => {
                if (editor.getActiveDocument().getPath().match('^__new__')) {
                    dbBrowser.changeToCollection("/db");
                }else {
                    dbBrowser.changeToCollection(editor.getActiveDocument().getBasePath());
                }
                dbBrowser.reload(["reload", "create"], "save");
    			dialogs["open-dialog"].setTitle("Save As\u2026");
    			dialogs["open-dialog"].setButtons({
    				"Cancel"() {
                        dialogs["open-dialog"].close();
    				},
    				"Save"() {
                         if(editor.getActiveDocument().isXQuery() && !/([^\s\\])*\.xq.?/.test(dbBrowser.getSelection().name)) {
                            Dialog.warning("Failed to Save Document", "Your current file is an XQuery file, but you are trying to save it with a non-XQuery file extension (.xq, .xqm etc).  If you intended this to be another file type such as XML, copy and paste the content into a New file created using the \u201cNew\u201d button.");
                            return;
                        }

    					editor.saveDocument(dbBrowser.getSelection(), function () {
    						dialogs["open-dialog"].close();
                            deploymentEditor.autoSync(editor.getActiveDocument().getBasePath());
                            app.updateStatus(this);
							app.syncDirectory(this.getBasePath())
                            app.liveReload();
    					}, (msg) => {
    						Dialog.warning("Failed to Save Document", msg);
    					});
    				}
    			});
    			dialogs["open-dialog"].open();
				const nameInput = document.querySelector("#open-dialog input[name='resource']");
				if (nameInput) nameInput.focus();
            });
        },

        exec() {
            editor.exec(arguments);
        },

        async download(path) {
            const indentOnDownload = document.getElementById("indent-on-download").checked;
            const expandXIncludesOnDownload = document.getElementById("expand-xincludes-on-download").checked;
            const omitXMLDeclatarionOnDownload = document.getElementById("omit-xml-decl-on-download").checked;
			const doc = editor.getActiveDocument();
			if (!path && (doc.getPath().match("^__new__") || !doc.isSaved())) {
				util.error("There are unsaved changes in the document. Please save it first.");
				return;
			}
            path = path || doc.getPath();
            const dlParams = new URLSearchParams({
                "download": "true",
                "indent": indentOnDownload,
                "expand-xincludes": expandXIncludesOnDownload,
                "omit-xml-decl": omitXMLDeclatarionOnDownload
            });
            const url = `${apiPath(path)}?${dlParams.toString()}`;
            const resp = await fetch(url);
            const blob = await resp.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = decodeURI(path.split("/").slice(-1)[0]);;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
		},

		runQuery(path, livePreview) {
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
                case "html": {
                    showResultsPanel();
                    const iframe = document.getElementById("results-iframe");
                    iframe.style.display = "";
                    if (path) {
                        iframe.src = editor.getActiveDocument().getExternalLink();
                    } else {
                        iframe.contentDocument.documentElement.innerHTML = editor.getText();
                    }
                    document.getElementById("serialization-mode").setAttribute("disabled", "disabled");
                    document.getElementById("serialization-mode").value = "html";
                    break;
                }
                case "javascript": {
                    showResultsPanel();
                    const iframe = document.getElementById("results-iframe");
                    iframe.style.display = "";
                    let code = editor.getText();
                    code = `<script type="text/javascript">${code}</script>`;
                    iframe.contentDocument.documentElement.innerHTML = code;
                    document.getElementById("serialization-mode").setAttribute("disabled", "disabled");
                    document.getElementById("serialization-mode").value = "html";
                    break;
                }
                default: {
                    let code = editor.getText();
                    if (path) {
                        const doc = editor.getDocument(path);
                        if (doc) {
                            code = doc.getText();
                        } else {
                            return;
                        }
                    } else {
                        lastQuery = editor.getActiveDocument().getPath();
                    }
        			util.message("Running query ...");

                    document.getElementById("serialization-mode").removeAttribute("disabled");
                    const serializationMode = document.getElementById("serialization-mode").value;
                    // Unsaved buffers (path "__new__N") have no real collection. Send "." so
                    // the server treats it as "no location" rather than a malformed xmldb URI
                    // (xmldb:exist://__new__1), which previously crashed module imports server-side.
                    const activeDoc = editor.getActiveDocument();
        			const moduleLoadPath = activeDoc.isNew() ? "." : `xmldb:exist://${activeDoc.getBasePath()}`;
        			document.querySelectorAll('.results-container .results').forEach((el) => { el.innerHTML = ""; });

                    app.runQueryCursor(code, moduleLoadPath, serializationMode, livePreview);
                    break;
                }
            }

		},

		/** Active cursor ID for pagination. */
		_cursorId: null,

		/** AbortController for the in-flight query request. */
		_queryAbort: null,

		/**
		 * Execute query via server-side cursor (cursor:eval → cursor:fetch).
		 *
		 * POST ../existdb-openapi/api/query → { cursor, items, elapsed, timing }
		 * GET  ../existdb-openapi/api/query/{id}/results?start=N&count=M → array of item maps
		 *
		 * Calls existdb-openapi directly (not eXide's own /api/query routes).
		 * Cookie auth works because both apps share the org.exist.login domain.
		 */
		async runQueryCursor(code, moduleLoadPath, serializationMode, livePreview) {
		    const btnCancel = document.getElementById("cancel-query");
		    const timingEl = document.getElementById("query-timing");

		    function showCancel() { if (btnCancel) btnCancel.style.display = ""; }
		    function hideCancel() { if (btnCancel) btnCancel.style.display = "none"; }

		    function hideTiming() {
		        if (timingEl) timingEl.style.display = "none";
		    }

		    // Build a display message from a query-error envelope. existdb-openapi#71
		    // returns the QueryError shape { code, message, line, column, raw };
		    // current releases (≤ v0.9.7) return a generic { error: "..." }. Prefer
		    // the concise `message`, then `error`, then the verbose `raw`; fall back
		    // to a serialized payload so the cause is never silently lost.
		    function queryErrorMessage(err, fallback) {
		        if (err == null) { return fallback || "Query failed."; }
		        if (typeof err === "string") { return err; }
		        let msg = err.message || err.error || err.raw
		            || fallback || JSON.stringify(err);
		        if (err.code) { msg = `[${err.code}] ${msg}`; }
		        if (err.line > 0) { msg = `line ${err.line}: ${msg}`; }
		        return msg;
		    }

		    // Close previous cursor if any
		    if (app._cursorId) {
		        fetch(`../existdb-openapi/api/query/${app._cursorId}`, { method: "DELETE" }).catch(() => {});
		        app._cursorId = null;
		    }

		    // Abort any in-flight query
		    if (app._queryAbort) {
		        app._queryAbort.abort();
		    }

		    const abortController = new AbortController();
		    app._queryAbort = abortController;

		    showCancel();
		    hideTiming();

		    try {
		        const response = await fetch("../existdb-openapi/api/query", {
		            method: "POST",
		            headers: { "Content-Type": "application/json" },
		            body: JSON.stringify({ query: code, "module-load-path": moduleLoadPath }),
		            signal: abortController.signal
		        });
		        app._queryAbort = null;
		        hideCancel();
		        if (!response.ok) {
		            let err;
		            try {
		                err = await response.json();
		            } catch {
		                // Body wasn't JSON — try to surface whatever the
		                // server actually said (HTTP status + body text).
		                try {
		                    const text = await response.text();
		                    const msg = `HTTP ${response.status}: ${text ? text.slice(0, 500) : response.statusText}`;
		                    editor.evalError(msg, !livePreview);
		                } catch {
		                    editor.evalError(`HTTP ${response.status} ${response.statusText}`, !livePreview);
		                }
		                return;
		            }
		            // Pass the full structured error so the panel can surface
		            // code/location/message/raw separately (request from
		            // @line-o on PR #794: the message alone isn't enough —
		            // need all the info).
		            editor.evalError(queryErrorMessage(err), !livePreview, err);
		            return;
		        }
		        const data = await response.json();
		        // Defend against a query error reported in a 200 body rather
		        // than an error status — e.g. existdb-openapi before
		        // eXist-db/existdb-openapi#46 returned a compile error as
		        // HTTP 200 { error: ... } (eXist-db/eXide#828). Without this the
		        // error is swallowed: data.cursor/items are undefined and the
		        // success path shows neither results nor an error. Coalesce the
		        // shapes the same way the !response.ok branch does.
		        if (data.error || !data.cursor) {
		            editor.evalError(
		                queryErrorMessage(data, "Query failed: no cursor returned."),
		                !livePreview, data);
		            return;
		        }
		        app._cursorId = data.cursor;
		        hitCount = data.items;
		        endOffset = Math.min(numberOfResults, hitCount);

		        editor.updateStatus("");
		        editor.clearErrors();
		        app.showResultsPanel();
		        document.getElementById("results-iframe").style.display = "none";
		        startOffset = 1;
		        currentOffset = 1;
		        activeResultIdx = -1;

		        const elapsed = (data.elapsed / 1000).toFixed(3);
		        util.message(`Query returned ${hitCount.toLocaleString()} item(s) in ${elapsed}s`);

		        // Show timing breakdown
		        if (timingEl) {
		            const t = data.timing;
		            if (t) {
		                timingEl.innerHTML =
		                    `<span><span class="timing-label">Compile:</span> ${t.compile}ms</span>` +
		                    `<span><span class="timing-label">Eval:</span> ${t.evaluate.toLocaleString()}ms</span>` +
		                    `<span><span class="timing-label">Total:</span> ${t.total.toLocaleString()}ms</span>` +
		                    `<span><span class="timing-label">Items:</span> ${hitCount.toLocaleString()}</span>`;
		            } else {
		                timingEl.innerHTML =
		                    `<span><span class="timing-label">Elapsed:</span> ${data.elapsed}ms</span>` +
		                    `<span><span class="timing-label">Items:</span> ${hitCount.toLocaleString()}</span>`;
		            }
		            timingEl.style.display = "";
		        }

		        // Fetch first page
		        app.fetchCursorPage(startOffset, endOffset);
		    } catch (err) {
		        app._queryAbort = null;
		        hideCancel();
		        if (err.name === "AbortError") {
		            util.message("Query cancelled.");
		            return;
		        }
		        // Connection drops from a server-side kill (via the Monitor
		        // panel's kill button, or another admin tool) surface as
		        // generic network errors — TypeError "Failed to fetch"
		        // (Chrome/Firefox) or "Load failed" (Safari). Treat these as
		        // cancellations rather than as "Server Error" toasts, since
		        // they reflect intentional admin actions, not server bugs.
		        if (err.name === "TypeError" || /Failed to fetch|Load failed|NetworkError/i.test(String(err.message || err))) {
		            util.message("Query cancelled.");
		            return;
		        }
		        util.error(err.message || String(err), "Server Error");
		    }
		},

		/**
		 * Fetch a page of results from the server-side cursor.
		 * Each item includes value, type, documentURI, and nodeId.
		 * Passes current serialization settings from the results toolbar.
		 */
		async fetchCursorPage(start, end) {
		    if (!app._cursorId) return;

		    const count = end - start + 1;
		    const serializationMode = document.getElementById("serialization-mode").value;
		    const indent = document.getElementById("indent-results").checked ? "yes" : "no";
		    const autoExpand = document.getElementById("auto-expand-matches").checked ? "both" : "no";
		    const params = new URLSearchParams({
		        start,
		        count,
		        method: serializationMode,
		        indent,
		        "highlight-matches": autoExpand
		    });

		    try {
		        const response = await fetch(`../existdb-openapi/api/query/${app._cursorId}/results?${params.toString()}`);
		        if (!response.ok) throw new Error("Cursor expired");
		        const data = await response.json();
		        const resultsDiv = document.querySelector('.results-container .results');
		        if (!resultsDiv) return;
		        resultsDiv.innerHTML = "";

		        const items = data; // existdb-openapi returns a plain array
		        if (!items || items.length === 0) return;

		        const numWidth = Math.ceil(Math.log(hitCount + 1) / Math.LN10);
		        for (let i = 0; i < items.length; i++) {
		            const item = items[i];
		            const idx = start + i;
		            const div = document.createElement("div");
		            div.className = (idx % 2 === 0) ? "even" : "uneven";

		            // Build badge — clickable link if documentURI is available
		            let badge;
		            if (item.documentURI) {
		                badge = `<a class="badge" href="#" data-path="${item.documentURI}" title="Click to open source document" style="width:${numWidth}ch">${idx}</a>`;
		            } else {
		                badge = `<span class="badge" style="width:${numWidth}ch">${idx}</span>`;
		            }

		            div.innerHTML =
		                `<div class="pos">${badge}</div>` +
		                `<div class="item"><i class="fa fa-clipboard copy-result" title="Copy this item to clipboard"></i>` +
		                `<div class="content" style="white-space: pre-wrap"></div></div>`;

		            const contentDiv = div.querySelector('.content');
		            contentDiv.textContent = item.value;
		            highlightResultContent(contentDiv);

		            // Document link click handler
		            const posLink = div.querySelector('.pos a');
		            if (posLink) {
		                posLink.addEventListener("click", function(e) {
		                    e.preventDefault();
		                    app.findDocument(this.dataset.path);
		                });
		            }

		            // Copy button
		            div.querySelector('.copy-result').addEventListener("click", async function() {
		                const sibling = this.parentNode.querySelector('.content');
		                const text = sibling ? sibling.textContent : "";
		                const btn = this;
		                await navigator.clipboard.writeText(text);
		                btn.classList.remove('fa-clipboard');
		                btn.classList.add('fa-check', 'copied');
		                setTimeout(() => {
		                    btn.classList.remove('fa-check', 'copied');
		                    btn.classList.add('fa-clipboard');
		                }, 1200);
		            });

		            resultsDiv.appendChild(div);
		        }

		        // Update status
		        const actualEnd = start + items.length - 1;
		        document.querySelectorAll('.results-container .current').forEach((el) => {
		            el.textContent = `Showing results ${start} to ${actualEnd} of ${hitCount}`;
		        });

		        // Update pagination state
		        startOffset = start;
		        currentOffset = actualEnd + 1;
		        endOffset = actualEnd;
		    } catch (err) {
		        util.error(`Failed to fetch results: ${err.message}`);
		    }
		},

		/** Cancel the active query. */
		cancelQuery() {
		    const code = editor.getText();
		    // Detect queries that modify state: XQUF expressions, legacy update syntax,
		    // xmldb store/remove/create, security manager changes, file system writes
		    const hasSideEffects = /\b(update|insert|delete|replace|rename)\b/i.test(code) ||
		        /\b(xmldb:(store|remove|create-collection|copy|move|rename))\b/.test(code) ||
		        /\b(sm:(chmod|chown|chgrp|add-account|remove-account))\b/.test(code) ||
		        /\b(file:(write|delete|move|mkdirs|serialize))\b/.test(code);

		    function doCancel() {
		        // 1. Abort the in-flight HTTP request (client-side only —
		        //    drops the connection but the server query continues)
		        if (app._queryAbort) {
		            app._queryAbort.abort();
		            app._queryAbort = null;
		        }
		        // 2. Try to kill the server-side query via admin endpoint.
		        //    Only admins can call this; guest users just abort the HTTP connection.
		        //    Fetch running queries and kill any that are user-submitted
		        //    (exclude eXide's own internal API queries).
		        fetch("api/admin/queries").then((r) => { return r.json(); }).then((data) => {
		            const running = data.queries || [];
		            for (let i = 0; i < running.length; i++) {
		                const q = running[i];
		                if (q.sourceKey && !q.sourceKey.includes("/apps/eXide/modules/")) {
		                    fetch(`api/admin/queries/${encodeURIComponent(q.id)}`, { method: "DELETE" });
		                }
		            }
		        }).catch(() => {});

		        const btnCancel = document.getElementById("cancel-query");
		        if (btnCancel) btnCancel.style.display = "none";
		        util.message("Query cancelled.");
		    }

		    if (hasSideEffects) {
		        if (confirm(
		            "This query contains expressions that modify the database " +
		            "(update, store, delete, permissions, etc.).\n\n" +
		            "Cancelling may leave the database in an inconsistent state " +
		            "because partially applied changes cannot be rolled back.\n\n" +
		            "Cancel anyway?"
		        )) {
		            doCancel();
		        }
		    } else {
		        doCancel();
		    }
		},

		checkQuery() {
			editor.validator.triggerNow(editor.getActiveDocument());
		},

		/** Called if user clicks on "forward" link in query results. */
		browseNext() {
			if (currentOffset > 0 && endOffset < hitCount) {
				startOffset = currentOffset;
		        const howmany = numberOfResults;
		        endOffset = currentOffset + howmany - 1;
				if (hitCount < endOffset)
					endOffset = hitCount;
				activeResultIdx = -1;
				app.fetchCursorPage(startOffset, endOffset);
			}
			return false;
		},

		/** Called if user clicks on "previous" link in query results. */
		browsePrevious() {
			if (currentOffset > 0 && startOffset > 1) {
		        const count = numberOfResults;
		        startOffset = startOffset - count;
				if (startOffset < 1)
					startOffset = 1;
				currentOffset = startOffset;
				endOffset = currentOffset + (count - 1);
				if (hitCount < endOffset)
					endOffset = hitCount;
				activeResultIdx = -1;
				app.fetchCursorPage(startOffset, endOffset);
			}
			return false;
		},

		browseFirst() {
			if (currentOffset > 0 && startOffset > 1) {
				startOffset = 1;
				currentOffset = 1;
				endOffset = Math.min(numberOfResults, hitCount);
				activeResultIdx = -1;
				app.fetchCursorPage(startOffset, endOffset);
			}
			return false;
		},

		browseLast() {
			if (currentOffset > 0 && endOffset < hitCount) {
				startOffset = Math.floor((hitCount - 1) / numberOfResults) * numberOfResults + 1;
				currentOffset = startOffset;
				endOffset = hitCount;
				activeResultIdx = -1;
				app.fetchCursorPage(startOffset, endOffset);
			}
			return false;
		},

		syncDirectory(collection) {
			editor.directory.reload(collection)
		},

		syncManager(collection) {
			const openDialogEl = document.getElementById("open-dialog");
			if(openDialogEl && openDialogEl.style.display !== "none" && openDialogEl.offsetParent !== null){
				dbBrowser.resources.collection = collection
				dbBrowser.resources.reload()
			}
		},

		manage() {
			app.requireLogin(() => {
                dbBrowser.reload(["reload", "create", "upload", "properties", "open", "download", "cut", "copy", "paste"], "manage");
                dialogs["open-dialog"].setTitle("DB Manager");
                dialogs["open-dialog"].setButtons({
                    "Close"() { dialogs["open-dialog"].close(); }
                });
                dialogs["open-dialog"].open();
			});
		},

		deploy() {
            app.requireLogin(() => {
    			const path = editor.getActiveDocument().getPath();
    			const collection = /^(.*)\/[^/]+$/.exec(path);
    			if (!collection) {
    				util.error("The file open in the editor does not belong to an application package!");
    				return false;
    			}
    			console.log("Deploying application from collection: %s", collection[1]);
    			deploymentEditor.deploy(collection[1]);
            });
			return false;
		},

		synchronize() {
            app.requireLogin(() => {
                const path = editor.getActiveDocument().getPath();
        		const collection = /^(.*)\/[^/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.synchronize(collection[1]);
            });
		},

        gitCheckout() {
            app.requireLogin(() => {
                const path = editor.getActiveDocument().getPath();
        		const collection = /^(.*)\/[^/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.gitCheckout(collection[1]);
            });
		},
        gitCommit() {
            app.requireLogin(() => {
                const path = editor.getActiveDocument().getPath();
        		const collection = /^(.*)\/[^/]+$/.exec(path);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.gitCommit(collection[1]);
            });
		},

        downloadApp () {
            app.requireLogin(() => {
                const path = editor.getActiveDocument().getPath();
            	const collection = /^(.*)\/[^/]+$/.exec(path);
                console.log("downloading %s", collection);
    			if (!collection) {
                    util.error("The file open in the editor does not belong to an application package!");
    				return;
    			}
    			deploymentEditor.download(collection[1]);
            });
        },

		openApp (firstLoad) {
			const path = editor.getActiveDocument().getPath();
			const collection = /^(.*)\/[^/]+$/.exec(path);
			if (!collection) {
                util.error("The file open in the editor does not belong to an application package!");
				return;
			}
			deploymentEditor.runApp(collection[1], firstLoad);
		},

        runAppOrQuery() {
            const doc = editor.getActiveDocument();
            const project = projects.getProjectFor(doc.getPath());
            if (project) {
                const url = project.url.replace(/\/{2,}/, "/");
                const link = `${eXide.configuration.context + url}/`;
                app.ensureSaved(() => {
                    project.win = window.open(link, project.abbrev);
                    project.win.focus();
                });
            } else if (!doc.isNew() && (doc.getSyntax() === "xquery")) {
                app.ensureSaved(() => {
                    window.open(doc.getExternalLink(), doc.getName());
                });
            }
        },

        toggleRunStatus(doc) {
            const project = projects.getProjectFor(doc.getPath());
            const syntax = doc.getSyntax();
            let enable = ((syntax === "xquery" || syntax === "html") && (project || !doc.isNew()));
            document.getElementById("launch").disabled = !enable;
            enable = (doc.getSyntax() === "xquery");
            document.getElementById("run").disabled = !enable;
        },

        ensureSaved(callback) {
            if (!editor.getActiveDocument().isSaved()) {
                app.requireLogin(() => {
                    Dialog.input("Save document?", "The current document has not been saved. Save now?", () => {
                            editor.saveDocument(null, () => {
                				util.message(`${editor.getActiveDocument().getName()} stored.`);
                                callback();
                			}, (msg) => {
                				Dialog.warning("Failed to Save Document", msg);
                			});
                    }, { action: "Save" });
                });
            } else {
                callback();
            }
        },

		restoreState(callback) {
			if (!util.supportsHtml5Storage)
				return false;
			const sameVersion = preferences.read();
			app.updateDarkModeIcon(preferences.get("theme"));
			if (!sameVersion) {
			    Dialog.message("Version Note", "It seems another version of eXide has been " +
			        "used from this browser before. If you experience any display issues, please clear your browser's cache " +
                    "(holding shift while clicking on the reload icon should usually be sufficient).");
			}
			layout.restoreState(sameVersion);

            const restoring = {};

			let docCount = localStorage["eXide.documents"];
			if (!docCount)
				docCount = 0;
            // we need to restore documents one after the other
            const docsToLoad = [];
			for (let i = 0; i < docCount; i++) {
				const doc = {
						path: localStorage[`eXide.${i}.path`],
						name: localStorage[`eXide.${i}.name`],
						writable: (localStorage[`eXide.${i}.writable`] === "true"),
						line: parseInt(localStorage[`eXide.${i}.last-line`])
				};
				// New documents always editable (writable not stored for __new__ docs)
				if (doc.path && doc.path.match(/^__new__/)) {
					doc.writable = true;
				}
                if (!doc.name) {
                    continue;
                }
				console.log("Restoring doc %s, going to line = %i", doc.path, doc.line);
				const data = localStorage[`eXide.${i}.data`];
				if (data) {
					editor.newDocumentWithText(data, localStorage[`eXide.${i}.mime`], doc);
				} else {
                    docsToLoad.push(doc);
				}
                restoring[doc.path] = doc;
			}
            this.restoreDocs(docsToLoad, () => {
                if (!editor.getActiveDocument()) {
                    app.newDocument("", "xquery");
                } else {
                    const active = localStorage["eXide.activeTab"];
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

        restoreDocs(docs, callback) {
            if (docs.length === 0) {
                callback();
                return;
            }
            const self = this;
            const doc = docs.pop();
            app.$doOpenDocument(doc, () => {
                if (doc.line) {
                    editorUtils.gotoLine(editor.editor, doc.line + 1);
                }
                self.restoreDocs(docs, callback);
            });
        },

		saveState() {
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

        async getLogin(callback) {
            try {
                const response = await fetch("api/auth/whoami");
                if (!response.ok) throw new Error(response.statusText);
                const data = await response.json();
                if (data && data.isLoggedIn) {
                    app.login = data;
                    app.updateAuthStatus(app.login.user);
                    if (callback) callback(app.login.user);
                } else {
                    app.login = null;
                    app.updateAuthStatus(null);
                    if (callback) callback(null);
                }
            } catch {
                app.login = null;
                app.updateAuthStatus(null);
                if (callback) callback(null);
            }
        },

        enforceLogin() {
            app.requireLogin(() => {
                if (!app.login || app.login.user === "guest") {
                    app.enforceLogin();
                }
            });
        },

		$checkLogin () {
			if (app.login)
				return true;
			util.error("Warning: you are not logged in.");
			return false;
		},

        requireLogin(callback) {
            if (!app.login) {
                dialogs["login-dialog"]._onClose = function () {
                    if (app.login) {
                        callback();
                    } else {
                        util.error("Warning: you are not logged in!");
                    }
                };
                dialogs["login-dialog"].open();
                const firstInput = document.querySelector("#login-dialog input:first-of-type");
                if (firstInput) firstInput.focus();
            } else
                callback();
        },

        showPreferences() {
            preferences.show();
        },

        getPreference(key) {
            return preferences.get(key);
        },

        startDebug() {
            editor.exec("debug");
        },

        stepOver() {
            editor.exec("stepOver");
        },

        stepInto() {
            editor.exec("stepInto");
        },

        setTheme(theme) {
            document.body.classList.toggle("dark", theme.isDark);
        },

        updateDarkModeIcon(themeOrResolved) {
            const icon = document.querySelector("#toggle-dark-mode i");
            if (!icon) return;
            // Show sun when dark (click to go light), moon when light (click to go dark)
            const isDark = themeOrResolved === "dark" || document.body.classList.contains("dark");
            icon.className = isDark ? "fa fa-sun-o" : "fa fa-moon-o";
        },

        updateStatus(doc) {
            const syntax = doc.getSyntax();
            // Update status bar type segment
            const typeLabels = {text:"Text",xml:"XML",html:"HTML",xquery:"XQuery",javascript:"Javascript",css:"CSS",less:"Less",json:"JSON",markdown:"Markdown"};
            const typeVal = document.getElementById("status-type-value");
            let label = typeLabels[syntax] || syntax;
            if (syntax === "xquery" && doc.xqueryVersion) {
                label += ` ${doc.xqueryVersion}`;
            }
            if (typeVal) typeVal.textContent = label;
            // Update popover active state
            document.querySelectorAll("#type-popover .type-popover-item").forEach((el) => {
                el.classList.toggle("active", el.dataset.value === syntax);
            });
            let pathEl = document.querySelector("#status .path");
            const pathText = doc.isNew() ? doc.getName() : decodeURI(util.normalizePath(doc.getPath()));
            const copyBtn = document.getElementById("status-copy-url");
            let extLink = doc.getExternalLink();
            if (!extLink && !doc.isNew()) {
                // Compute fallback external link from path
                const ctx = eXide.configuration.context || "";
                extLink = `${ctx}/rest${doc.getPath()}`;
            }
            if (!doc.isNew() && extLink) {
                if (pathEl.tagName !== "A") {
                    const a = document.createElement("a");
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
                    const span = document.createElement("span");
                    span.className = "path";
                    pathEl.replaceWith(span);
                    pathEl = span;
                }
                pathEl.textContent = pathText;
                copyBtn.style.display = "none";
            }
        },

        showResultsPanel() {
			layout.show(resultPanel, true);
			app.resize(true);
        },

        toggleCollectionsPanel() {
            layout.toggle("west");
            app.$savePanelPrefs();
            app.resize(true);
        },

        toggleResultsPanel() {
            layout.toggle(resultPanel);
			app.resize(true);
        },

        setWestPanel(visible) {
            if (visible) {
                layout.show("west", true);
            } else {
                layout.hide("west");
            }
            app.resize(true);
        },

        isWestPanelVisible() {
            const el = document.querySelector(".panel-west");
            return el && el.style.display !== "none" && el.offsetParent !== null;
        },

        setSouthPanel(visible) {
            if (visible) {
                layout.show(resultPanel, true);
            } else {
                layout.hide(resultPanel);
            }
            app.resize(true);
        },

        isSouthPanelVisible() {
            const el = document.querySelector(`.panel-${resultPanel}`);
            return el && el.style.display !== "none" && el.offsetParent !== null;
        },

        setEastPanel(visible) {
            const eastEl = document.querySelector(".panel-east");
            const isVisible = eastEl && eastEl.style.display !== "none";
            if (visible && !isVisible) {
                layout.show("east");
                if (!monitor) {
                    monitor = new Monitor();
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

        isEastPanelVisible() {
            const el = document.querySelector(".panel-east");
            return !!(el && el.style.display !== "none");
        },

        setCollectionsView(view) {
            const treeView = document.getElementById("dir-tree-view");
            const flatView = document.getElementById("dir-flat-view");
            const toggleBtn = document.getElementById("toggle-dir-view");
            const isFolder = (view === "folder");
            if (treeView) treeView.style.display = isFolder ? "none" : "";
            if (flatView) flatView.style.display = isFolder ? "" : "none";
            if (toggleBtn) {
                toggleBtn.title = isFolder ? "Switch to tree view" : "Switch to folder view";
                const icon = toggleBtn.querySelector("i");
                if (icon) icon.className = isFolder ? "fa fa-sitemap" : "fa fa-folder-open-o";
            }
            if (editor && editor.directory && editor.directory.setFlatViewActive) {
                editor.directory.setFlatViewActive(isFolder);
            }
        },

        $savePanelPrefs() {
            try {
                const eastEl = document.querySelector(".panel-east");
                const eastVisible = !!(eastEl && eastEl.style.display !== "none");
                // Update both localStorage and the live preferences object
                // so saveState's localStorage.clear() + preferences.save() preserves the value
                preferences.preferences.showWestPanel = app.isWestPanelVisible();
                preferences.preferences.showSouthPanel = app.isSouthPanelVisible();
                preferences.preferences.showEastPanel = eastVisible;
                preferences.save();
            } catch {
                // Preferences not initialized yet; nothing to save.
            }
        },

        initStatus(msg) {
            document.getElementById("splash-status").textContent = msg;
        },

        git: function() {
            const unavailable = function() {
                util.message("Git integration is not available in this version of eXide.");
            };
            return {
                 branch: unavailable,
                 command: unavailable
             }
        }(),

        findFiles() {
            const doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), (app) => {
                Files.open(doc, app, async (searchParams) => {
                    editor.updateStatus("");
				    editor.clearErrors();
				    startOffset = 1;
				    currentOffset = 1;

                    const iframe = document.getElementById("results-iframe");
                    iframe.style.display = "";
				    eXide.app.showResultsPanel();

                    iframe.contentWindow.document.open('text/html', 'replace');
                    iframe.contentWindow.document.write("<html><body><p>Searching ...</p></body></html>");
                    iframe.contentWindow.document.close();

                    // Parse form params into JSON body for POST /api/search
                    const formParams = new URLSearchParams(searchParams);
                    const target = formParams.get("target");
                    const collection = target === "all" ? "/db" :
                        target === "collection" ? formParams.get("collection") :
                        (target || "/db");
                    const body = {
                        query: formParams.get("search"),
                        collection,
                        type: formParams.get("type") || "all",
                        regex: formParams.has("regex"),
                        caseSensitive: formParams.has("case")
                    };

                    const response = await fetch("api/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    });
                    const data = await response.json();
                    if (data.error) {
                        iframe.contentWindow.document.open('text/html', 'replace');
                        iframe.contentWindow.document.write(`<html><body><p>${data.error}</p></body></html>`);
                        iframe.contentWindow.document.close();
                        return;
                    }
                    const hits = data.hits || [];
                    let html = '<html><head><link rel="stylesheet" type="text/css" href="resources/css/search.css"/></head><body>';
                    html += `<div><h3>Search Results for ${data.query} in ${data.collection}</h3><ul>`;
                    if (hits.length === 0) {
                        html += '<li>No matches found.</li>';
                    }
                    for (let i = 0; i < hits.length; i++) {
                        const hit = hits[i];
                        html += `<li class="sourceinfo"><a class="resource" href="#" data-src="${hit.resource}" data-line="${hit.line}">${hit.name}</a><span class="line">line ${hit.line}</span></li>`;
                        html += `<li class="code">${hit.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`;
                    }
                    html += '</ul></div></body></html>';
                    iframe.contentWindow.document.open('text/html', 'replace');
                    iframe.contentWindow.document.write(html);
                    iframe.contentWindow.document.close();
                    // Bind click handlers
                    const links = iframe.contentDocument.querySelectorAll(".resource");
                    for (let j = 0; j < links.length; j++) {
                        links[j].addEventListener("click", function(ev) {
                            ev.preventDefault();
                            eXide.app.findDocument(this.dataset.src, parseInt(this.dataset.line));
                        });
                    }
                });
            });
        },

        liveReload() {
            const doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), (project) => {
                if (project == null) {
                    return;
                }
                console.log("live reload: %s %s", project.liveReload, project.abbrev);
                if (project.liveReload) {
                    const url = project.url.replace(/\/{2,}/, "/");
                    const link = `${eXide.configuration.context + url}/`;
                    project.win = window.open(link, project.abbrev);
                    if (project.win && !project.win.closed) {
                        project.win.location.reload();
                    } else {
                        console.log("app window not found: %s", project.abbrev);
                    }
                }
            });
        },

        toggleLiveReload() {
            const doc = editor.getActiveDocument();
            projects.findProject(doc.getBasePath(), (project) => {
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

		initGUI(menu) {
            resultPanel = "south";
            layout = new app.Layout(editor);
            layout.hide("east");

			dialogs["open-dialog"] = DialogManager.create(
			    document.getElementById("open-dialog"), {
                    appendTo: "#layout-container",
    				title: "Open file",
    				modal: false,
    		        height: 480,
    		        width: 640
			    }
			);
			dialogs["open-dialog"].dialog.addEventListener("close", () => {});
			const origOpenDialogOpen = dialogs["open-dialog"].open;
			dialogs["open-dialog"].open = function() {
			    origOpenDialogOpen.call(dialogs["open-dialog"]);
			    dbBrowser.init();
			};

			dialogs["login-dialog"] = DialogManager.create(
			    document.getElementById("login-dialog"), {
                    appendTo: "#layout-container",
    				title: "Login",
    				modal: true,
    				width: 360
			    }
			);
			dialogs["login-dialog"]._onClose = null;
			dialogs["login-dialog"].dialog.addEventListener("close", () => {
			    if (dialogs["login-dialog"]._onClose) {
			        dialogs["login-dialog"]._onClose();
			        dialogs["login-dialog"]._onClose = null;
			    }
			});
			dialogs["login-dialog"].setButtons({
			    "Cancel"() {
			        dialogs["login-dialog"].close();
			        editor.focus();
			    },
			    async "Log in"() {
                    const user = document.querySelector("#login-form input[name=\"user\"]").value;
                    const password = document.querySelector("#login-form input[name=\"password\"]").value;
                    const formData = new URLSearchParams();
                    formData.append("user", user);
                    formData.append("password", password);
                    // The server decides how long a remembered session lasts; the
                    // client only says whether the box was ticked.
                    const rememberEl = document.querySelector("#login-form input[name=\"remember-me\"]");
                    if (rememberEl && rememberEl.checked) {
                        formData.append("remember-me", "true");
                    }
					try {
					    const response = await fetch("api/auth/session", {
					        method: "POST",
					        headers: {
					            "Content-Type": "application/x-www-form-urlencoded"
					        },
					        body: formData.toString()
					    });
					    const data = await response.json();
					    if (!data.user) {
					        document.getElementById("login-error").textContent = "Login failed.";
					        const firstInput = document.querySelector("#login-dialog input:first-of-type");
					        if (firstInput) firstInput.focus();
					    } else {
						    app.login = data;
						    console.log("Logged in as %o. Is dba: %s", data, app.login.isAdmin);
						    dialogs["login-dialog"].close();
						    app.updateAuthStatus(app.login.user);
						    editor.focus();
					    }
					} catch (err) {
					    document.getElementById("login-error").textContent = `Login failed. ${err.message || ""}`;
					    const firstInput = document.querySelector("#login-dialog input:first-of-type");
					    if (firstInput) firstInput.focus();
					}
			    }
			});
			const origLoginOpen = dialogs["login-dialog"].open;
			dialogs["login-dialog"].open = function() {
			    origLoginOpen.call(dialogs["login-dialog"]);
			    const loginDialogEl = document.getElementById("login-dialog");
			    const inputs = loginDialogEl.querySelectorAll("input");
			    inputs.forEach((input) => { input.value = ""; });
			    const firstInput = loginDialogEl.querySelector("input:first-of-type");
			    if (firstInput) firstInput.focus();
			    document.getElementById("login-error").textContent = "";
			    inputs.forEach((input) => {
			        input.addEventListener("keyup", (e) => {
			            if (e.keyCode === 13) {
			                const loginBtn = Array.prototype.find.call(
						    dialogs["login-dialog"].dialog.querySelectorAll(".eXide-dialog-buttons button"),
						    (btn) => { return btn.textContent === "Log in"; });
			                if (loginBtn) loginBtn.click();
			            }
			        });
			    });
			};

			dialogs["keyboard-help"] = DialogManager.create(
			    document.getElementById("keyboard-help"), {
                    appendTo: "#layout-container",
    				title: "Keyboard Shortcuts",
    				modal: false,
    				height: 520,
                    width: 460,
    				buttons: {
    					"Close" () { dialogs["keyboard-help"].close(); }
    				}
			    }
			);
			const origKbHelpOpen = dialogs["keyboard-help"].open;
			dialogs["keyboard-help"].open = function() {
			    origKbHelpOpen.call(dialogs["keyboard-help"]);
			    commands.help(document.getElementById("keyboard-help"), editor);
			};

            dialogs["about-dialog"] = DialogManager.create(
                document.getElementById("about-dialog"), {
                    appendTo: "#layout-container",
                    title: "About",
                    modal: false,
                    height: 300,
                    width: 450,
                    buttons: {
    				    "Close" () { dialogs["about-dialog"].close(); }
				    }
                }
            );
            dialogs["dialog-templates"] = DialogManager.create(
                document.getElementById("dialog-templates"), {
                    appendTo: "#layout-container",
    			    title: "New Document",
    				modal: false,
    		        height: 280,
    		        width: 550,
                    buttons: {
				        "Cancel" () { dialogs["dialog-templates"].close(); editor.focus(); },
                        "Create"() {
                            const templEl = document.getElementById("dialog-templates");
                            const mode = templEl.querySelector(".type-select").value;
                            const template = templEl.querySelector(".templates select").value;
                            console.log("creating new doc with mode: %s and template: %s", mode, template);
                            editor.newDocumentFromTemplate(mode, template);
                            dialogs["dialog-templates"].close();
                            editor.focus();
                        }
                    }
                }
            );
            const origTemplOpen = dialogs["dialog-templates"].open;
            dialogs["dialog-templates"].open = async function() {
                origTemplOpen.call(dialogs["dialog-templates"]);
                const response = await fetch("api/templates");
                const data = await response.json();
                templates = data;
                const templatesDiv = document.querySelector("#dialog-templates .templates");
                if (templatesDiv) templatesDiv.style.display = "none";
                const typeSelect = document.querySelector("#dialog-templates .type-select");
                if (typeSelect) {
                    typeSelect.value = "xquery";
                    typeSelect.dispatchEvent(new Event("change"));
                    typeSelect.focus();
                }
            };
            document.querySelector("#dialog-templates .type-select").addEventListener("change", function() {
                const templ = document.querySelector("#dialog-templates .templates");
                const templSel = templ.querySelector("select");
                const type = this.value;
                templSel.innerHTML = "";
                const mode = templates[type];
                if (mode) {
                    let options = "<option value=''>None</option>";
                    for (let i = 0; i < mode.length; i++) {
                        options += `<option value='${mode[i].name}'>${mode[i].description}</option>`;
                    }
                    templSel.innerHTML = options;
                    templ.style.display = "";
                } else {
                    templ.style.display = "none";
                }
            });

			// initialize buttons and menu events
            const btnOpen = document.getElementById("open");
			btnOpen.addEventListener("click", app.openDocument);
            menu.click("#menu-file-open", app.openDocument);

            const btnClose = document.getElementById("close");
			btnClose.addEventListener("click", app.closeDocument);
			menu.click("#menu-file-close", app.closeDocument);

			menu.click("#menu-file-close-all", app.closeAll);

            const btnNew = document.getElementById("new");
			btnNew.addEventListener("click", () => {
                app.newDocumentFromTemplate();
			});

            const btnNewXquery = document.getElementById("new-xquery");
			btnNewXquery.addEventListener("click", () => {
                app.newDocument(null, "xquery");
			});
			menu.click("#menu-file-new", app.newDocumentFromTemplate);
    		menu.click("#menu-file-new-xquery", () => {
                app.newDocument(null, "xquery");
    		});

            const btnRun = document.getElementById("run");
            btnRun.disabled = true;
			btnRun.addEventListener("click", (ev) => { app.runQuery() });

            const btnCancel = document.getElementById("cancel-query");
            if (btnCancel) {
                btnCancel.addEventListener("click", () => { app.cancelQuery(); });
            }

            const btnLaunch = document.getElementById("launch");
			btnLaunch.addEventListener("click", (ev) => { app.runAppOrQuery() });

            const statusCursor = document.getElementById("status-cursor");
            if (statusCursor) {
                statusCursor.style.cursor = "pointer";
                statusCursor.title = "Go to Line";
                statusCursor.addEventListener("click", () => {
                    editor.gotoLine();
                });
            }

            document.getElementById("status-copy-url").addEventListener("click", async () => {
                const pathEl = document.querySelector("#status .path");
                const path = pathEl ? pathEl.textContent : null;
                if (path) {
                    await navigator.clipboard.writeText(path);
                    app.showMessage("Path copied to clipboard");
                }
            });

            const btnToggleSplitPane = document.getElementById("toggle-split-pane");
            if (btnToggleSplitPane) {
                btnToggleSplitPane.addEventListener("click", () => {
                    const prefs = preferences.preferences;
                    prefs.splitPane = !prefs.splitPane;
                    const pw = document.querySelector('.panel-west');
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
                        const tabs = document.querySelectorAll('#tabs-outline a.tab');
                        let activeIndex = 0;
                        tabs.forEach((t, i) => { if (t.classList.contains('active')) activeIndex = i; });
                        editor.directory.toggle(activeIndex === 0);
                        editor.outline.toggle(activeIndex === 1);
                    }
                    preferences.save();
                });
            }

            const btnToggleOutline = document.getElementById("toggle-outline");
            if (btnToggleOutline) {
                btnToggleOutline.addEventListener("click", () => {
                    layout.toggle("west");
                    app.$savePanelPrefs();
                });
            }
            const btnToggleResults = document.getElementById("toggle-results");
            if (btnToggleResults) {
                btnToggleResults.addEventListener("click", () => {
                    layout.toggle(resultPanel);
                    app.$savePanelPrefs();
                });
            }

            const btnToggleMonitor = document.getElementById("toggle-monitor");
            if (btnToggleMonitor) {
                btnToggleMonitor.addEventListener("click", () => {
                    app.toggleMonitor();
                });
            }

            const btnMonitorClose = document.getElementById("monitor-close");
            if (btnMonitorClose) {
                btnMonitorClose.addEventListener("click", () => {
                    app.toggleMonitor();
                });
            }

            // delegate kill buttons in monitor
            const monRunning = document.getElementById("mon-running-body");
            if (monRunning) {
                monRunning.addEventListener("click", (ev) => {
                    const btn = ev.target.closest(".mon-kill");
                    if (btn && monitor) {
                        monitor.killQuery(btn.dataset.id);
                    }
                });
            }

            const btnDebug = document.getElementById("debug");
            if (btnDebug) btnDebug.addEventListener("click", app.startDebug);

            const btnStepOver = document.querySelector("#debug-actions #step-over");
            if (btnStepOver) btnStepOver.addEventListener("click", app.stepOver);

            const btnStepInto = document.querySelector("#debug-actions #step-into");
            if (btnStepInto) btnStepInto.addEventListener("click", app.stepInto);

            const btnStepOut = document.querySelector("#debug-actions #step-out");
            if (btnStepOut) btnStepOut.addEventListener("click", app.startDebug);

            const btnValidate = document.getElementById("validate");
			if (btnValidate) btnValidate.addEventListener("click", app.checkQuery);

            const btnSave = document.getElementById("save");
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

			menu.click("#menu-edit-undo", () => {
				CM6.undo(editor.editor);
			});
			menu.click("#menu-edit-redo", () => {
				CM6.redo(editor.editor);
			});
            menu.click("#menu-edit-find", () => {
                CM6.openSearchPanel(editor.editor);
                setTimeout(() => {
                    const searchInput = document.querySelector(".cm-search input[main-field]");
                    if (searchInput) searchInput.focus();
                }, 0);
            });
            menu.click("#menu-edit-find-replace", () => {
                CM6.openSearchPanel(editor.editor);
                setTimeout(() => {
                    const searchInput = document.querySelector(".cm-search input[main-field]");
                    if (searchInput) searchInput.focus();
                }, 0);
            });
            menu.click("#menu-edit-find-files", () => {
                app.findFiles();
            });
            menu.click("#menu-edit-toggle-comment", () => {
                CM6.toggleComment(editor.editor);
            });
			menu.click("#menu-edit-preferences", () => {
                preferences.show();
			});
            menu.click("#menu-edit-format", () => {
                editor.exec("format");
            });
            menu.click("#menu-navigate-definition", () => {
                editor.exec("gotoDefinition");
            });
            menu.click("#menu-navigate-references", () => {
                editor.exec("findReferences");
            });
            menu.click("#menu-navigate-info", () => {
                editor.exec("showFunctionDoc");
            });
            menu.click("#menu-navigate-symbol", () => {
                editor.exec("gotoSymbol");
            });
            menu.click("#menu-navigate-buffer", () => {
                editor.selectTab();
            });
            menu.click("#menu-navigate-commands", () => {
                app.getMenu().commandPalette();
            });
            menu.click("#menu-navigate-line", () => {
                editor.gotoLine();
            });
            menu.click("#menu-navigate-history", () => {
                editor.historyBack();
            });
            menu.click("#menu-navigate-diagnostics", () => {
                editor.toggleDiagnostics();
            });
            menu.click("#menu-view-toggle-collections", () => {
                app.toggleCollectionsPanel();
            });
            menu.click("#menu-view-toggle-results", () => {
                app.toggleResultsPanel();
            });
            menu.click("#menu-view-toggle-monitor", () => {
                app.toggleMonitor();
            });
            menu.click("#menu-view-reset", () => {
                layout.reset();
            });
            menu.click("#menu-view-reset-workspace", () => {
                if (confirm("This will clear all saved tabs, preferences, and layout state, then reload. Continue?")) {
                    app._skipSaveState = true;
                    Object.keys(localStorage).filter((k) => { return k.startsWith("eXide."); }).forEach((k) => { localStorage.removeItem(k); });
                    location.reload();
                }
            });
            menu.click("#menu-view-toggle-dark-mode", () => {
                document.getElementById("toggle-dark-mode").click();
            });
            menu.click("#menu-view-toggle-fullscreen", () => {
                util.requestFullScreen(document.getElementById("fullscreen"));
            });
			menu.click("#menu-deploy-run", app.runAppOrQuery);

            menu.click("#menu-help-keyboard", (ev) => {
				dialogs["keyboard-help"].open();
			});
            menu.click("#menu-help-about", (ev) => {
				dialogs["about-dialog"].open();
			});
            menu.click("#menu-help-documentation", (ev) => {
                window.open("https://github.com/eXist-db/eXide#readme");
            });
			// type popover in status bar
			(function() {
				const typeBtn = document.getElementById("status-type");
				const popover = document.getElementById("type-popover");
				const arrow = typeBtn ? typeBtn.querySelector(".status-segment-arrow") : null;
				if (typeBtn && popover) {
					typeBtn.addEventListener("click", (ev) => {
						ev.stopPropagation();
						const isOpen = popover.classList.toggle("open");
						if (arrow) arrow.innerHTML = isOpen ? "&#x25BC;" : "&#x25B2;";
					});
					popover.addEventListener("click", (ev) => {
						const item = ev.target.closest(".type-popover-item");
						if (!item) return;
						editor.setMode(item.dataset.value);
						const doc = editor.getActiveDocument();
						if (doc) app.updateStatus(doc);
						popover.classList.remove("open");
						if (arrow) arrow.innerHTML = "&#x25B2;";
					});
					document.addEventListener("click", () => {
						popover.classList.remove("open");
						if (arrow) arrow.innerHTML = "&#x25B2;";
					});
				}
			})();
			// register listener to update status bar segments
			editor.addEventListener("activate", null, (doc) => {
                app.updateStatus(doc);
                projects.findProject(doc.getBasePath(), (app) => {
                    if (app) {
                        const appEl = document.getElementById("toolbar-current-app");
                        appEl.textContent = app.abbrev;
                        const appLink = document.getElementById("toolbar-current-app-link");
                        appLink.classList.remove("unknown");
                        const appUrl = app.url ? (`${eXide.configuration.context + app.url.replace(/\/{2,}/, "/")}/`) : "#";
                        appLink.href = appUrl;
                        const appIcon = document.getElementById("toolbar-current-app-icon");
                        appIcon.src = `${eXide.configuration.context}/apps/${app.abbrev}/icon.png`;
                        appIcon.style.display = "";
                        appIcon.onerror = function() {
                            this.style.display = "none";
                            this.onerror = null;
                        };
                        document.getElementById("menu-deploy-active").textContent = app.abbrev;
                        document.querySelector("#menu-deploy-live span").setAttribute("class", app.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
                        // update show/hide git stuff
                        if(app.git === "true" || app.git === true) {
                            document.querySelectorAll(".current-branch").forEach((el) => { el.style.display = ""; });
                            document.getElementById("menu-git").style.display = "";
                            // update git-status
                            eXide.app.git.branch(app);
                        } else {
                            document.querySelectorAll(".current-branch").forEach((el) => { el.style.display = "none"; });
                            document.getElementById("menu-git").style.display = "none";
                        }

                    } else {
                        const appEl2 = document.getElementById("toolbar-current-app");
                        appEl2.textContent = "unknown";
                        const appLink2 = document.getElementById("toolbar-current-app-link");
                        appLink2.classList.add("unknown");
                        appLink2.removeAttribute("href");
                        const appIcon2 = document.getElementById("toolbar-current-app-icon");
                        appIcon2.style.display = "none";
                        document.getElementById("menu-deploy-active").textContent = "unknown";
                        document.querySelectorAll(".current-branch").forEach((el) => { el.style.display = "none"; });
                        document.getElementById("menu-git").style.display = "none";
                    }
                });
			});


			document.getElementById("user").addEventListener("click", (ev) => {
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
            document.getElementById("toggle-fullscreen").addEventListener("click", (ev) => {
                ev.preventDefault();
                util.requestFullScreen(document.getElementById("fullscreen"));
            });
            document.getElementById("toggle-dark-mode").addEventListener("click", (ev) => {
                ev.preventDefault();
                // Toggle between light/dark for the current session only (does not save to preferences)
                const isDark = document.body.classList.contains("dark");
                const newTheme = isDark ? "light" : "dark";
                app.setTheme({ isDark: newTheme === "dark" });
                app.updateDarkModeIcon(newTheme);
            });
            document.querySelectorAll('.navbar .toggle-btn[id$="-btn"]').forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    const cb = btn.querySelector('input[type="checkbox"]');
                    const checked = !cb.checked;
                    cb.checked = checked;
                    btn.classList.toggle('active', checked);
                    // Dispatch change event so listeners (e.g., cursor re-fetch) fire
                    cb.dispatchEvent(new Event("change", { bubbles: true }));
                });
            });

			document.querySelectorAll('.results-container #copy-all-clipboard').forEach((btnEl) => {
			    btnEl.addEventListener("click", async (e) => {
                    e.preventDefault();
                    const icon = btnEl.querySelector('.fa');
                    const texts = [];
                    document.querySelectorAll("#results-body > div > div > div > div.item").forEach((item) => { texts.push(item.innerText); });
                    const res = texts.join('\n');
                    try {
                        await navigator.clipboard.writeText(res);
                    } catch (err) {
                        console.error('Could not copy text: ', err);
                        return;
                    }
                    icon.classList.remove('fa-clipboard');
                    icon.classList.add('fa-check');
                    btnEl.classList.add('copied');
                    util.message("Copied results to clipboard");
                    setTimeout(() => {
                        icon.classList.remove('fa-check');
                        icon.classList.add('fa-clipboard');
                        btnEl.classList.remove('copied');
                    }, 1200);
                });
			});
			document.querySelectorAll('.results-container .next').forEach((el) => { el.addEventListener("click", app.browseNext); });
			document.querySelectorAll('.results-container .previous').forEach((el) => { el.addEventListener("click", app.browsePrevious); });
			document.querySelectorAll('.results-container .first-page').forEach((el) => { el.addEventListener("click", app.browseFirst); });
			document.querySelectorAll('.results-container .last-page').forEach((el) => { el.addEventListener("click", app.browseLast); });

            function scrollToResult(idx) {
                const items = document.querySelectorAll('.results-container .results > .even, .results-container .results > .uneven');
                if (items.length === 0) return;
                idx = Math.max(0, Math.min(idx, items.length - 1));
                activeResultIdx = idx;
                items.forEach((el) => { el.classList.remove('result-active'); });
                const target = items[idx];
                target.classList.add('result-active');
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            document.querySelectorAll('.results-container .result-prev').forEach((el) => {
                el.addEventListener("click", (e) => {
                    e.preventDefault();
                    scrollToResult(activeResultIdx <= 0 ? 0 : activeResultIdx - 1);
                });
            });
            document.querySelectorAll('.results-container .result-next').forEach((el) => {
                el.addEventListener("click", (e) => {
                    e.preventDefault();
                    scrollToResult(activeResultIdx < 0 ? 1 : activeResultIdx + 1);
                });
            });
            document.getElementById("number-of-results").addEventListener("change", (ev) => {
                numberOfResults = +document.getElementById("number-of-results").value;
                if (app._cursorId) {
                    startOffset = 1;
                    currentOffset = 1;
                    endOffset = Math.min(numberOfResults, hitCount);
                    app.fetchCursorPage(startOffset, endOffset);
                }
            });
            document.getElementById("serialization-mode").addEventListener("change", (ev) => {
                if (app._cursorId) {
                    // Re-fetch current page with new serialization settings
                    app.fetchCursorPage(startOffset, endOffset);
                } else if (lastQuery) {
                    app.runQuery(lastQuery);
                }
            });
            // Re-fetch on indent/highlight toggle changes too
            document.getElementById("indent-results").addEventListener("change", () => {
                if (app._cursorId) app.fetchCursorPage(startOffset, endOffset);
            });
            document.getElementById("auto-expand-matches").addEventListener("change", () => {
                if (app._cursorId) app.fetchCursorPage(startOffset, endOffset);
            });
            document.getElementById("error-status").addEventListener("mouseover", function(ev) {
                const error = this;
                const extBar = document.getElementById("ext-status-bar");
                if (extBar) {
                    extBar.innerHTML = error.innerHTML;
                    extBar.style.display = "block";
                }
            });
            const errorStatus = document.getElementById("error-status");
            const extStatusBar = document.getElementById("ext-status-bar");
            if (extStatusBar) {
                extStatusBar.addEventListener("mouseout", (ev) => {
                    extStatusBar.style.display = "none";
                });
            }
            if (errorStatus) {
                errorStatus.addEventListener("mouseout", (ev) => {
                    if (extStatusBar) extStatusBar.style.display = "none";
                });
            }
            window.addEventListener("blur", () => {
                hasFocus = false;
            });
            window.addEventListener("focus", () => {
                const checkLogin = !hasFocus;
                hasFocus = true;
                if (checkLogin) {
                   app.getLogin();
                }
            });

            dialogs["dialog-startup"] = DialogManager.create(
                document.getElementById("dialog-startup"), {
                    appendTo: "#layout-container",
        		    modal: false,
                    title: "Quick Start",
                    width: 400,
                    height: 300,
    			    buttons: {
                        "OK"() { dialogs["dialog-startup"].close(); }
    			    }
    		    }
    		);
            if (!util.supportsHtml5Storage)
    		    return;
            const showHints = localStorage.getItem("eXide.firstTime");
            if (!showHints || showHints === "1") {
                dialogs["dialog-startup"].open();
            }
		}
	};

	return app;
}(util));

// Register on the global `eXide` object (see namespace.js)
eXide.app = Object.assign(app, eXide.app);
