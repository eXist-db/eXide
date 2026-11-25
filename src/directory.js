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

import { eXide, namespace } from "./namespace.js";
import { DialogManager } from "./dialog-utils.js";
import { Dialog } from "./util.js";

/**
 * XQuery directory view - Sublime style
 *
 */
export class Directory {
    constructor() {
		this.currentDoc = null;
        this.__activated = false;

		init();
		initContextMenu();
		initDragDrop();
		initFlatView();

		const filterEl = document.getElementById("directory-filter");
		if (filterEl) {
			filterEl.addEventListener("keyup", function() {
				const regex = new RegExp(this.value, "i");
				const items = document.querySelectorAll("#directory li");
				for (let i = 0; i < items.length; i++) {
					const li = items[i];
					if (li.id === "tree-root") continue;
					const span = li.querySelector("span");
					if (span) {
						li.style.display = regex.test(span.textContent) ? "" : "none";
					}
				}
			});
		}
	}

    toggle(state) {
		if(state || state === false) {this.__activated = !!state}
		else {this.__activated = !this.__activated};
		d3.select("#directory-body")
			.style("position", this.__activated ? "relative" : "absolute")
			.style("visibility", this.__activated ? "visible" : "hidden")
	}

    clearDirectory() {
		const el = document.getElementById("directory");
		if (el) el.innerHTML = "";
	}

    reload(key) {
		const sel = d3.select(`[data-key='${key}']`)
		if(sel.empty()) {return}
		build.call(sel)
		// Also refresh flat view if active and showing the same collection
		if (flatViewActive && key === flatCollection) {
			loadFlatView(flatCollection);
		}
	}

    setFlatViewActive(active) {
		flatViewActive = !!active;
		if (flatViewActive) {
			loadFlatView(flatCollection);
		}
	}

    toggleEdit(key, state) {

		const sel = d3.select(`[data-key='${key}']`)
		if(sel.empty()) {return}
		const d = sel.datum()
		if (!d) {return}
		d.isResourceOpen = state || !d.isResourceOpen
		sel.attr("class", (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : ""))
	}
}

function fileIcon(d) {
	const mime = d.mime || "";
	if (mime) {
		if (mime === "application/pdf") return "fa-file-pdf-o";
		if (/^image\//.test(mime)) return "fa-file-image-o";
		if (/xml|html/.test(mime)) return "fa-file-code-o";
		if (/^text\/|javascript|json|css/.test(mime)) return "fa-file-text-o";
		if (/zip|compress|archive|xar|jar/.test(mime)) return "fa-file-archive-o";
	}
	// Fallback to extension
	const name = d.name || "";
	if (/\.(xml|xq|xquery|xql|xqm|xconf|xhtml|html|htm|svg|xsl|xslt|odd|rng|sch|wsdl)$/i.test(name)) return "fa-file-code-o";
	if (/\.(css|less|scss|js|json|md|txt|csv|properties)$/i.test(name)) return "fa-file-text-o";
	if (/\.(png|jpe?g|gif|ico|webp|bmp|tiff?)$/i.test(name)) return "fa-file-image-o";
	if (/\.pdf$/i.test(name)) return "fa-file-pdf-o";
	if (/\.(zip|tar|gz|xar|jar|war|ear)$/i.test(name)) return "fa-file-archive-o";
	return "fa-file-o";
}

function setClass(d) {
	if (d.isCollection) return `fa fa-folder${d.isOpen ? "-open" : ""}`;
	return `fa ${fileIcon(d)}`;
}

function build(data) {
	const sel = this instanceof d3.selection ? this : d3.select(this),
		editor = eXide.app.getEditor();
	if(sel.empty()) {return}
	const fn = function(d) {
		sel.selectAll('ul, span, i').remove()

		const li = sel.datum(d)
					.attr('class', (d) => {return (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : "")})
					.attr("data-key", (d) =>{return d.key})
					.style('cursor','pointer')
					.on('click', click)
					.on('dblclick', dblClick)
					.on('contextmenu', onContextMenu)

		li
			.append('i')
			.attr('class', setClass)
		li
			.append('span')
			.text((d) =>{return d.name})

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
		const d = data.length ? data[0]: data
		if(!d.isCollection) {
			d.isResourceOpen = !!editor.getDocument(d.key)
		}
		return fn(d)
	}
	const path = sel.datum().key || "/db";
	fetch(apiPath(path)).then((r) => { return r.json(); }).then((data) => {
		const d = sel.datum()
		d.isOpen = true;
		d.isLoaded = true;
		d.children = (data.items || []).filter((i) =>{return i.name !== ".."}).map(mapItem)
		fn(d)
	}).catch(() => {})
}

;

function init() {
	const root = {key:'/db',isCollection: true, isOpen:false, name:'db', isLoaded: false};
	build.call(d3.select("#tree-root"), [root]);
	// Auto-expand the db root
	const rootEl = document.getElementById("tree-root");
	if (rootEl) {
		toggleFolder.call(rootEl, root);
	}
}

;

function toggleFolder(d) {
	d.isOpen = !d.isOpen;
	const sel = d3.select(this)
	sel.select("i.fa").attr('class', setClass)
	if(d.isOpen) {
	   return build.call(this)
	}
	sel.selectAll('ul').remove()
}

;

function loadFolder(d) {
	build.call(this)
}

;

function loadResource(d) {
	eXide.app.$doOpenDocument({name :d.name, path: d.key, writable:d.writable});
}

;

function dblClick(d) {
	d3.event.stopPropagation()
	if(!d.isCollection && d.isResourceOpen) {
		loadResource(d)
		eXide.app.closeDocument()
	}
}

;

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
}

