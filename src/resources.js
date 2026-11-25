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
import { Sender } from "./events.js";
import { Dialog, util } from "./util.js";

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
	// special bits: setuid, setgid, sticky
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
		html += `<input type="text" name="mime" value="${data.mime}"/></div>`;
	}
	html += '<div class="control-group"><label for="owner">Owner:</label>';
	html += '<select name="owner">';
	(accounts.users || []).sort().forEach((u) => {
		html += `<option value="${u}"${u === data.owner ? ' selected="selected"' : ''}>${u}</option>`;
	});
	html += '</select></div>';
	html += '<div class="control-group"><label for="group">Group:</label>';
	html += '<select name="group">';
	(accounts.groups || []).sort().forEach((g) => {
		html += `<option value="${g}"${g === data.group ? ' selected="selected"' : ''}>${g}</option>`;
	});
	html += '</select></div>';
	html += '</fieldset>';
	html += '<fieldset><legend>Permissions</legend>';
	html += '<table><tr><th>User</th><th>Group</th><th>Other</th></tr>';
	// read row
	html += '<tr>';
	html += `<td>${permCheckbox("ur", perms, 0, "r")}<label for="ur">read</label></td>`;
	html += `<td>${permCheckbox("gr", perms, 3, "r")}<label for="gr">read</label></td>`;
	html += `<td>${permCheckbox("or", perms, 6, "r")}<label for="or">read</label></td>`;
	html += '</tr>';
	// write row
	html += '<tr>';
	html += `<td>${permCheckbox("uw", perms, 1, "w")}<label for="uw">write</label></td>`;
	html += `<td>${permCheckbox("gw", perms, 4, "w")}<label for="gw">write</label></td>`;
	html += `<td>${permCheckbox("ow", perms, 7, "w")}<label for="ow">write</label></td>`;
	html += '</tr>';
	// execute row
	html += '<tr>';
	html += `<td>${permCheckbox("ux", perms, 2, "x")}<label for="ux">execute</label></td>`;
	html += `<td>${permCheckbox("gx", perms, 5, "x")}<label for="gx">execute</label></td>`;
	html += `<td>${permCheckbox("ox", perms, 8, "x")}<label for="ox">execute</label></td>`;
	html += '</tr>';
	// setuid/setgid/sticky row
	html += '<tr>';
	html += `<td>${permCheckbox("us", perms, 2, "s")}<label for="us">setuid</label></td>`;
	html += `<td>${permCheckbox("gs", perms, 5, "s")}<label for="gs">setgid</label></td>`;
	html += `<td>${permCheckbox("ot", perms, 8, "t")}<label for="ot">sticky</label></td>`;
	html += '</tr>';
	html += '</table></fieldset></form>';
	return html;
}

function mapItem(item) {
	return {
		name: item.name,
		key: item.path,
		isCollection: item.isCollection,
		writable: item.writable,
		mime: item.mime,
		permissions: item.permissions,
		owner: item.owner,
		group: item.group,
		"last-modified": item.lastModified
	};
}

/**
 * Manages a table view of resources within a collection.
 * Replaces AG Grid with a vanilla HTML table and scroll-based lazy loading.
 */
const useragent = { isMac: /Mac/.test(navigator.platform) };
const BATCH_SIZE = 50;

