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

eXide.namespace("eXide.edit.Directory");

/**
 * XQuery directory view - Sublime style
 *
 */
eXide.edit.Directory = (function () {

	Constr = function() {
		this.currentDoc = null;
        this.__activated = false;

		init();
		initContextMenu();
		initDragDrop();
		initFlatView();

		var filterEl = document.getElementById("directory-filter");
		if (filterEl) {
			filterEl.addEventListener("keyup", function() {
				var regex = new RegExp(this.value, "i");
				var items = document.querySelectorAll("#directory li");
				for (var i = 0; i < items.length; i++) {
					var li = items[i];
					if (li.id === "tree-root") continue;
					var span = li.querySelector("span");
					if (span) {
						li.style.display = regex.test(span.textContent) ? "" : "none";
					}
				}
			});
		}
	};

	function fileIcon(d) {
		var mime = d.mime || "";
		if (mime) {
			if (mime === "application/pdf") return "fa-file-pdf-o";
			if (/^image\//.test(mime)) return "fa-file-image-o";
			if (/xml|html/.test(mime)) return "fa-file-code-o";
			if (/^text\/|javascript|json|css/.test(mime)) return "fa-file-text-o";
			if (/zip|compress|archive|xar|jar/.test(mime)) return "fa-file-archive-o";
		}
		// Fallback to extension
		var name = d.name || "";
		if (/\.(xml|xq|xquery|xql|xqm|xconf|xhtml|html|htm|svg|xsl|xslt|odd|rng|sch|wsdl)$/i.test(name)) return "fa-file-code-o";
		if (/\.(css|less|scss|js|json|md|txt|csv|properties)$/i.test(name)) return "fa-file-text-o";
		if (/\.(png|jpe?g|gif|ico|webp|bmp|tiff?)$/i.test(name)) return "fa-file-image-o";
		if (/\.pdf$/i.test(name)) return "fa-file-pdf-o";
		if (/\.(zip|tar|gz|xar|jar|war|ear)$/i.test(name)) return "fa-file-archive-o";
		return "fa-file-o";
	}

	function setClass(d) {
		if (d.isCollection) return 'fa fa-folder' + (d.isOpen ? "-open" : "");
		return 'fa ' + fileIcon(d);
	}

	function build(data) {
		var sel = this instanceof d3.selection ? this : d3.select(this),
			editor = eXide.app.getEditor();
		if(sel.empty()) {return}
		var fn = function(d) {
			sel.selectAll('ul, span, i').remove()

			var li = sel.datum(d)
						.attr('class', function(d) {return (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : "")})
						.attr("data-key", function(d){return d.key})
						.style('cursor','pointer')
						.on('click', click)
						.on('dblclick', dblClick)
						.on('contextmenu', onContextMenu)

			li
				.append('i')
				.attr('class', setClass)
			li
				.append('span')
				.text(function(d){return d.name})

			if(d.children && d.children.length){
				sel
					.append('ul')
					.selectAll('li')
					.data(d.children)
					.enter()
					.append('li')
					.each(build)
			}

		};

		if(data) {
			var d = data.length ? data[0]: data
			if(!d.isCollection) {
				d.isResourceOpen = !!editor.getDocument(d.key)
			}
			return fn(d)
		}
		var path = (sel.datum().key || "/db").replace(/^\//, "");
		fetch("api/storage/" + encodeURIComponent(path)).then(function(r) { return r.json(); }).then(function(data) {
			var d = sel.datum()
			d.isOpen = true;
			d.isLoaded = true;
			d.children = (data.items || []).filter(function(i){return i.name != ".."}).map(mapItem)
			fn(d)
		}).catch(function() {})
	};

	function init() {
		var root = {key:'/db',isCollection: true, isOpen:false, name:'db', isLoaded: false};
		build.call(d3.select("#tree-root"), [root]);
		// Auto-expand the db root
		var rootEl = document.getElementById("tree-root");
		if (rootEl) {
			toggleFolder.call(rootEl, root);
		}
	};

	function toggleFolder(d) {
		d.isOpen = !d.isOpen;
		var sel = d3.select(this)
		sel.select("i.fa").attr('class', setClass)
		if(d.isOpen) {
		   return build.call(this)
		}
		sel.selectAll('ul').remove()
	};


	function loadFolder(d) {
		build.call(this)
	};

	function loadResource(d) {
		eXide.app.$doOpenDocument({name :d.name, path: d.key, writable:d.writable});
	};

	function dblClick(d) {
		d3.event.stopPropagation()
		if(!d.isCollection && d.isResourceOpen) {
			loadResource(d)
			eXide.app.closeDocument()
		}
	};

	function click(d) {
		d3.event.stopPropagation()
		if(d.isCollection) {
			if(!d.isOpen) {eXide.app.syncManager(d.key)}
			if(d.isLoaded) {
				return toggleFolder.call(this,d)
			}

			loadFolder.call(this,d)
		}
		else {
			loadResource(d)
		}
	};

	// ── Context menu ─────────────────────────────────────────────────────

	var ctxMenu = null;
	var ctxNode = null;  // the d3 datum of the right-clicked node
	var ctxEl = null;    // the DOM <li> element of the right-clicked node

	function initContextMenu() {
		ctxMenu = document.getElementById("directory-context-menu");
		if (!ctxMenu) return;

		// Delegate clicks on menu items
		ctxMenu.addEventListener("click", function(e) {
			var item = e.target.closest(".ctx-item");
			if (!item || item.classList.contains("disabled")) return;
			var action = item.dataset.action;
			hideContextMenu();
			if (ctxNode) {
				handleAction(action, ctxNode, ctxEl);
			}
		});

		// Hide on click outside or Escape
		document.addEventListener("click", function() { hideContextMenu(); });
		document.addEventListener("keydown", function(e) {
			if (e.key === "Escape") hideContextMenu();
		});
	}

	function onContextMenu(d) {
		d3.event.preventDefault();
		d3.event.stopPropagation();
		showContextMenu(d, d3.event, this);
	}

	function showContextMenu(d, e, el) {
		if (!ctxMenu) return;

		ctxNode = d;
		ctxEl = el;

		// Highlight the target node
		document.querySelectorAll(".ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
		ctxEl.classList.add("ctx-highlight");

		// Enable/disable items based on context
		var isCollection = d.isCollection;
		var isRoot = d.key === "/db";
		ctxMenu.querySelector('[data-action="new-collection"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="new-resource"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="upload"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="rename"]').classList.toggle("disabled", isRoot);
		ctxMenu.querySelector('[data-action="delete"]').classList.toggle("disabled", isRoot);
		ctxMenu.querySelector('[data-action="reload"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="properties"]').classList.toggle("disabled", isRoot);

		// Position the menu
		var x = e.clientX;
		var y = e.clientY;
		ctxMenu.style.left = x + "px";
		ctxMenu.style.top = y + "px";
		ctxMenu.classList.add("visible");

		// Adjust if menu overflows viewport
		var rect = ctxMenu.getBoundingClientRect();
		if (rect.right > window.innerWidth) {
			ctxMenu.style.left = (x - rect.width) + "px";
		}
		if (rect.bottom > window.innerHeight) {
			ctxMenu.style.top = (y - rect.height) + "px";
		}
	}

	function hideContextMenu() {
		if (ctxMenu) ctxMenu.classList.remove("visible");
		document.querySelectorAll(".ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
	}

	function handleAction(action, d, el) {
		switch (action) {
			case "new-collection": createCollection(d, el); break;
			case "new-resource": createResource(d); break;
			case "upload": uploadToCollection(d, el); break;
			case "download": downloadItem(d); break;
			case "rename": renameItem(d, el); break;
			case "delete": deleteItem(d, el); break;
			case "copy-path": copyPath(d); break;
			case "properties": showProperties(d); break;
			case "reload": reloadNode(d, el); break;
		}
	}

	// ── Helper: map API response items to d3 data shape ─────────────────

	function mapItem(item) {
		return {
			name: item.name,
			key: item.path,
			isCollection: item.isCollection,
			writable: item.writable,
			mime: item.mime,
			lastModified: item.lastModified
		};
	}

	function apiPath(dbPath) {
		return "api/storage/" + dbPath.replace(/^\//, "").split("/").map(encodeURIComponent).join("/");
	}

	function permCheckbox(name, perms, index, char) {
		var checked = perms.length > index && perms.charAt(index) === char ? ' checked="checked"' : '';
		return '<input type="checkbox" name="' + name + '" id="' + name + '"' + checked + '/>';
	}

	function permissionsFromForm(form) {
		var parts = [];
		["u", "g", "o"].forEach(function(scope) {
			["r", "w", "x"].forEach(function(perm) {
				var cb = form.querySelector("#" + scope + perm);
				parts.push(scope + (cb && cb.checked ? "+" : "-") + perm);
			});
		});
		var us = form.querySelector("#us");
		parts.push("u" + (us && us.checked ? "+" : "-") + "s");
		var gs = form.querySelector("#gs");
		parts.push("g" + (gs && gs.checked ? "+" : "-") + "s");
		var ot = form.querySelector("#ot");
		parts.push("o" + (ot && ot.checked ? "+" : "-") + "t");
		return parts.join(",");
	}

	function buildPropertiesForm(data, accounts) {
		var perms = data.permissions || "---------";
		var html = '<form id="browsing-dialog-form" action="">';
		html += '<fieldset>';
		if (data.mime) {
			html += '<div class="control-group"><label for="mime">Mime:</label>';
			html += '<input type="text" name="mime" value="' + escapeHtml(data.mime) + '"/></div>';
		}
		html += '<div class="control-group"><label for="owner">Owner:</label>';
		html += '<select name="owner">';
		(accounts.users || []).sort().forEach(function(u) {
			html += '<option value="' + escapeHtml(u) + '"' + (u === data.owner ? ' selected="selected"' : '') + '>' + escapeHtml(u) + '</option>';
		});
		html += '</select></div>';
		html += '<div class="control-group"><label for="group">Group:</label>';
		html += '<select name="group">';
		(accounts.groups || []).sort().forEach(function(g) {
			html += '<option value="' + escapeHtml(g) + '"' + (g === data.group ? ' selected="selected"' : '') + '>' + escapeHtml(g) + '</option>';
		});
		html += '</select></div>';
		html += '</fieldset>';
		html += '<fieldset><legend>Permissions</legend>';
		html += '<table><tr><th>User</th><th>Group</th><th>Other</th></tr>';
		html += '<tr>';
		html += '<td>' + permCheckbox("ur", perms, 0, "r") + '<label for="ur">read</label></td>';
		html += '<td>' + permCheckbox("gr", perms, 3, "r") + '<label for="gr">read</label></td>';
		html += '<td>' + permCheckbox("or", perms, 6, "r") + '<label for="or">read</label></td>';
		html += '</tr><tr>';
		html += '<td>' + permCheckbox("uw", perms, 1, "w") + '<label for="uw">write</label></td>';
		html += '<td>' + permCheckbox("gw", perms, 4, "w") + '<label for="gw">write</label></td>';
		html += '<td>' + permCheckbox("ow", perms, 7, "w") + '<label for="ow">write</label></td>';
		html += '</tr><tr>';
		html += '<td>' + permCheckbox("ux", perms, 2, "x") + '<label for="ux">execute</label></td>';
		html += '<td>' + permCheckbox("gx", perms, 5, "x") + '<label for="gx">execute</label></td>';
		html += '<td>' + permCheckbox("ox", perms, 8, "x") + '<label for="ox">execute</label></td>';
		html += '</tr><tr>';
		html += '<td>' + permCheckbox("us", perms, 2, "s") + '<label for="us">setuid</label></td>';
		html += '<td>' + permCheckbox("gs", perms, 5, "s") + '<label for="gs">setgid</label></td>';
		html += '<td>' + permCheckbox("ot", perms, 8, "t") + '<label for="ot">sticky</label></td>';
		html += '</tr></table></fieldset></form>';
		return html;
	}

	// ── Actions ──────────────────────────────────────────────────────────

	function createCollection(d, el) {
		if (!eXide.app.$checkLogin()) return;
		eXide.util.Dialog.input("Create Collection",
			'<label for="dir-new-collection">Name: </label>' +
			'<input type="text" name="collection" id="dir-new-collection"/>',
			function() {
				var name = document.getElementById("dir-new-collection").value;
				if (!name) return;
				fetch(apiPath(d.key), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "create", name: name })
				}).then(function(r) { return r.json(); }).then(function(data) {
					if (data.error) {
						eXide.util.Dialog.warning("Create Collection Error", data.error);
					} else {
						reloadNode(d, el);
						if (flatViewActive) loadFlatView(flatCollection);
						eXide.app.syncManager(d.key);
					}
				});
			}
		);
	}

	function createResource(d) {
		eXide.app.newDocumentFromTemplate();
	}

	function uploadToCollection(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.addEventListener("change", function() {
			var files = Array.from(input.files);
			if (files.length === 0) return;
			uploadFiles(files, d.key).then(function() {
				reloadNode(d, el);
				if (flatViewActive) loadFlatView(flatCollection);
				eXide.app.syncManager(d.key);
			});
		});
		input.click();
	}

	function uploadFiles(files, collection) {
		var promises = files.map(function(file) {
			var name = file.webkitRelativePath || file.name;
			var path = collection + "/" + name;
			return fetch(apiPath(path), {
				method: "PUT",
				headers: { "Content-Type": file.type || "application/octet-stream" },
				body: file
			}).then(function(r) { return r.json(); });
		});
		return Promise.all(promises);
	}

	function downloadItem(d) {
		eXide.app.download(d.key);
	}

	function renameItem(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var spanEl = el.querySelector("span");
		if (!spanEl) return;

		var oldName = d.name;
		spanEl.style.display = "none";

		var input = document.createElement("input");
		input.type = "text";
		input.className = "inline-edit";
		input.value = oldName;
		el.appendChild(input);
		input.focus();
		input.select();

		function finish(save) {
			var newName = input.value.trim();
			input.remove();
			spanEl.style.display = "";
			if (save && newName && newName !== oldName) {
				var parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
				fetch(apiPath(d.key), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "rename", target: newName })
				}).then(function(r) { return r.json(); }).then(function(data) {
					if (data.error) {
						eXide.util.Dialog.warning("Rename Error", data.error);
					} else {
						// Reload the parent in tree view
						var parentSel = d3.select("[data-key='" + parentKey + "']");
						if (!parentSel.empty()) {
							build.call(parentSel);
						}
						// Refresh flat view if active
						if (flatViewActive) loadFlatView(flatCollection);
						eXide.app.syncManager(parentKey);
					}
				});
			}
		}

		input.addEventListener("keydown", function(e) {
			if (e.key === "Enter") { e.preventDefault(); finish(true); }
			if (e.key === "Escape") { e.preventDefault(); finish(false); }
		});
		input.addEventListener("blur", function() { finish(true); });
	}

	function deleteItem(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var label = d.isCollection ? "collection" : "resource";
		eXide.util.Dialog.input("Confirm Deletion",
			"Are you sure you want to delete " + label + " <strong>" + d.name + "</strong>?",
			function() {
				fetch(apiPath(d.key), { method: "DELETE" })
				.then(function(r) { return r.json(); }).then(function(data) {
					if (data.error) {
						eXide.util.Dialog.warning("Delete Error", data.error);
					} else {
						// Reload the parent collection in tree view
						var parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
						var parentSel = d3.select("[data-key='" + parentKey + "']");
						if (!parentSel.empty()) {
							build.call(parentSel);
						}
						// Refresh flat view if active
						if (flatViewActive) loadFlatView(flatCollection);
						eXide.app.syncManager(parentKey);
					}
				});
			}
		);
	}

	function copyPath(d) {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(d.key);
		}
	}

	function showProperties(d) {
		if (!eXide.app.$checkLogin()) return;
		var contentEl = document.getElementById("resource-properties-content");
		if (!contentEl) return;
		var propsPromise = fetch(apiPath(d.key)).then(function(r) { return r.json(); });
		var accountsPromise = fetch("api/admin/accounts").then(function(r) { return r.ok ? r.json() : { users: [], groups: [] }; }).catch(function() { return { users: [], groups: [] }; });
		Promise.all([propsPromise, accountsPromise]).then(function(results) {
			var data = results[0];
			var accounts = results[1];
			contentEl.innerHTML = buildPropertiesForm(data, accounts);
		});

		var dialog = document.getElementById("resource-properties-dialog");
		if (dialog && dialog._eXideDialog) {
			dialog._eXideDialog.open();
		} else if (typeof eXide.util.DialogManager !== "undefined") {
			// Create the dialog if it hasn't been initialized yet
			var dlg = eXide.util.DialogManager.create(dialog, {
				title: "Properties",
				modal: true,
				width: 500,
				buttons: {
					"Apply": function() {
						applyProperties(d, dialog, this);
					},
					"Close": function() { this.close(); }
				}
			});
			dlg.open();
		}
	}

	function applyProperties(d, dialog, dlg) {
		var form = dialog.querySelector("form");
		if (!form) return;
		var body = {};
		var owner = form.querySelector("select[name='owner']");
		if (owner) body.owner = owner.value;
		var group = form.querySelector("select[name='group']");
		if (group) body.group = group.value;
		body.mode = permissionsFromForm(form);
		var mime = form.querySelector("[name='mime']");
		if (mime) body.mime = mime.value;

		fetch(apiPath(d.key), {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body)
		})
		.then(function(r) { return r.json(); })
		.then(function(data) {
			if (data.error) {
				eXide.util.Dialog.warning("Properties Error", data.error);
			} else {
				dlg.close();
			}
		});
	}

	function reloadNode(d, el) {
		if (!d.isCollection) return;
		// Flat view items don't have D3 bindings; just refresh the flat view
		if (flatViewActive && el && el.classList.contains("dir-flat-item")) {
			loadFlatView(flatCollection);
			return;
		}
		d.isLoaded = false;
		d.isOpen = true;
		build.call(el);
	}

	// ── Drag & drop upload ───────────────────────────────────────────────

	function initDragDrop() {
		var directoryBody = document.getElementById("directory-body");
		if (!directoryBody) return;

		directoryBody.addEventListener("dragover", function(e) {
			e.preventDefault();
			e.stopPropagation();
			var target = findDropTarget(e.target);
			clearDropHighlight();
			if (target) target.classList.add("ctx-highlight");
			e.dataTransfer.dropEffect = "copy";
		});

		directoryBody.addEventListener("dragleave", function(e) {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();
		});

		directoryBody.addEventListener("drop", function(e) {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();

			var target = findDropTarget(e.target);
			if (!target) return;

			var sel = d3.select(target);
			var d = sel.datum();
			if (!d || !d.isCollection) return;

			if (!eXide.app.$checkLogin()) return;

			var files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;

			uploadFiles(files, d.key).then(function() {
				reloadNode(d, target);
				eXide.app.syncManager(d.key);
			});
		});
	}

	function findDropTarget(el) {
		// Walk up to the nearest collection <li>
		while (el && el.id !== "directory-body") {
			if (el.tagName === "LI" && el.classList.contains("collection")) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	function clearDropHighlight() {
		document.querySelectorAll(".ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
	}

	// ── Flat (folder) view ───────────────────────────────────────────────

	var flatViewActive = false;
	var flatCollection = "/db";

	function initFlatView() {
		var toggleBtn = document.getElementById("toggle-dir-view");
		if (toggleBtn) {
			toggleBtn.addEventListener("click", function() {
				var newView = flatViewActive ? "tree" : "folder";
				if (typeof eXide !== 'undefined' && eXide.app && eXide.app.setCollectionsView) {
					eXide.app.setCollectionsView(newView);
				}
				// Persist to preferences
				if (typeof eXide !== 'undefined' && eXide.app && eXide.app.getPreference) {
					try {
						var prefs = JSON.parse(localStorage.getItem('eXide.preferences') || '{}');
						prefs.collectionsView = newView;
						localStorage.setItem('eXide.preferences', JSON.stringify(prefs));
					} catch(e) {}
				}
			});
		}

		// Refresh button
		var refreshBtn = document.getElementById("refresh-dir");
		if (refreshBtn) {
			refreshBtn.addEventListener("click", function() {
				if (flatViewActive) {
					loadFlatView(flatCollection);
				} else {
					// Reload tree view root
					var rootSel = d3.select("#tree-root");
					if (!rootSel.empty()) {
						var d = rootSel.datum();
						if (d) {
							d.isLoaded = false;
							d.isOpen = true;
							build.call(rootSel.node());
						}
					}
				}
			});
		}

		// Drag & drop upload for flat view
		var flatView = document.getElementById("dir-flat-view");
		if (flatView) {
			flatView.addEventListener("dragover", function(e) {
				e.preventDefault();
				e.stopPropagation();
				clearDropHighlight();
				var target = findFlatDropTarget(e.target);
				if (target) target.classList.add("ctx-highlight");
				e.dataTransfer.dropEffect = "copy";
			});
			flatView.addEventListener("dragleave", function(e) {
				e.preventDefault();
				e.stopPropagation();
				clearDropHighlight();
			});
			flatView.addEventListener("drop", function(e) {
				e.preventDefault();
				e.stopPropagation();
				clearDropHighlight();
				if (!eXide.app.$checkLogin()) return;
				var files = Array.from(e.dataTransfer.files);
				if (files.length === 0) return;
				// Drop on a collection item uploads there; otherwise use current collection
				var target = findFlatDropTarget(e.target);
				var targetKey = flatCollection;
				if (target && target._flatItem && target._flatItem.isCollection) {
					targetKey = target._flatItem.key;
				}
				uploadFiles(files, targetKey).then(function() {
					loadFlatView(flatCollection);
					eXide.app.syncManager(targetKey);
				});
			});
		}
	}

	function findFlatDropTarget(el) {
		while (el) {
			if (el.classList && el.classList.contains("dir-flat-collection")) return el;
			if (el.id === "dir-flat-view") return null;
			el = el.parentElement;
		}
		return null;
	}

	function loadFlatView(collection) {
		flatCollection = collection;
		updateFlatBreadcrumbs(collection);
		var list = document.getElementById("dir-flat-list");
		if (!list) return;
		list.innerHTML = '<li class="dir-flat-loading">Loading\u2026</li>';

		fetch(apiPath(collection))
			.then(function(r) { return r.json(); })
			.then(function(data) {
				list.innerHTML = "";
				var items = (data.items || []).map(mapItem);
				// Add parent link if not at /db
				if (collection !== "/db") {
					items.unshift({ name: "..", isCollection: true, key: collection.substring(0, collection.lastIndexOf("/")) || "/db" });
				}
				if (items.length === 0) {
					list.innerHTML = '<li class="dir-flat-empty">Empty collection</li>';
					return;
				}
				items.forEach(function(item) {
					if (item.name === "..") {
						var li = document.createElement("li");
						li.className = "dir-flat-item dir-flat-collection";
						li.innerHTML = '<i class="fa fa-folder"></i> <span>..</span>';
						li.addEventListener("click", function() {
							loadFlatView(item.key);
						});
						list.appendChild(li);
						return;
					}
					var li = document.createElement("li");
					var isOpen = !item.isCollection && !!eXide.app.getEditor().getDocument(item.key);
					li.className = "dir-flat-item" + (item.isCollection ? " dir-flat-collection" : "") + (isOpen ? " open" : "");
					var iconClass = item.isCollection ? "fa fa-folder" : "fa " + fileIcon(item);
					li.innerHTML = '<i class="' + iconClass + '"></i> <span>' + escapeHtml(item.name) + '</span>';
					if (item.isCollection) {
						li._flatItem = item;
						li.addEventListener("click", function() {
							loadFlatView(item.key);
						});
					} else {
						li.addEventListener("click", function() {
							eXide.app.$doOpenDocument({ name: item.name, path: item.key, writable: item.writable });
						});
					}
					(function(itemData, liEl) {
						liEl.addEventListener("contextmenu", function(e) {
							e.preventDefault();
							e.stopPropagation();
							showContextMenu(itemData, e, liEl);
						});
					})(item, li);
					list.appendChild(li);
				});
			})
			.catch(function() {
				list.innerHTML = '<li class="dir-flat-empty">Failed to load</li>';
			});
	}

	function updateFlatBreadcrumbs(collection) {
		var bc = document.getElementById("dir-flat-breadcrumbs");
		if (!bc) return;
		bc.innerHTML = "";
		var parts = collection.split("/").filter(function(p) { return p.length > 0; });
		var path = "";
		for (var i = 0; i < parts.length; i++) {
			path += "/" + parts[i];
			var sep = document.createElement("span");
			sep.className = "dir-bc-sep";
			sep.textContent = "/";
			bc.appendChild(sep);
			var a = document.createElement("a");
			a.href = "#";
			a.textContent = parts[i];
			a.dataset.path = path;
			a.addEventListener("click", function(e) {
				e.preventDefault();
				loadFlatView(this.dataset.path);
			});
			bc.appendChild(a);
		}
	}

	function escapeHtml(str) {
		var d = document.createElement("div");
		d.textContent = str;
		return d.innerHTML;
	}

	// ── Prototype ────────────────────────────────────────────────────────

	Constr.prototype = {
		toggle : function(state) {
			if(state || state === false) {this.__activated = !!state}
			else {this.__activated = !this.__activated};
			d3.select("#directory-body")
				.style("position", this.__activated ? "relative" : "absolute")
				.style("visibility", this.__activated ? "visible" : "hidden")
		},

		clearDirectory: function() {
			var el = document.getElementById("directory");
			if (el) el.innerHTML = "";
		},
		reload : function (key) {
			var sel = d3.select("[data-key='"+ key +"']")
			if(sel.empty()) {return}
			build.call(sel)
			// Also refresh flat view if active and showing the same collection
			if (flatViewActive && key === flatCollection) {
				loadFlatView(flatCollection);
			}
		},
		setFlatViewActive: function(active) {
			flatViewActive = !!active;
			if (flatViewActive) {
				loadFlatView(flatCollection);
			}
		},
		toggleEdit : function(key, state) {

			var sel = d3.select("[data-key='"+ key +"']")
			if(sel.empty()) {return}
			var d = sel.datum()
			if (!d) {return}
			d.isResourceOpen = state || !d.isResourceOpen
			sel.attr("class", (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : ""))
		}

	};

	return Constr;
}());