;

// ── Context menu ─────────────────────────────────────────────────────
let flatViewActive = false;
let flatCollection = "/db";
let ctxMenu = null;

let ctxNode = null;

let ctxEl = null;

function initContextMenu() {
	ctxMenu = document.getElementById("directory-context-menu");
	if (!ctxMenu) return;

	// Delegate clicks on menu items
	ctxMenu.addEventListener("click", (e) => {
		const item = e.target.closest(".ctx-item");
		if (!item || item.classList.contains("disabled")) return;
		const action = item.dataset.action;
		hideContextMenu();
		if (ctxNode) {
			handleAction(action, ctxNode, ctxEl);
		}
	});

	// Hide on click outside or Escape
	document.addEventListener("click", () => { hideContextMenu(); });
	document.addEventListener("keydown", (e) => {
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
	document.querySelectorAll(".ctx-highlight").forEach((el) => {
		el.classList.remove("ctx-highlight");
	});
	ctxEl.classList.add("ctx-highlight");

	// Enable/disable items based on context
	const isCollection = d.isCollection;
	const isRoot = d.key === "/db";
	ctxMenu.querySelector('[data-action="new-collection"]').classList.toggle("disabled", !isCollection);
	ctxMenu.querySelector('[data-action="new-resource"]').classList.toggle("disabled", !isCollection);
	ctxMenu.querySelector('[data-action="upload"]').classList.toggle("disabled", !isCollection);
	ctxMenu.querySelector('[data-action="rename"]').classList.toggle("disabled", isRoot);
	ctxMenu.querySelector('[data-action="delete"]').classList.toggle("disabled", isRoot);
	ctxMenu.querySelector('[data-action="reload"]').classList.toggle("disabled", !isCollection);
	ctxMenu.querySelector('[data-action="properties"]').classList.toggle("disabled", isRoot);

	// Position the menu
	const x = e.clientX;
	const y = e.clientY;
	ctxMenu.style.left = `${x}px`;
	ctxMenu.style.top = `${y}px`;
	ctxMenu.classList.add("visible");

	// Adjust if menu overflows viewport
	const rect = ctxMenu.getBoundingClientRect();
	if (rect.right > window.innerWidth) {
		ctxMenu.style.left = `${x - rect.width}px`;
	}
	if (rect.bottom > window.innerHeight) {
		ctxMenu.style.top = `${y - rect.height}px`;
	}
}

function hideContextMenu() {
	if (ctxMenu) ctxMenu.classList.remove("visible");
	document.querySelectorAll(".ctx-highlight").forEach((el) => {
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
	return `api/storage/${dbPath.replace(/^\//, "").split("/").map(encodeURIComponent).join("/")}`;
}

function permCheckbox(name, perms, index, char) {
	const checked = perms.length > index && perms.charAt(index) === char ? ' checked="checked"' : '';
	return `<input type="checkbox" name="${name}" id="${name}"${checked}/>`;
}

function permissionsFromForm(form) {
	const parts = [];
	["u", "g", "o"].forEach((scope) => {
		["r", "w", "x"].forEach((perm) => {
			const cb = form.querySelector(`#${scope}${perm}`);
			parts.push(scope + (cb && cb.checked ? "+" : "-") + perm);
		});
	});
	const us = form.querySelector("#us");
	parts.push(`u${us && us.checked ? "+" : "-"}s`);
	const gs = form.querySelector("#gs");
	parts.push(`g${gs && gs.checked ? "+" : "-"}s`);
	const ot = form.querySelector("#ot");
	parts.push(`o${ot && ot.checked ? "+" : "-"}t`);
	return parts.join(",");
}

function buildPropertiesForm(data, accounts) {
	const perms = data.permissions || "---------";
	let html = '<form id="browsing-dialog-form" action="">';
	html += '<fieldset>';
	if (data.mime) {
		html += '<div class="control-group"><label for="mime">Mime:</label>';
		html += `<input type="text" name="mime" value="${escapeHtml(data.mime)}"/></div>`;
	}
	html += '<div class="control-group"><label for="owner">Owner:</label>';
	html += '<select name="owner">';
	(accounts.users || []).sort().forEach((u) => {
		html += `<option value="${escapeHtml(u)}"${u === data.owner ? ' selected="selected"' : ''}>${escapeHtml(u)}</option>`;
	});
	html += '</select></div>';
	html += '<div class="control-group"><label for="group">Group:</label>';
	html += '<select name="group">';
	(accounts.groups || []).sort().forEach((g) => {
		html += `<option value="${escapeHtml(g)}"${g === data.group ? ' selected="selected"' : ''}>${escapeHtml(g)}</option>`;
	});
	html += '</select></div>';
	html += '</fieldset>';
	html += '<fieldset><legend>Permissions</legend>';
	html += '<table><tr><th>User</th><th>Group</th><th>Other</th></tr>';
	html += '<tr>';
	html += `<td>${permCheckbox("ur", perms, 0, "r")}<label for="ur">read</label></td>`;
	html += `<td>${permCheckbox("gr", perms, 3, "r")}<label for="gr">read</label></td>`;
	html += `<td>${permCheckbox("or", perms, 6, "r")}<label for="or">read</label></td>`;
	html += '</tr><tr>';
	html += `<td>${permCheckbox("uw", perms, 1, "w")}<label for="uw">write</label></td>`;
	html += `<td>${permCheckbox("gw", perms, 4, "w")}<label for="gw">write</label></td>`;
	html += `<td>${permCheckbox("ow", perms, 7, "w")}<label for="ow">write</label></td>`;
	html += '</tr><tr>';
	html += `<td>${permCheckbox("ux", perms, 2, "x")}<label for="ux">execute</label></td>`;
	html += `<td>${permCheckbox("gx", perms, 5, "x")}<label for="gx">execute</label></td>`;
	html += `<td>${permCheckbox("ox", perms, 8, "x")}<label for="ox">execute</label></td>`;
	html += '</tr><tr>';
	html += `<td>${permCheckbox("us", perms, 2, "s")}<label for="us">setuid</label></td>`;
	html += `<td>${permCheckbox("gs", perms, 5, "s")}<label for="gs">setgid</label></td>`;
	html += `<td>${permCheckbox("ot", perms, 8, "t")}<label for="ot">sticky</label></td>`;
	html += '</tr></table></fieldset></form>';
	return html;
}

// ── Actions ──────────────────────────────────────────────────────────
function createCollection(d, el) {
	if (!eXide.app.$checkLogin()) return;
	Dialog.input("Create Collection",
		'<label for="dir-new-collection">Name: </label>' +
		'<input type="text" name="collection" id="dir-new-collection"/>',
		async () => {
			const name = document.getElementById("dir-new-collection").value;
			if (!name) return;
			const r = await fetch(apiPath(d.key), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "create", name })
			});
			const data = await r.json();
			if (data.error) {
				Dialog.warning("Create Collection Error", data.error);
			} else {
				reloadNode(d, el);
				if (flatViewActive) loadFlatView(flatCollection);
				eXide.app.syncManager(d.key);
			}
		},
		{ action: "Create" }
	);
}

function createResource(d) {
	eXide.app.newDocumentFromTemplate();
}

function uploadToCollection(d, el) {
	if (!eXide.app.$checkLogin()) return;
	const input = document.createElement("input");
	input.type = "file";
	input.multiple = true;
	input.addEventListener("change", async () => {
		const files = Array.from(input.files);
		if (files.length === 0) return;
		await uploadFiles(files, d.key);
		reloadNode(d, el);
		if (flatViewActive) loadFlatView(flatCollection);
		eXide.app.syncManager(d.key);
	});
	input.click();
}

function uploadFiles(files, collection) {
	const promises = files.map(async (file) => {
		const name = file.webkitRelativePath || file.name;
		const path = `${collection}/${name}`;
		const r = await fetch(apiPath(path), {
			method: "PUT",
			headers: { "Content-Type": file.type || "application/octet-stream" },
			body: file
		});
		return r.json();
	});
	return Promise.all(promises);
}

function downloadItem(d) {
	eXide.app.download(d.key);
}

function renameItem(d, el) {
	if (!eXide.app.$checkLogin()) return;
	const spanEl = el.querySelector("span");
	if (!spanEl) return;

	const oldName = d.name;
	spanEl.style.display = "none";

	const input = document.createElement("input");
	input.type = "text";
	input.className = "inline-edit";
	input.value = oldName;
	el.appendChild(input);
	input.focus();
	input.select();

	async function finish(save) {
		const newName = input.value.trim();
		input.remove();
		spanEl.style.display = "";
		if (save && newName && newName !== oldName) {
			const parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
			const r = await fetch(apiPath(d.key), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "rename", target: newName })
			});
			const data = await r.json();
			if (data.error) {
				Dialog.warning("Rename Error", data.error);
			} else {
				// Reload the parent in tree view
				const parentSel = d3.select(`[data-key='${parentKey}']`);
				if (!parentSel.empty()) {
					build.call(parentSel);
				}
				// Refresh flat view if active
				if (flatViewActive) loadFlatView(flatCollection);
				eXide.app.syncManager(parentKey);
			}
		}
	}

	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") { e.preventDefault(); finish(true); }
		if (e.key === "Escape") { e.preventDefault(); finish(false); }
	});
	input.addEventListener("blur", () => { finish(true); });
}