function fileIcon(item) {
	const mime = item.mime || "";
	if (mime) {
		if (mime === "application/pdf") return "fa-file-pdf-o";
		if (/^image\//.test(mime)) return "fa-file-image-o";
		if (/xml|html/.test(mime)) return "fa-file-code-o";
		if (/^text\/|javascript|json|css/.test(mime)) return "fa-file-text-o";
		if (/zip|compress|archive|xar|jar/.test(mime)) return "fa-file-archive-o";
	}
	const name = item.name || "";
	if (/\.(xml|xq|xquery|xql|xqm|xconf|xhtml|html|htm|svg|xsl|xslt|odd|rng|sch|wsdl)$/i.test(name)) return "fa-file-code-o";
	if (/\.(css|less|scss|js|json|md|txt|csv|properties)$/i.test(name)) return "fa-file-text-o";
	if (/\.(png|jpe?g|gif|ico|webp|bmp|tiff?)$/i.test(name)) return "fa-file-image-o";
	if (/\.pdf$/i.test(name)) return "fa-file-pdf-o";
	if (/\.(zip|tar|gz|xar|jar|war|ear)$/i.test(name)) return "fa-file-archive-o";
	return "fa-file-o";
}

export class ResourceBrowser extends Sender {
    constructor(container, parentContainer) {
		super();
		const self = this;
		this.container = typeof container === "string" ? document.querySelector(container) : container;
        this.breadcrumbs = parentContainer.querySelector(".eXide-browse-breadcrumbs");
		this.loading = false;
		this.search = "";
        this.clipboard = [];
        this.clipboardMode = "copy";
		this.events = {
			"activate": [],
			"activateCollection": [],
			"activateParent": []
		};
        this.mode = "save";
        this.inEditor = false;

		this.data = [];
		this.totalRows = 0;
		this._collection = "/db";
		this._filter = "";
		this._focusedRow = -1;
		this._selectedIndices = new Set();
		this._rowSelection = "multiple";

		const wrapper = document.querySelector(".eXide-browse-resources");
		wrapper.innerHTML = "";

		// Filter input
		this.filterInput = document.createElement("input");
		this.filterInput.type = "text";
		this.filterInput.className = "browse-filter";
		this.filterInput.placeholder = "Filter by name…";
		this.filterInput.addEventListener("input", () => {
			self._filter = self.filterInput.value;
			self._resetAndLoad();
		});
		wrapper.appendChild(this.filterInput);

		// Scrollable table container
		this.scrollContainer = document.createElement("div");
		this.scrollContainer.className = "browse-table-scroll";
		this.scrollContainer.tabIndex = 0;
		wrapper.appendChild(this.scrollContainer);

		this.table = document.createElement("table");
		this.table.className = "browse-table";

		const thead = document.createElement("thead");
		thead.innerHTML = "<tr>" +
			"<th class=\"col-name\">Name</th>" +
			"<th class=\"col-permissions\">Permissions</th>" +
			"<th class=\"col-owner\">Owner</th>" +
			"<th class=\"col-group\">Group</th>" +
			"<th class=\"col-lastmod\">Last Modified</th>" +
			"</tr>";
		this.table.appendChild(thead);

		// Column resize handles
		thead.querySelectorAll("th").forEach((th) => {
			const handle = document.createElement("div");
			handle.className = "col-resize-handle";
			th.appendChild(handle);
			th.style.position = "relative";
			let startX, startWidth;
			handle.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.stopPropagation();
				startX = e.clientX;
				startWidth = th.offsetWidth;
				function onMove(e) {
					const newWidth = Math.max(40, startWidth + e.clientX - startX);
					th.style.width = `${newWidth}px`;
				}
				function onUp() {
					document.removeEventListener("mousemove", onMove);
					document.removeEventListener("mouseup", onUp);
				}
				document.addEventListener("mousemove", onMove);
				document.addEventListener("mouseup", onUp);
			});
		});

		this.tbody = document.createElement("tbody");
		this.table.appendChild(this.tbody);
		this.scrollContainer.appendChild(this.table);

		// Sentinel element for infinite scroll
		this.sentinel = document.createElement("div");
		this.sentinel.className = "browse-sentinel";
		this.scrollContainer.appendChild(this.sentinel);

		this._setupIntersectionObserver();
		this._setupKeyboardNav();
		this._setupClickHandlers();
		this._setupContextMenu();
		this._setupDragDrop();

        const propsDialogEl = document.getElementById("resource-properties-dialog");
        this.propertiesDialog = DialogManager.create(propsDialogEl, {
            title: "Properties",
            modal: true,
            height: 380,
            width: 460,
            buttons: {
                "Cancel" () { this.close(); },
                async "Apply"() {
                    const dlg = this;
                    const selected = self.getSelectedRows();
                    if (selected.length === 0) {
                        return;
                    }
                    const resources = [];
                    for (let i = 0; i < selected.length; i++) {
                        resources.push(selected[i].key);
                    }
                    const form = propsDialogEl.querySelector("form");
                    const body = {};
                    const ownerEl = form.querySelector("select[name='owner']");
                    if (ownerEl) body.owner = ownerEl.value;
                    const groupEl = form.querySelector("select[name='group']");
                    if (groupEl) body.group = groupEl.value;
                    const mimeEl = form.querySelector("[name='mime']");
                    if (mimeEl) body.mime = mimeEl.value;
                    // Build permissions mode from checkboxes
                    body.mode = permissionsFromForm(form);

                    const promises = resources.map(async (r) => {
                        const response = await fetch(apiPath(r), {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body)
                        });
                        return response.json();
                    });
                    await Promise.all(promises);
                    dlg.close();
                    self.reload();
                }
            }
        });
	}

    _setupIntersectionObserver() {
		const self = this;
		this._observer = new IntersectionObserver(((entries) => {
			if (entries[0].isIntersecting && !self.loading && self.data.length < self.totalRows) {
				self._loadBatch(self.data.length);
			}
		}), { root: this.scrollContainer, threshold: 0.1 });
		this._observer.observe(this.sentinel);
	}

    _setupClickHandlers() {
		const self = this;
		this.tbody.addEventListener("click", (e) => {
			const tr = e.target.closest("tr");
			if (!tr || !tr.dataset.index) return;
			const idx = parseInt(tr.dataset.index, 10);
			if (self._rowSelection === "multiple" && (e.ctrlKey || e.metaKey)) {
				if (self._selectedIndices.has(idx)) {
					self._selectedIndices.delete(idx);
				} else {
					self._selectedIndices.add(idx);
				}
			} else if (self._rowSelection === "multiple" && e.shiftKey && self._focusedRow >= 0) {
				const start = Math.min(self._focusedRow, idx);
				const end = Math.max(self._focusedRow, idx);
				self._selectedIndices.clear();
				for (let i = start; i <= end; i++) {
					self._selectedIndices.add(i);
				}
			} else {
				self._selectedIndices.clear();
				self._selectedIndices.add(idx);
			}
			self._focusedRow = idx;
			self._updateSelectionDisplay();
			self._fireSelectionChanged();
			self.scrollContainer.focus();
		});

		this.tbody.addEventListener("dblclick", (e) => {
			const tr = e.target.closest("tr");
			if (!tr || !tr.dataset.index) return;
			const idx = parseInt(tr.dataset.index, 10);
			const item = self.data[idx];
			if (!item) return;
			if (item.isCollection) {
				let coll;
				if (item.name === "..")
					coll = self._collection.replace(/\/[^/]+$/, "");
				else coll = item.key;
				self.$triggerEvent("activateCollection", [coll, item.writable]);
				self.update(coll, false);
			} else {
				eXide.app.openSelectedDocument({
					name: item.name,
					path: item.key,
					writable: item.writable
				});
			}
		});
	}

    _setupContextMenu() {
		const self = this;
		const ctxMenu = document.getElementById("browse-context-menu");
		if (!ctxMenu) return;

		this._browseCtxMenu = ctxMenu;
		this._browseCtxItem = null;

		this.tbody.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const tr = e.target.closest("tr");
			if (!tr || !tr.dataset.index) return;
			const idx = parseInt(tr.dataset.index, 10);
			const item = self.data[idx];
			if (!item) return;

			self._browseCtxItem = item;

			// Select the row
			self._selectedIndices.clear();
			self._selectedIndices.add(idx);
			self._focusedRow = idx;
			self._updateSelectionDisplay();
			self._fireSelectionChanged();

			// Enable/disable items
			const isCollection = item.isCollection;
			const isParent = item.name === "..";
			ctxMenu.querySelector('[data-action="open"]').classList.toggle("disabled", !isCollection);
			ctxMenu.querySelector('[data-action="create"]').classList.toggle("disabled", !isCollection);
			ctxMenu.querySelector('[data-action="upload"]').classList.toggle("disabled", !isCollection);
			ctxMenu.querySelector('[data-action="rename"]').classList.toggle("disabled", isParent);
			ctxMenu.querySelector('[data-action="delete"]').classList.toggle("disabled", isParent);
			ctxMenu.querySelector('[data-action="properties"]').classList.toggle("disabled", isParent);
			ctxMenu.querySelector('[data-action="paste"]').classList.toggle("disabled", self.clipboard.length === 0);

			// Position
			const x = e.clientX;
			const y = e.clientY;
			ctxMenu.style.left = `${x}px`;
			ctxMenu.style.top = `${y}px`;
			ctxMenu.classList.add("visible");

			const rect = ctxMenu.getBoundingClientRect();
			if (rect.right > window.innerWidth) ctxMenu.style.left = `${x - rect.width}px`;
			if (rect.bottom > window.innerHeight) ctxMenu.style.top = `${y - rect.height}px`;
		});

		ctxMenu.addEventListener("click", (e) => {
			const menuItem = e.target.closest(".ctx-item");
			if (!menuItem || menuItem.classList.contains("disabled")) return;
			const action = menuItem.dataset.action;
			ctxMenu.classList.remove("visible");
			const item = self._browseCtxItem;
			if (!item) return;
			switch (action) {
				case "open":
					if (item.isCollection) {
						const coll = item.name === ".." ? self._collection.replace(/\/[^/]+$/, "") : item.key;
						self.$triggerEvent("activateCollection", [coll, item.writable]);
						self.update(coll, false);
					}
					break;
				case "create": self.createCollection(); break;
				case "upload":
					if (typeof self._browseUploadCallback === "function") self._browseUploadCallback();
					break;
				case "download": eXide.app.download(item.key); break;
				case "rename": self.startEditing(); break;
				case "copy": self.copy(); break;
				case "cut": self.cut(); break;
				case "paste": self.paste(); break;
				case "delete": self.deleteResource(item); break;
				case "copy-path":
					if (navigator.clipboard) navigator.clipboard.writeText(item.key);
					break;
				case "properties": self.properties(); break;
			}
		});

		document.addEventListener("click", () => { ctxMenu.classList.remove("visible"); });
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") ctxMenu.classList.remove("visible");
		});
	}

    _setupDragDrop() {
		const self = this;

		this.scrollContainer.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
			// Highlight collection row if hovering over one
			self.tbody.querySelectorAll("tr.drag-highlight").forEach((el) => {
				el.classList.remove("drag-highlight");
			});
			const tr = e.target.closest("tr");
			if (tr && tr.dataset.index) {
				const idx = parseInt(tr.dataset.index, 10);
				const item = self.data[idx];
				if (item && item.isCollection && item.name !== "..") {
					tr.classList.add("drag-highlight");
				}
			}
			e.dataTransfer.dropEffect = "copy";
		});

		this.scrollContainer.addEventListener("dragleave", (e) => {
			e.preventDefault();
			e.stopPropagation();
			self.tbody.querySelectorAll("tr.drag-highlight").forEach((el) => {
				el.classList.remove("drag-highlight");
			});
		});

		this.scrollContainer.addEventListener("drop", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			self.tbody.querySelectorAll("tr.drag-highlight").forEach((el) => {
				el.classList.remove("drag-highlight");
			});

			if (!eXide.app.$checkLogin()) return;
			const files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;

			// Determine target collection
			let targetKey = self._collection;
			const tr = e.target.closest("tr");
			if (tr && tr.dataset.index) {
				const idx = parseInt(tr.dataset.index, 10);
				const item = self.data[idx];
				if (item && item.isCollection && item.name !== "..") {
					targetKey = item.key;
				}
			}

			// Upload files
			const promises = files.map(async (file) => {
				const filePath = `${targetKey}/${file.webkitRelativePath || file.name}`;
				const response = await fetch(apiPath(filePath), {
					method: "PUT",
					headers: { "Content-Type": file.type || "application/octet-stream" },
					body: file
				});
				return response.json();
			});
			await Promise.all(promises);
			self.reload();
			util.message(`${files.length} file(s) uploaded to ${targetKey}`);
		});
	}

    _setupKeyboardNav() {
		const self = this;
		this.scrollContainer.addEventListener("keydown", (e) => {
			if (self.inEditor) return;

			if ((e.metaKey && useragent.isMac) || (e.ctrlKey && !useragent.isMac)) {
				switch (e.which) {
					case 67: // cmd-c
						e.stopPropagation(); e.preventDefault();
						self.copy();
						return;
					case 86: // cmd-v
						e.stopPropagation(); e.preventDefault();
						self.paste();
						return;
					case 88: // cmd-x
						e.stopPropagation(); e.preventDefault();
						self.cut();
						return;
				}
			}

			if (e.shiftKey || e.altKey || e.ctrlKey) return;

			switch (e.which) {
				case 38: // up arrow
					e.stopPropagation(); e.preventDefault();
					if (self._focusedRow > 0) {
						self._focusedRow--;
						self._selectedIndices.clear();
						self._selectedIndices.add(self._focusedRow);
						self._updateSelectionDisplay();
						self._scrollRowIntoView(self._focusedRow);
						self._fireSelectionChanged();
					}
					break;
				case 40: // down arrow
					e.stopPropagation(); e.preventDefault();
					if (self._focusedRow < self.data.length - 1) {
						self._focusedRow++;
						self._selectedIndices.clear();
						self._selectedIndices.add(self._focusedRow);
						self._updateSelectionDisplay();
						self._scrollRowIntoView(self._focusedRow);
						self._fireSelectionChanged();
					}
					break;
				case 13: { // enter
						e.stopPropagation(); e.preventDefault();
						const item = self.data[self._focusedRow];
						if (!item) break;
						if (item.isCollection) {
							let coll;
							if (item.name === "..")
								coll = self._collection.replace(/\/[^/]+$/, "");
							else
								coll = item.key;
							self.$triggerEvent("activateCollection", [coll, item.writable]);
							self.update(coll, false);
						} else {
							eXide.app.openSelectedDocument({
								name: item.name,
								path: item.key,
								writable: item.writable,
							});
						}
						break;
				}
				case 8: { // backspace
						e.stopPropagation(); e.preventDefault();
						const p = self._collection.lastIndexOf("/");
						if (p > 0 && self._collection !== "/db") {
							const parent = self._collection.substring(0, p);
							self.$triggerEvent("activateCollection", [parent, true]);
							self.update(parent, false);
						}
						break;
				}
				case 36: // home
					e.stopPropagation(); e.preventDefault();
					self.goto(0);
					break;
				case 35: // end
					e.stopPropagation(); e.preventDefault();
					self.goto(self.data.length - 1);
					break;
				case 46: // delete
					if (self._focusedRow >= 0) {
						self.deleteResource(self.data[self._focusedRow]);
					}
					break;
				case 27: // escape
					self.search = "";
					break;
				case 33: // page up
				case 34: // page down
					break;
				default: {
						e.stopPropagation(); e.preventDefault();
						self.search += e.key;
						if (self.searchTimeout) {
							clearTimeout(self.searchTimeout);
							self.searchTimeout = undefined;
						}
						const regex = new RegExp(`^${self.search}`, "i");
						for (let i = self._focusedRow; i < self.data.length; i++) {
							if (self.data[i] && regex.test(self.data[i].name)) {
								self._focusedRow = i;
								self._selectedIndices.clear();
								self._selectedIndices.add(i);
								self._updateSelectionDisplay();
								self._scrollRowIntoView(i);
								self._fireSelectionChanged();
								break;
							}
						}
						self.searchTimeout = setTimeout(() => {
							self.search = "";
						}, 2000);
						break;
				}
			}
		});
	}

    _resetAndLoad() {
		this.data = [];
		this.totalRows = 0;
		this._focusedRow = -1;
		this._selectedIndices.clear();
		this.tbody.innerHTML = "";
		this._loadBatch(0);
	}

    async _loadBatch(startRow) {
		const self = this;
		if (this.loading) return;
		this.loading = true;

		const params = new URLSearchParams();
		params.set("start", startRow + 1);
		params.set("count", BATCH_SIZE);
		if (this._filter) {
			params.set("filter", this._filter);
		}
		try {
			const r = await fetch(`${apiPath(this._collection)}?${params.toString()}`);
			if (!r.ok) {
				let e;
				try {
					e = await r.json();
				} catch {
					throw new Error(`HTTP ${r.status}`);
				}
				throw new Error(e && e.error ? e.error : `HTTP ${r.status}`);
			}
			const json = await r.json();
			self.loading = false;
			if (!json || !json.items) return;

			// Add parent ".." entry at position 0 when at start
			const items = json.items.map(mapItem);
			if (startRow === 0 && self._collection !== "/db") {
				items.unshift({ name: "..", key: "", isCollection: true });
				self.totalRows = json.total + 1;
			} else {
				self.totalRows = json.total + (self._collection !== "/db" ? 1 : 0);
			}

			for (let i = 0; i < items.length; i++) {
				const rowIdx = startRow + i;
				self.data[rowIdx] = items[i];
				self._renderRow(items[i], rowIdx);
			}

			if (startRow === 0 && items.length > 0) {
				self._focusedRow = 0;
				self._selectedIndices.clear();
				self._selectedIndices.add(0);
				self._updateSelectionDisplay();
				self._fireSelectionChanged();
			}
		} catch (err) {
			self.loading = false;
			util.error(`Could not list collection: ${err && err.message ? err.message : err}`);
		}
	}

    _renderRow(item, index) {
		const tr = document.createElement("tr");
		tr.dataset.index = index;
		tr.dataset.key = item.key || "";

		const tdName = document.createElement("td");
		tdName.className = "col-name";
		if (item.isCollection) tdName.classList.add("collection");
		const icon = document.createElement("i");
		icon.className = item.isCollection
			? "fa fa-folder browse-icon"
			: `fa ${fileIcon(item)} browse-icon`;
		tdName.appendChild(icon);
		tdName.appendChild(document.createTextNode(item.name));

		const tdPerm = document.createElement("td");
		tdPerm.className = "col-permissions";
		tdPerm.textContent = item.permissions || "";

		const tdOwner = document.createElement("td");
		tdOwner.className = "col-owner";
		tdOwner.textContent = item.owner || "";

		const tdGroup = document.createElement("td");
		tdGroup.className = "col-group";
		tdGroup.textContent = item.group || "";

		const tdMod = document.createElement("td");
		tdMod.className = "col-lastmod";
		tdMod.textContent = item["last-modified"] || "";

		tr.appendChild(tdName);
		tr.appendChild(tdPerm);
		tr.appendChild(tdOwner);
		tr.appendChild(tdGroup);
		tr.appendChild(tdMod);
		this.tbody.appendChild(tr);
	}

    _updateSelectionDisplay() {
		const rows = this.tbody.querySelectorAll("tr");
		for (let i = 0; i < rows.length; i++) {
			const idx = parseInt(rows[i].dataset.index, 10);
			if (this._selectedIndices.has(idx)) {
				rows[i].classList.add("selected");
				rows[i].setAttribute("aria-selected", "true");
			} else {
				rows[i].classList.remove("selected");
				rows[i].removeAttribute("aria-selected");
			}
			if (idx === this._focusedRow) {
				rows[i].classList.add("focused");
			} else {
				rows[i].classList.remove("focused");
			}
		}
	}

    _scrollRowIntoView(index) {
		const row = this.tbody.querySelector(`tr[data-index="${index}"]`);
		if (row) {
			row.scrollIntoView({ block: "nearest" });
		}
	}

    _fireSelectionChanged() {
		const rows = this.getSelectedRows();
		let enableWrite = true;
		for (let i = 0; i < rows.length; i++) {
			if (!rows[i].writable) {
				enableWrite = false;
				break;
			}
		}
		const doc = (rows.length === 1 && !rows[0].isCollection) ? rows[0] : null;
		this.$triggerEvent("activate", [doc, enableWrite]);
	}

    getSelectedRows() {
		const result = [];
		const self = this;
		this._selectedIndices.forEach((idx) => {
			if (self.data[idx]) result.push(self.data[idx]);
		});
		return result;
	}

    setCollection(collection) {
        this._collection = collection;
		this._filter = "";
		this.filterInput.value = "";
        this._resetAndLoad();
        this.updateBreadcrumbs();
    }

    updateBreadcrumbs() {
        this.breadcrumbs.innerHTML = "";
        const self = this;
        let parts = this._collection.split("/");
		parts = parts.map(part => decodeURI(part));
        const span = document.createElement("span");
        span.appendChild(document.createTextNode("/"));
        let path = "/";
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part && part.length > 0) {
                path += `${part}/`;
                const a = document.createElement("a");
                a.href = "#";
                a.textContent = part;
                a.dataset.collection = path;
                a.addEventListener("click", function(ev) {
                    ev.preventDefault();
                    self.update(this.dataset.collection, false);
                });
                span.appendChild(a);
                span.appendChild(document.createTextNode("/"));
            }
        }
        this.breadcrumbs.appendChild(span);
    }

    setMode(value) {
        this.mode = value;
		this._rowSelection = (value === "manage") ? "multiple" : "single";
	}

    resize() {
		this.reload(true);
	}

    update(collection, reload) {
        if (!reload && collection === this._collection)
            return;
		console.log("Opening resources for %s", collection);
        this.setCollection(collection);
        document.querySelectorAll('input[name="collection"]').forEach((el) => {
            el.value = collection;
        });
        this.search = "";
	}

    hasSelection() {
		return this._selectedIndices.size > 0;
	}

    getSelected() {
		const rows = this.getSelectedRows();
		return rows.length > 0 ? rows : null;
    }

    startEditing() {
		if (this._focusedRow < 0) return;
		const item = this.data[this._focusedRow];
		if (!item) return;

		const self = this;
		this.inEditor = true;
		const row = this.tbody.querySelector(`tr[data-index="${this._focusedRow}"]`);
		if (!row) return;
		const cell = row.querySelector(".col-name");
		if (!cell) return;

		const oldValue = item.name;
		let finished = false;
		const input = document.createElement("input");
		input.type = "text";
		input.className = "browse-inline-edit";
		input.value = oldValue;
		cell.textContent = "";
		cell.appendChild(input);
		input.focus();
		input.select();

		function finish(commit) {
			if (finished) return;
			finished = true;
			const newValue = input.value;
			cell.textContent = commit && newValue ? newValue : oldValue;
			setTimeout(() => { self.inEditor = false; }, 200);
			if (commit && newValue && newValue !== oldValue) {
				const renamePath = `${self._collection}/${oldValue}`;
				fetch(apiPath(renamePath), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ action: "rename", target: newValue })
				}).then((r) => { return r.json(); })
				.then((data) => {
					if (data.error) {
						Dialog.warning("Rename Error", data.error);
					}
					self.reload();
				});
			}
			self.scrollContainer.focus();
		}

		input.addEventListener("keydown", (e) => {
			if (e.which === 13) { e.preventDefault(); finish(true); }
			if (e.which === 27) { e.preventDefault(); finish(false); }
		});
		input.addEventListener("blur", () => {
			finish(true);
		});
	}

    createCollection() {
    	const self = this;
		if (!eXide.app.$checkLogin())
			return;
		Dialog.input("Create Collection",
			"<label for=\"collection\">Name: </label>" +
			"<input type=\"text\" name=\"collection\" id=\"eXide-browse-collection-name\"/>",
			async () => {
			    const spinner = document.getElementById("eXide-browse-spinner");
			    spinner.style.display = "";
				const response = await fetch(apiPath(self._collection), {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "create",
						name: document.getElementById("eXide-browse-collection-name").value
					})
				});
				const data = await response.json();
				spinner.style.display = "none";
				if (data.error) {
					Dialog.warning("Create Collection Error", data.error);
				} else {
					self.reload();
				}
			},
			{ action: "Create" }
		);
	}

    deleteCollection() {
		const self = this;
		Dialog.input("Confirm Deletion", `Are you sure you want to delete collection ${self.selected}?`,
			async () => {
			    const spinner = document.getElementById("eXide-browse-spinner");
			    spinner.style.display = "";
				const response = await fetch(apiPath(self._collection), { method: "DELETE" });
				const data = await response.json();
				spinner.style.display = "none";
				if (data.error) {
					Dialog.warning("Delete Collection Error", data.error);
				} else {
					self.reload();
				}
		}, { action: "Delete", destructive: true });
	}

    deleteResource(row) {
		const selected = row ? [row] : this.getSelectedRows();
		if (selected.length === 0) {
			return;
		}
		const resources = [];
		for (let i = 0; i < selected.length; i++) {
			resources.push(selected[i].key);
		}
		console.log('resources to delete: %o', selected);
		const self = this;
		Dialog.input("Confirm Deletion", "Are you sure you want to delete the selected resources?",
				async () => {
				    const spinner = document.getElementById("eXide-browse-spinner");
				    spinner.style.display = "";
					const promises = resources.map(async (r) => {
						const resp = await fetch(apiPath(r), { method: "DELETE" });
						return resp.json();
					});
					const results = await Promise.all(promises);
					spinner.style.display = "none";
					self.reload();
					const err = results.find((d) => { return d.error; });
					if (err) {
						Dialog.warning("Delete Resource Error", err.error);
					}
		}, { action: "Delete", destructive: true });
	}

    properties() {
		if (!eXide.app.$checkLogin())
			return;
		const selected = this.getSelectedRows();
    	if (selected.length === 0) {
			return;
		}
		const resources = [];
		for (let i = 0; i < selected.length; i++) {
            if (selected[i].name !== "..") {
			    resources.push(selected[i].key);
            }
		}
        if (resources.length > 0) {
            const contentEl = document.getElementById("resource-properties-content");
            const propsPromise = fetch(apiPath(resources[0])).then((r) => { return r.json(); });
            const accountsPromise = fetch("api/admin/accounts").then((r) => { return r.ok ? r.json() : { users: [], groups: [] }; }).catch(() => { return { users: [], groups: [] }; });
            Promise.all([propsPromise, accountsPromise]).then((results) => {
                const data = results[0];
                const accounts = results[1];
                contentEl.innerHTML = buildPropertiesForm(data, accounts);
            });
            this.propertiesDialog.open();
        }
    }

    cut() {
        this.clipboardMode = "move";
        this.copy0();
    }

    copy() {
      this.clipboardMode = "copy";
      this.copy0();
    }

    copy0() {
		const selected = this.getSelectedRows();
		if (selected.length === 0) {
			return;
		}
        this.clipboard = [];
		for (let i = 0; i < selected.length; i++) {
            this.clipboard.push(selected[i].key);
		}
        console.log("Clipboard: %o", this.clipboard);
    }

    async paste() {
        const self = this;
        console.log("Pasting resources %o to %s in mode %s", this.clipboard, this._collection, this.clipboardMode);
        const response = await fetch(apiPath(this._collection), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: this.clipboardMode,
                sources: this.clipboard
            })
        });
        const data = await response.json();
        if (data.error) {
            Dialog.warning("Paste Error", data.error);
        } else {
            self.reload();
        }
    }

    goto(row) {
		if (row < 0 || row >= this.data.length) return;
		this._focusedRow = row;
		this._selectedIndices.clear();
		this._selectedIndices.add(row);
		this._updateSelectionDisplay();
		this._scrollRowIntoView(row);
		this._fireSelectionChanged();
    }

    focus() {
        this.scrollContainer.focus();
    }

    reload(skipSync) {
		this.update(this._collection, true);
		if (!skipSync) {
			eXide.app.syncDirectory(this._collection);
		}
	}
}