function deleteItem(d, el) {
	if (!eXide.app.$checkLogin()) return;
	const label = d.isCollection ? "collection" : "resource";
	Dialog.input("Confirm Deletion",
		`Are you sure you want to delete ${label} <strong>${d.name}</strong>?`,
		async () => {
			const r = await fetch(apiPath(d.key), { method: "DELETE" });
			const data = await r.json();
			if (data.error) {
				Dialog.warning("Delete Error", data.error);
			} else {
				// Reload the parent collection in tree view
				const parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
				const parentSel = d3.select(`[data-key='${parentKey}']`);
				if (!parentSel.empty()) {
					build.call(parentSel);
				}
				// Refresh flat view if active
				if (flatViewActive) loadFlatView(flatCollection);
				eXide.app.syncManager(parentKey);
			}
		},
		{ action: "Delete", destructive: true }
	);
}

function copyPath(d) {
	if (navigator.clipboard) {
		navigator.clipboard.writeText(d.key);
	}
}

let propertiesDialog = null;
let propertiesTarget = null;

function showProperties(d) {
	if (!eXide.app.$checkLogin()) return;
	const contentEl = document.getElementById("resource-properties-content");
	if (!contentEl) return;
	const propsPromise = fetch(apiPath(d.key)).then((r) => { return r.json(); });
	const accountsPromise = fetch("api/admin/accounts").then((r) => { return r.ok ? r.json() : { users: [], groups: [] }; }).catch(() => { return { users: [], groups: [] }; });
	Promise.all([propsPromise, accountsPromise]).then((results) => {
		const data = results[0];
		const accounts = results[1];
		contentEl.innerHTML = buildPropertiesForm(data, accounts);
	});

	const dialog = document.getElementById("resource-properties-dialog");
	if (!dialog) return;
	propertiesTarget = d;
	if (!propertiesDialog) {
		// Created once and reused; Apply acts on whichever item it was last opened for.
		propertiesDialog = DialogManager.create(dialog, {
			title: "Properties",
			modal: true,
			width: 500,
			buttons: {
				"Cancel"() { this.close(); },
				"Apply"() {
					applyProperties(propertiesTarget, dialog, this);
				}
			}
		});
	}
	propertiesDialog.open();
}