/**
 * File upload widget
 */
function isDirUploadSupported() {
    const tmpInput = document.createElement("input");
    return ("webkitdirectory" in tmpInput
        || "mozdirectory" in tmpInput
        || "odirectory" in tmpInput
        || "msdirectory" in tmpInput
        || "directory" in tmpInput);
}

function uploadFiles(fileInput, collectionInput, deployInput, filesTable, thead, progressAll, spinner) {
    fileInput.addEventListener("change", () => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) return;

        thead.style.display = "";
        spinner.style.display = "";

        let totalSize = 0;
        let loadedSize = 0;
        files.forEach((f) => { totalSize += f.size; });

        const rows = filesTable.querySelectorAll("tr");
        let count = rows.length;

        const promises = [];
        files.forEach((file) => {
            if (file.name === ".") return;

            let path = file.name;
            if (file.webkitRelativePath) {
                path = file.webkitRelativePath;
            }

            let node = null;
            if (count === 200) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
                td.colSpan = 3;
                td.textContent = "Only 200 files are shown. More follow...";
                tr.appendChild(td);
                filesTable.appendChild(tr);
                count++;
            } else if (count < 200) {
                node = document.createElement("tr");
                node.dataset.name = path;
                const tdName = document.createElement("td");
                tdName.textContent = file.name;
                const tdSize = document.createElement("td");
                tdSize.textContent = file.size;
                const tdProg = document.createElement("td");
                tdProg.className = "file_upload_progress";
                const progBar = document.createElement("div");
                progBar.className = "ui-progressbar-value";
                progBar.style.width = "0%";
                tdProg.appendChild(progBar);
                node.appendChild(tdName);
                node.appendChild(tdSize);
                node.appendChild(tdProg);
                filesTable.appendChild(node);
                count++;
            }

            const uploadPath = `${collectionInput.value}/${path}`;

            const p = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("PUT", apiPath(uploadPath));
                xhr.upload.addEventListener("progress", (evt) => {
                    if (evt.lengthComputable) {
                        const pct = Math.round(evt.loaded / evt.total * 100);
                        const row = filesTable.querySelector(`tr[data-name="${CSS.escape(path)}"]`);
                        if (row) {
                            const bar = row.querySelector(".ui-progressbar-value");
                            if (bar) bar.style.width = `${pct}%`;
                        }
                    }
                });
                xhr.onload = function() {
                    loadedSize += file.size;
                    const overallPct = Math.round(loadedSize / totalSize * 100);
                    progressAll.style.width = `${overallPct}%`;
                    progressAll.textContent = `${overallPct}%`;
                    if (node) node.remove();
                    if (overallPct >= 100) {
                        filesTable.innerHTML = "";
                        spinner.style.display = "none";
                    }
                    resolve();
                };
                xhr.onerror = function() {
                    console.log("Upload error for file: ", file.name);
                    reject();
                };
                xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
                xhr.send(file);
            });
            promises.push(p);
        });

        Promise.all(promises).then(() => {
            progressAll.textContent = "";
            progressAll.style.width = "0%";
            // If deploy checkbox is checked, install .xar files as packages
            if (deployInput.checked) {
                const xarFiles = files.filter((f) => { return /\.xar$/i.test(f.name); });
                xarFiles.forEach((f) => {
                    fetch("api/packages", {
                        method: "POST",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: f
                    });
                });
            }
        });

        fileInput.value = "";
    });
}

function initDragDrop(dropzone, fileInput) {
    if (!dropzone) return;
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag-over");
    });
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("drag-over");
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event("change"));
    });
}

export class Upload extends Sender {
    constructor() {
		super();
		const self = this;
		this.container = document.getElementById("upload-dialog");

		this.events = {
			"done": []
		};

		const progressAll = document.getElementById("progress-all");
		if (progressAll) {
		    progressAll.textContent = "";
		    progressAll.style.width = "0%";
		}

		const filesTable = document.getElementById("files");
		const thead = this.container.querySelector("#file_upload_table thead");
		const spinner = null; // no spinner in standalone dialog
		const collectionInput = this.container.querySelector('input[name="collection"]');
		const deployInput = this.container.querySelector('input[name="deploy"]');

		const fileUploadInput = document.getElementById("file_upload");
		if (fileUploadInput) {
		    uploadFiles(fileUploadInput, collectionInput, deployInput, filesTable, thead || document.createElement("thead"), progressAll || document.createElement("div"), spinner);
		    const dropzone = this.container.querySelector(".file_upload_drop");
		    initDragDrop(dropzone, fileUploadInput);
		}

		if (isDirUploadSupported()) {
		    const dirUploadInput = document.getElementById("dir_upload");
		    if (dirUploadInput) {
		        uploadFiles(dirUploadInput, collectionInput, deployInput, filesTable, thead || document.createElement("thead"), progressAll || document.createElement("div"), spinner);
		    }
		} else {
		    const dirUpload = document.getElementById("dir_upload");
		    if (dirUpload && dirUpload.parentNode) {
		        dirUpload.parentNode.style.display = "none";
		    }
		}

		this._dialog = DialogManager.create(this.container, {
			title: "Upload Files",
			modal: true,
			width: 500,
			buttons: {
				"Close"() {
					this.close();
					filesTable.innerHTML = "";
					self.$triggerEvent("done", []);
				}
			}
		});
	}