async function applyProperties(d, dialog, dlg) {
	const form = dialog.querySelector("form");
	if (!form) return;
	const body = {};
	const owner = form.querySelector("select[name='owner']");
	if (owner) body.owner = owner.value;
	const group = form.querySelector("select[name='group']");
	if (group) body.group = group.value;
	body.mode = permissionsFromForm(form);
	const mime = form.querySelector("[name='mime']");
	if (mime) body.mime = mime.value;

	const r = await fetch(apiPath(d.key), {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body)
	});
	const data = await r.json();
	if (data.error) {
		Dialog.warning("Properties Error", data.error);
	} else {
		dlg.close();
	}
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
	const directoryBody = document.getElementById("directory-body");
	if (!directoryBody) return;

	directoryBody.addEventListener("dragover", (e) => {
		e.preventDefault();
		e.stopPropagation();
		const target = findDropTarget(e.target);
		clearDropHighlight();
		if (target) target.classList.add("ctx-highlight");
		e.dataTransfer.dropEffect = "copy";
	});

	directoryBody.addEventListener("dragleave", (e) => {
		e.preventDefault();
		e.stopPropagation();
		clearDropHighlight();
	});

	directoryBody.addEventListener("drop", async (e) => {
		e.preventDefault();
		e.stopPropagation();
		clearDropHighlight();

		const target = findDropTarget(e.target);
		if (!target) return;

		const sel = d3.select(target);
		const d = sel.datum();
		if (!d || !d.isCollection) return;

		if (!eXide.app.$checkLogin()) return;

		const files = Array.from(e.dataTransfer.files);
		if (files.length === 0) return;

		await uploadFiles(files, d.key);
		reloadNode(d, target);
		eXide.app.syncManager(d.key);
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
	document.querySelectorAll(".ctx-highlight").forEach((el) => {
		el.classList.remove("ctx-highlight");
	});
}

// ── Flat (folder) view ───────────────────────────────────────────────
function initFlatView() {
	const toggleBtn = document.getElementById("toggle-dir-view");
	if (toggleBtn) {
		toggleBtn.addEventListener("click", () => {
			const newView = flatViewActive ? "tree" : "folder";
			if (typeof eXide !== 'undefined' && eXide.app && eXide.app.setCollectionsView) {
				eXide.app.setCollectionsView(newView);
			}
			// Persist to preferences
			if (typeof eXide !== 'undefined' && eXide.app && eXide.app.getPreference) {
				try {
					const prefs = JSON.parse(localStorage.getItem('eXide.preferences') || '{}');
					prefs.collectionsView = newView;
					localStorage.setItem('eXide.preferences', JSON.stringify(prefs));
				} catch {
					// Storage unavailable (e.g. private mode); the view still switches.
				}
			}
		});
	}

	// Refresh button
	const refreshBtn = document.getElementById("refresh-dir");
	if (refreshBtn) {
		refreshBtn.addEventListener("click", () => {
			if (flatViewActive) {
				loadFlatView(flatCollection);
			} else {
				// Reload tree view root
				const rootSel = d3.select("#tree-root");
				if (!rootSel.empty()) {
					const d = rootSel.datum();
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
	const flatView = document.getElementById("dir-flat-view");
	if (flatView) {
		flatView.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();
			const target = findFlatDropTarget(e.target);
			if (target) target.classList.add("ctx-highlight");
			e.dataTransfer.dropEffect = "copy";
		});
		flatView.addEventListener("dragleave", (e) => {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();
		});
		flatView.addEventListener("drop", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();
			if (!eXide.app.$checkLogin()) return;
			const files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;
			// Drop on a collection item uploads there; otherwise use current collection
			const target = findFlatDropTarget(e.target);
			let targetKey = flatCollection;
			if (target && target._flatItem && target._flatItem.isCollection) {
				targetKey = target._flatItem.key;
			}
			await uploadFiles(files, targetKey);
			loadFlatView(flatCollection);
			eXide.app.syncManager(targetKey);
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

async function loadFlatView(collection) {
	flatCollection = collection;
	updateFlatBreadcrumbs(collection);
	const list = document.getElementById("dir-flat-list");
	if (!list) return;
	list.innerHTML = '<li class="dir-flat-loading">Loading\u2026</li>';

	try {
		const r = await fetch(apiPath(collection));
		if (!r.ok) {
			let e;
			try {
				e = await r.json();
			} catch {
				throw new Error(`HTTP ${r.status}`);
			}
			throw new Error(e && e.error ? e.error : `HTTP ${r.status}`);
		}
		const data = await r.json();
		list.innerHTML = "";
		const items = (data.items || []).map(mapItem);
		// Add parent link if not at /db
		if (collection !== "/db") {
			items.unshift({ name: "..", isCollection: true, key: collection.substring(0, collection.lastIndexOf("/")) || "/db" });
		}
		if (items.length === 0) {
			list.innerHTML = '<li class="dir-flat-empty">Empty collection</li>';
			return;
		}
		items.forEach((item) => {
			if (item.name === "..") {
				const li = document.createElement("li");
				li.className = "dir-flat-item dir-flat-collection";
				li.innerHTML = '<i class="fa fa-folder"></i> <span>..</span>';
				li.addEventListener("click", () => {
					loadFlatView(item.key);
				});
				list.appendChild(li);
				return;
			}
			const li = document.createElement("li");
			const isOpen = !item.isCollection && !!eXide.app.getEditor().getDocument(item.key);
			li.className = `dir-flat-item${item.isCollection ? " dir-flat-collection" : ""}${isOpen ? " open" : ""}`;
			const iconClass = item.isCollection ? "fa fa-folder" : `fa ${fileIcon(item)}`;
			li.innerHTML = `<i class="${iconClass}"></i> <span>${escapeHtml(item.name)}</span>`;
			if (item.isCollection) {
				li._flatItem = item;
				li.addEventListener("click", () => {
					loadFlatView(item.key);
				});
			} else {
				li.addEventListener("click", () => {
					eXide.app.$doOpenDocument({ name: item.name, path: item.key, writable: item.writable });
				});
			}
			(function(itemData, liEl) {
				liEl.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					e.stopPropagation();
					showContextMenu(itemData, e, liEl);
				});
			})(item, li);
			list.appendChild(li);
		});
	} catch (err) {
		list.innerHTML = `<li class="dir-flat-empty">Could not open collection: ${escapeHtml(err && err.message ? err.message : "Failed to load")}</li>`;
	}
}

function updateFlatBreadcrumbs(collection) {
	const bc = document.getElementById("dir-flat-breadcrumbs");
	if (!bc) return;
	bc.innerHTML = "";
	const parts = collection.split("/").filter((p) => { return p.length > 0; });
	let path = "";
	for (let i = 0; i < parts.length; i++) {
		path += `/${parts[i]}`;
		const sep = document.createElement("span");
		sep.className = "dir-bc-sep";
		sep.textContent = "/";
		bc.appendChild(sep);
		const a = document.createElement("a");
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
	const d = document.createElement("div");
	d.textContent = str;
	return d.innerHTML;
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").Directory = Directory;