    open() {
		this._dialog.open();
	}

    update(collection) {
        const filesTable = document.getElementById("files");
        if (filesTable) filesTable.innerHTML = "";
        const thead = this.container.querySelector("#file_upload_table thead");
        if (thead) thead.style.display = "none";
		const collectionInput = this.container.querySelector('input[name="collection"]');
		if (collectionInput) collectionInput.value = collection;
	}
}

/**
 * Main interface for the open and save dialogs. Uses
 * a ResourceBrowser within a panel.
 */
function createButton(toolbar, title, id, index, imgPath) {
    const button = document.createElement("button");
	button.title = title;
	button.id = `eXide-browse-toolbar-${id}`;
	button.tabindex = index;
	const img = document.createElement("span");
	img.className = `fa fa-lg fa-${imgPath}`;
	button.appendChild(img);
	toolbar.appendChild(button);
    return button;
}

export class Browser extends Sender {
    constructor(container) {
		super();
		const self = this;
        this.mode = "open";

		const toolbar = container.querySelector(".eXide-browse-toolbar");

		let button = createButton(toolbar, "Reload", "reload", 1, "refresh");
		button.addEventListener("click", (ev) => {
            self.resources.reload(true);
		});

		this.btnRenameResource = createButton(toolbar, 'Rename Selected', 'rename', 2, 'edit');
		this.btnRenameResource.addEventListener("click", (ev) => {
			this.resources.startEditing();
		});

        this.btnCreateCollection = createButton(toolbar, "Create Collection", "create", 3, "folder-o");
		this.btnCreateCollection.addEventListener("click", (ev) => {
			ev.preventDefault();
			self.resources.createCollection();
		});

		this.btnUpload = createButton(toolbar, "Upload Files", "upload", 4, "cloud-upload");
		this.btnUpload.addEventListener("click", (ev) => {
			ev.preventDefault();
			self.upload.open();
		});

		this.btnDeleteResource = createButton(toolbar, "Delete", "delete-resource", 5, "trash-o");
		this.btnDeleteResource.addEventListener("click", (ev) => {
			ev.preventDefault();
			self.deleteSelected();
		});

        this.btnProperties = createButton(toolbar, "Properties", "properties", 10, "info");
        this.btnProperties.addEventListener("click", (ev) => {
            ev.preventDefault();
            self.resources.properties();
        });

		button = createButton(toolbar, "Open Selected", "open", 6, "folder-open-o");
		button.addEventListener("click", (ev) => {
			ev.preventDefault();
			const rows = self.resources.getSelectedRows();
			if (rows.length === 1 && rows[0].isCollection) {
				const coll = rows[0].name === ".." ?
					self.resources._collection.replace(/\/[^/]+$/, "") :
					rows[0].key;
				self.resources.update(coll, false);
			} else {
				eXide.app.openSelectedDocument(null, false);
			}
		});

		button = createButton(toolbar, "Download Selected", "download", 11, "download");
		button.addEventListener("click", (ev) => {
			ev.preventDefault();
			const selected = self.resources.getSelected();
			eXide.app.downloadSelectedResources(selected, false);
		});

        this.btnCopy = createButton(toolbar, "Copy", "copy", 7, "copy");
        this.btnCut = createButton(toolbar, "Cut", "cut", 8, "cut");
        this.btnPaste = createButton(toolbar, "Paste", "paste", 9, "paste");

		this.selection = container.querySelector(".eXide-browse-form input");
		this.container = container;
		this.resources = new ResourceBrowser(container, container);
		this.upload = new Upload();

		this.resources.addEventListener("activate", this, this.onActivateResource);
		this.resources.addEventListener("activateCollection", this, this.onActivateCollection);

		// Wire upload callback for context menu
		this.resources._browseUploadCallback = function() {
			self.upload.open();
		};

		this.upload.addEventListener("done", this, function () {
			this.reload();
		});

        this.btnCopy.addEventListener("click", (ev) => {
    		ev.preventDefault();
			self.resources.copy();
		});
        this.btnCut.addEventListener("click", (ev) => {
        	ev.preventDefault();
			self.resources.cut();
		});
        this.btnPaste.addEventListener("click", (ev) => {
        	ev.preventDefault();
			self.resources.paste();
		});
		const spinner = document.getElementById("eXide-browse-spinner");
		if (spinner) spinner.style.display = "none";
	}

    init() {
		this.resources.resize();
		this.resources.reload();
	}

    reload(buttons, mode) {
		if (buttons) {
			this.container.querySelectorAll(".eXide-browse-toolbar button").forEach((btn) => {
				btn.style.display = "none";
			});
			for (let i = 0; i < buttons.length; i++) {
				const btn = document.getElementById(`eXide-browse-toolbar-${buttons[i]}`);
				if (btn) btn.style.display = "";
			}
		}
        if (mode) {
            this.mode = mode;
        }
        this.resources.setMode(mode);
        this.resources.reload(true);
		const browseForm = this.container.querySelector(".eXide-browse-form");
		if (this.mode === "save") {
			browseForm.style.display = "";
			browseForm.focus();
		} else {
			browseForm.style.display = "none";
		}

		this.resize();
		this.selection.value = "";
	}

    resize() {
	}

    deleteSelected() {
        this.resources.deleteResource();
    }

    getSelection() {
		const name = this.selection.value;
		if (name == null || name === '')
			return null;
		return {
			name,
			path: `${this.resources._collection}/${name}`,
			writable: true
		};
	}

    changeToCollection(collection) {
        this.resources.update(collection, true);
    }

    onActivateResource(doc, writable) {
		if (doc) {
			this.selection.value = doc.name;
		} else {
			this.selection.value = "";
		}
		if (this.mode !== "open" && writable) {
			this.btnRenameResource.style.display = "";
			this.btnDeleteResource.style.display = "";
            this.btnProperties.style.display = "";
		} else {
			this.btnDeleteResource.style.display = "none";
            this.btnProperties.style.display = "none";
		}
	}

    onActivateCollection(key, writable) {
        console.log("Activate collection: %s %s", key, this.mode);
        switch (this.mode) {
            case "open":
            case "save":
                this.container.querySelectorAll(".eXide-browse-toolbar button").forEach((btn) => {
                    btn.style.display = "none";
                });
                this.btnCreateCollection.style.display = "";
                break;
            default:
                if (writable) {
					this.btnRenameResource.style.display = "";
    				this.btnCreateCollection.style.display = "";
    				this.btnUpload.style.display = "";
                    this.btnCut.style.display = "";
                    this.btnPaste.style.display = "";
				    this.btnDeleteResource.style.display = "";
                } else {
                    this.btnCreateCollection.style.display = "none";
        			this.btnUpload.style.display = "none";
                    this.btnCut.style.display = "none";
                    this.btnPaste.style.display = "none";
				    this.btnDeleteResource.style.display = "none";
                }
        }
		this.upload.update(key, writable);
	}
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.browse").ResourceBrowser = ResourceBrowser;
namespace("eXide.browse").Upload = Upload;
namespace("eXide.browse").Browser = Browser;
