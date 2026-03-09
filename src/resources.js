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

function buildQueryString(params) {
	var parts = [];
	Object.keys(params).forEach(function(key) {
		var val = params[key];
		if (Array.isArray(val)) {
			val.forEach(function(v) {
				parts.push(encodeURIComponent(key + "[]") + "=" + encodeURIComponent(v));
			});
		} else {
			parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
		}
	});
	return parts.join("&");
}

function fetchJSON(url, params) {
	var qs = buildQueryString(params);
	return fetch(url + "?" + qs).then(function(r) { return r.json(); });
}

eXide.namespace("eXide.browse.ResourceBrowser");

/**
 * Manages a table view of resources within a collection.
 * Replaces AG Grid with a vanilla HTML table and scroll-based lazy loading.
 */
eXide.browse.ResourceBrowser = (function () {

    var useragent = { isMac: /Mac/.test(navigator.platform) };
	var BATCH_SIZE = 50;

	function fileIcon(item) {
		var mime = item.mime || "";
		if (mime) {
			if (mime === "application/pdf") return "fa-file-pdf-o";
			if (/^image\//.test(mime)) return "fa-file-image-o";
			if (/xml|html/.test(mime)) return "fa-file-code-o";
			if (/^text\/|javascript|json|css/.test(mime)) return "fa-file-text-o";
			if (/zip|compress|archive|xar|jar/.test(mime)) return "fa-file-archive-o";
		}
		var name = item.name || "";
		if (/\.(xml|xq|xquery|xql|xqm|xconf|xhtml|html|htm|svg|xsl|xslt|odd|rng|sch|wsdl)$/i.test(name)) return "fa-file-code-o";
		if (/\.(css|less|scss|js|json|md|txt|csv|properties)$/i.test(name)) return "fa-file-text-o";
		if (/\.(png|jpe?g|gif|ico|webp|bmp|tiff?)$/i.test(name)) return "fa-file-image-o";
		if (/\.pdf$/i.test(name)) return "fa-file-pdf-o";
		if (/\.(zip|tar|gz|xar|jar|war|ear)$/i.test(name)) return "fa-file-archive-o";
		return "fa-file-o";
	}

	Constr = function(container, parentContainer) {
		var self = this;
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

		var wrapper = document.querySelector(".eXide-browse-resources");
		wrapper.innerHTML = "";

		// Filter input
		this.filterInput = document.createElement("input");
		this.filterInput.type = "text";
		this.filterInput.className = "browse-filter";
		this.filterInput.placeholder = "Filter by name…";
		this.filterInput.addEventListener("input", function() {
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

		var thead = document.createElement("thead");
		thead.innerHTML = "<tr>" +
			"<th class=\"col-name\">Name</th>" +
			"<th class=\"col-permissions\">Permissions</th>" +
			"<th class=\"col-owner\">Owner</th>" +
			"<th class=\"col-group\">Group</th>" +
			"<th class=\"col-lastmod\">Last Modified</th>" +
			"</tr>";
		this.table.appendChild(thead);

		// Column resize handles
		thead.querySelectorAll("th").forEach(function(th) {
			var handle = document.createElement("div");
			handle.className = "col-resize-handle";
			th.appendChild(handle);
			th.style.position = "relative";
			var startX, startWidth;
			handle.addEventListener("mousedown", function(e) {
				e.preventDefault();
				e.stopPropagation();
				startX = e.clientX;
				startWidth = th.offsetWidth;
				function onMove(e) {
					var newWidth = Math.max(40, startWidth + e.clientX - startX);
					th.style.width = newWidth + "px";
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

        var propsContentEl = document.getElementById("resource-properties-content");
        var propsDialogEl = document.getElementById("resource-properties-dialog");
        this.propertiesDialog = eXide.util.DialogManager.create(propsDialogEl, {
            title: "Resource/collection properties",
            modal: true,
            height: 380,
            width: 460,
            buttons: {
                "Cancel": function () { this.close(); },
                "Apply": function() {
                    var dlg = this;
                    var selected = self.getSelectedRows();
                    if (selected.length == 0) {
                        return;
                    }
                    var resources = [];
                    for (var i = 0; i < selected.length; i++) {
                        resources.push(selected[i].key);
                    }
                    var form = propsDialogEl.querySelector("form");
                    var formData = new FormData(form);
                    var params = new URLSearchParams(formData);
                    resources.forEach(function(r) {
                        params.append("modify[]", r);
                    });
                    fetch("modules/collections.xq?" + params.toString())
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            dlg.close();
                            self.reload();
                        });
                }
            }
        });
	};

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

	Constr.prototype._setupIntersectionObserver = function() {
		var self = this;
		this._observer = new IntersectionObserver(function(entries) {
			if (entries[0].isIntersecting && !self.loading && self.data.length < self.totalRows) {
				self._loadBatch(self.data.length);
			}
		}, { root: this.scrollContainer, threshold: 0.1 });
		this._observer.observe(this.sentinel);
	};

	Constr.prototype._setupClickHandlers = function() {
		var self = this;
		this.tbody.addEventListener("click", function(e) {
			var tr = e.target.closest("tr");
			if (!tr || !tr.dataset.index) return;
			var idx = parseInt(tr.dataset.index, 10);
			if (self._rowSelection === "multiple" && (e.ctrlKey || e.metaKey)) {
				if (self._selectedIndices.has(idx)) {
					self._selectedIndices.delete(idx);
				} else {
					self._selectedIndices.add(idx);
				}
			} else if (self._rowSelection === "multiple" && e.shiftKey && self._focusedRow >= 0) {
				var start = Math.min(self._focusedRow, idx);
				var end = Math.max(self._focusedRow, idx);
				self._selectedIndices.clear();
				for (var i = start; i <= end; i++) {
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

		this.tbody.addEventListener("dblclick", function(e) {
			var tr = e.target.closest("tr");
			if (!tr || !tr.dataset.index) return;
			var idx = parseInt(tr.dataset.index, 10);
			var item = self.data[idx];
			if (!item) return;
			if (item.isCollection) {
				var coll;
				if (item.name == "..")
					coll = self._collection.replace(/\/[^\/]+$/, "");
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
	};

	Constr.prototype._setupKeyboardNav = function() {
		var self = this;
		this.scrollContainer.addEventListener("keydown", function(e) {
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
				case 13: // enter
					e.stopPropagation(); e.preventDefault();
					var item = self.data[self._focusedRow];
					if (!item) break;
					if (item.isCollection) {
						var coll;
						if (item.name === "..")
							coll = self._collection.replace(/\/[^\/]+$/, "");
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
				case 8: // backspace
					e.stopPropagation(); e.preventDefault();
					var p = self._collection.lastIndexOf("/");
					if (p > 0 && self._collection != "/db") {
						var parent = self._collection.substring(0, p);
						self.$triggerEvent("activateCollection", [parent, true]);
						self.update(parent, false);
					}
					break;
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
				default:
					e.stopPropagation(); e.preventDefault();
					self.search += e.key;
					if (self.searchTimeout) {
						clearTimeout(self.searchTimeout);
						self.searchTimeout = undefined;
					}
					var regex = new RegExp("^" + self.search, "i");
					for (var i = self._focusedRow; i < self.data.length; i++) {
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
					self.searchTimeout = setTimeout(function() {
						self.search = "";
					}, 2000);
					break;
			}
		});
	};

	Constr.prototype._resetAndLoad = function() {
		this.data = [];
		this.totalRows = 0;
		this._focusedRow = -1;
		this._selectedIndices.clear();
		this.tbody.innerHTML = "";
		this._loadBatch(0);
	};

	Constr.prototype._loadBatch = function(startRow) {
		var self = this;
		if (this.loading) return;
		this.loading = true;

		var params = { root: this._collection, view: "r", start: startRow, end: startRow + BATCH_SIZE };
		if (this._filter) {
			params.filter = this._filter;
		}
		fetchJSON("modules/collections.xq", params).then(function(json) {
			self.loading = false;
			if (!json || !json.items) return;

			self.totalRows = json.total;
			for (var i = 0; i < json.items.length; i++) {
				var rowIdx = startRow + i;
				self.data[rowIdx] = json.items[i];
				self._renderRow(json.items[i], rowIdx);
			}

			if (startRow === 0 && json.items.length > 0) {
				self._focusedRow = 0;
				self._selectedIndices.clear();
				self._selectedIndices.add(0);
				self._updateSelectionDisplay();
				self._fireSelectionChanged();
			}
		});
	};

	Constr.prototype._renderRow = function(item, index) {
		var tr = document.createElement("tr");
		tr.dataset.index = index;
		tr.dataset.key = item.key || "";

		var tdName = document.createElement("td");
		tdName.className = "col-name";
		if (item.isCollection) tdName.classList.add("collection");
		var icon = document.createElement("i");
		icon.className = item.isCollection
			? "fa fa-folder browse-icon"
			: "fa " + fileIcon(item) + " browse-icon";
		tdName.appendChild(icon);
		tdName.appendChild(document.createTextNode(item.name));

		var tdPerm = document.createElement("td");
		tdPerm.className = "col-permissions";
		tdPerm.textContent = item.permissions || "";

		var tdOwner = document.createElement("td");
		tdOwner.className = "col-owner";
		tdOwner.textContent = item.owner || "";

		var tdGroup = document.createElement("td");
		tdGroup.className = "col-group";
		tdGroup.textContent = item.group || "";

		var tdMod = document.createElement("td");
		tdMod.className = "col-lastmod";
		tdMod.textContent = item["last-modified"] || "";

		tr.appendChild(tdName);
		tr.appendChild(tdPerm);
		tr.appendChild(tdOwner);
		tr.appendChild(tdGroup);
		tr.appendChild(tdMod);
		this.tbody.appendChild(tr);
	};

	Constr.prototype._updateSelectionDisplay = function() {
		var rows = this.tbody.querySelectorAll("tr");
		for (var i = 0; i < rows.length; i++) {
			var idx = parseInt(rows[i].dataset.index, 10);
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
	};

	Constr.prototype._scrollRowIntoView = function(index) {
		var row = this.tbody.querySelector("tr[data-index=\"" + index + "\"]");
		if (row) {
			row.scrollIntoView({ block: "nearest" });
		}
	};

	Constr.prototype._fireSelectionChanged = function() {
		var rows = this.getSelectedRows();
		var enableWrite = true;
		for (var i = 0; i < rows.length; i++) {
			if (!rows[i].writable) {
				enableWrite = false;
				break;
			}
		}
		var doc = (rows.length === 1 && !rows[0].isCollection) ? rows[0] : null;
		this.$triggerEvent("activate", [doc, enableWrite]);
	};

	Constr.prototype.getSelectedRows = function() {
		var result = [];
		var self = this;
		this._selectedIndices.forEach(function(idx) {
			if (self.data[idx]) result.push(self.data[idx]);
		});
		return result;
	};

    Constr.prototype.setCollection = function(collection) {
        this._collection = collection;
		this._filter = "";
		this.filterInput.value = "";
        this._resetAndLoad();
        this.updateBreadcrumbs();
    };

    Constr.prototype.updateBreadcrumbs = function() {
        this.breadcrumbs.innerHTML = "";
        var self = this;
        var parts = this._collection.split("/");
		parts = parts.map(part => decodeURI(part));
        var span = document.createElement("span");
        span.appendChild(document.createTextNode("/"));
        var path = "/";
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part && part.length > 0) {
                path += part + "/";
                var a = document.createElement("a");
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
    };

	Constr.prototype.setMode = function(value) {
        this.mode = value;
		this._rowSelection = (value === "manage") ? "multiple" : "single";
	};

	Constr.prototype.resize = function () {
	    console.log("Resizing canvas...");
		this.reload();
	};

	Constr.prototype.update = function(collection, reload) {
        if (!reload && collection === this._collection)
            return;
		console.log("Opening resources for %s", collection);
        this.setCollection(collection);
        document.querySelectorAll('input[name="collection"]').forEach(function(el) {
            el.value = collection;
        });
        this.search = "";
	};

	Constr.prototype.hasSelection = function () {
		return this._selectedIndices.size > 0;
	};

    Constr.prototype.getSelected = function() {
		var rows = this.getSelectedRows();
		return rows.length > 0 ? rows : null;
    };

	Constr.prototype.startEditing = function() {
		if (this._focusedRow < 0) return;
		var item = this.data[this._focusedRow];
		if (!item) return;

		var self = this;
		this.inEditor = true;
		var row = this.tbody.querySelector("tr[data-index=\"" + this._focusedRow + "\"]");
		if (!row) return;
		var cell = row.querySelector(".col-name");
		if (!cell) return;

		var oldValue = item.name;
		var finished = false;
		var input = document.createElement("input");
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
			var newValue = input.value;
			cell.textContent = commit && newValue ? newValue : oldValue;
			setTimeout(function() { self.inEditor = false; }, 200);
			if (commit && newValue && newValue !== oldValue) {
				fetchJSON("modules/collections.xq", {
					target: encodeURI(newValue),
					rename: encodeURI(oldValue),
					root: self._collection
				}).then(function(data) {
					if (data.status == "fail") {
						eXide.util.Dialog.warning("Rename Error", data.message);
					}
					self.reload();
				});
			}
			self.scrollContainer.focus();
		}

		input.addEventListener("keydown", function(e) {
			if (e.which === 13) { e.preventDefault(); finish(true); }
			if (e.which === 27) { e.preventDefault(); finish(false); }
		});
		input.addEventListener("blur", function() {
			finish(true);
		});
	};

    Constr.prototype.createCollection = function () {
    	var self = this;
		if (!eXide.app.$checkLogin())
			return;
		eXide.util.Dialog.input("Create Collection",
			"<label for=\"collection\">Name: </label>" +
			"<input type=\"text\" name=\"collection\" id=\"eXide-browse-collection-name\"/>",
			function () {
			    var spinner = document.getElementById("eXide-browse-spinner");
			    spinner.style.display = "";
				fetchJSON("modules/collections.xq", {
						create: document.getElementById("eXide-browse-collection-name").value,
						collection: self._collection
					}).then(function (data) {
					    spinner.style.display = "none";
						if (data.status == "fail") {
							eXide.util.Dialog.warning("Create Collection Error", data.message);
						} else {
							self.reload();
						}
					});
			}
		);
	};

	Constr.prototype.deleteCollection = function () {
		var self = this;
		eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete collection " + self.selected + "?",
			function () {
			    var spinner = document.getElementById("eXide-browse-spinner");
			    spinner.style.display = "";
				fetchJSON("modules/collections.xq", {
    					remove: self._collection
    				}).then(function (data) {
    				    spinner.style.display = "none";
    					if (data.status == "fail") {
    						eXide.util.Dialog.warning("Delete Collection Error", data.message);
    					} else {
    						self.reload();
    					}
    				});
		});
	};

	Constr.prototype.deleteResource = function(row) {
		var selected = row ? [row] : this.getSelectedRows();
		if (selected.length == 0) {
			return;
		}
		var resources = [];
		for (var i = 0; i < selected.length; i++) {
			resources.push(selected[i].key);
		}
		console.log('resources to delete: %o', selected);
		var self = this;
		eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete the selected resources?",
				function () {
				    var spinner = document.getElementById("eXide-browse-spinner");
				    spinner.style.display = "";
					fetchJSON("modules/collections.xq", {
							remove: resources,
							root: self._collection
						}).then(function (data) {
						    spinner.style.display = "none";
							self.reload();
							if (data.status == "fail") {
								eXide.util.Dialog.warning("Delete Resource Error", data.message);
							}
						});
		});
	};

    Constr.prototype.properties = function() {
		var selected = this.getSelectedRows();
    	if (selected.length == 0) {
			return;
		}
		var resources = [];
		for (var i = 0; i < selected.length; i++) {
            if (selected[i].name != "..") {
			    resources.push(selected[i].key);
            }
		}
        if (resources.length > 0) {
            var contentEl = document.getElementById("resource-properties-content");
            var params = new URLSearchParams();
            resources.forEach(function(r) {
                params.append("properties[]", r);
            });
            fetch("modules/collections.xq", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString()
            })
            .then(function(r) { return r.text(); })
            .then(function(html) {
                contentEl.innerHTML = html;
            });
            this.propertiesDialog.open();
        }
    };

    Constr.prototype.cut = function() {
        this.clipboardMode = "move";
        this.copy0();
    };

    Constr.prototype.copy = function() {
      this.clipboardMode = "copy";
      this.copy0();
    };

    Constr.prototype.copy0 = function() {
		var selected = this.getSelectedRows();
		if (selected.length == 0) {
			return;
		}
        this.clipboard = [];
		for (var i = 0; i < selected.length; i++) {
            this.clipboard.push(selected[i].key);
		}
        console.log("Clipboard: %o", this.clipboard);
    };

    Constr.prototype.paste = function() {
        var self = this;
        console.log("Pasting resources %o to %s in mode %s", this.clipboard, this._collection, this.clipboardMode);
        var params = { root: this._collection };
        params[this.clipboardMode] = this.clipboard;
		fetchJSON("modules/collections.xq", params).then(function (data) {
				console.log(data.status);
				if (data.status == "fail") {
					eXide.util.Dialog.warning("Delete Resource Error", data.message);
				} else {
					self.reload();
				}
			});
    };

    Constr.prototype.goto = function(row) {
		if (row < 0 || row >= this.data.length) return;
		this._focusedRow = row;
		this._selectedIndices.clear();
		this._selectedIndices.add(row);
		this._updateSelectionDisplay();
		this._scrollRowIntoView(row);
		this._fireSelectionChanged();
    };

    Constr.prototype.focus = function() {
        this.scrollContainer.focus();
    };

	Constr.prototype.reload = function() {
		this.update(this._collection, true);
		eXide.app.syncDirectory(this._collection);
	};

	return Constr;
}());

eXide.namespace("eXide.browse.Upload");

/**
 * File upload widget
 */
eXide.browse.Upload = (function () {

	function isDirUploadSupported() {
	    var tmpInput = document.createElement("input");
	    return ("webkitdirectory" in tmpInput
	        || "mozdirectory" in tmpInput
	        || "odirectory" in tmpInput
	        || "msdirectory" in tmpInput
	        || "directory" in tmpInput);
	}

	function uploadFiles(fileInput, collectionInput, deployInput, filesTable, thead, progressAll, spinner) {
	    fileInput.addEventListener("change", function() {
	        var files = Array.from(fileInput.files);
	        if (files.length === 0) return;

	        thead.style.display = "";
	        spinner.style.display = "";

	        var totalSize = 0;
	        var loadedSize = 0;
	        files.forEach(function(f) { totalSize += f.size; });

	        var rows = filesTable.querySelectorAll("tr");
	        var count = rows.length;

	        var promises = [];
	        files.forEach(function(file) {
	            if (file.name === ".") return;

	            var path = file.name;
	            if (file.webkitRelativePath) {
	                path = file.webkitRelativePath;
	            }

	            var node = null;
	            if (count === 200) {
	                var tr = document.createElement("tr");
	                var td = document.createElement("td");
	                td.colSpan = 3;
	                td.textContent = "Only 200 files are shown. More follow...";
	                tr.appendChild(td);
	                filesTable.appendChild(tr);
	                count++;
	            } else if (count < 200) {
	                node = document.createElement("tr");
	                node.dataset.name = path;
	                var tdName = document.createElement("td");
	                tdName.textContent = file.name;
	                var tdSize = document.createElement("td");
	                tdSize.textContent = file.size;
	                var tdProg = document.createElement("td");
	                tdProg.className = "file_upload_progress";
	                var progBar = document.createElement("div");
	                progBar.className = "ui-progressbar-value";
	                progBar.style.width = "0%";
	                tdProg.appendChild(progBar);
	                node.appendChild(tdName);
	                node.appendChild(tdSize);
	                node.appendChild(tdProg);
	                filesTable.appendChild(node);
	                count++;
	            }

	            var formData = new FormData();
	            formData.append("file[]", file);
	            formData.append("path", path);
	            formData.append("collection", collectionInput.value);
	            if (deployInput.checked) {
	                formData.append("deploy", "on");
	            }

	            var p = new Promise(function(resolve, reject) {
	                var xhr = new XMLHttpRequest();
	                xhr.open("POST", "modules/upload.xq");
	                xhr.upload.addEventListener("progress", function(evt) {
	                    if (evt.lengthComputable) {
	                        var pct = Math.round(evt.loaded / evt.total * 100);
	                        var row = filesTable.querySelector('tr[data-name="' + CSS.escape(path) + '"]');
	                        if (row) {
	                            var bar = row.querySelector(".ui-progressbar-value");
	                            if (bar) bar.style.width = pct + "%";
	                        }
	                    }
	                });
	                xhr.onload = function() {
	                    loadedSize += file.size;
	                    var overallPct = Math.round(loadedSize / totalSize * 100);
	                    progressAll.style.width = overallPct + "%";
	                    progressAll.textContent = overallPct + "%";
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
	                xhr.send(formData);
	            });
	            promises.push(p);
	        });

	        Promise.all(promises).then(function() {
	            progressAll.textContent = "";
	            progressAll.style.width = "0%";
	        });

	        fileInput.value = "";
	    });
	}

	function initDragDrop(dropzone, fileInput) {
	    if (!dropzone) return;
	    dropzone.addEventListener("dragover", function(e) {
	        e.preventDefault();
	        e.stopPropagation();
	        dropzone.classList.add("drag-over");
	    });
	    dropzone.addEventListener("dragleave", function(e) {
	        e.preventDefault();
	        e.stopPropagation();
	        dropzone.classList.remove("drag-over");
	    });
	    dropzone.addEventListener("drop", function(e) {
	        e.preventDefault();
	        e.stopPropagation();
	        dropzone.classList.remove("drag-over");
	        fileInput.files = e.dataTransfer.files;
	        fileInput.dispatchEvent(new Event("change"));
	    });
	}

	Constr = function (container) {
		this.container = typeof container === "string" ? document.querySelector(container) : container;

		this.events = {
			"done": []
		};

		var progressAll = document.getElementById("progress-all");
		if (progressAll) {
		    progressAll.textContent = "";
		    progressAll.style.width = "0%";
		}

		var filesTable = document.getElementById("files");
		var thead = this.container.querySelector("#file_upload thead");
		var spinner = document.getElementById("eXide-browse-spinner");
		var collectionInput = this.container.querySelector('input[name="collection"]');
		var deployInput = this.container.querySelector('input[name="deploy"]');

		var fileUploadInput = document.getElementById("file_upload");
		if (fileUploadInput) {
		    uploadFiles(fileUploadInput, collectionInput, deployInput, filesTable, thead || document.createElement("thead"), progressAll || document.createElement("div"), spinner);
		    var dropzone = this.container.querySelector(".file_upload_drop");
		    initDragDrop(dropzone, fileUploadInput);
		}

		if (isDirUploadSupported()) {
		    var dirUploadInput = document.getElementById("dir_upload");
		    if (dirUploadInput) {
		        uploadFiles(dirUploadInput, collectionInput, deployInput, filesTable, thead || document.createElement("thead"), progressAll || document.createElement("div"), spinner);
		    }
		} else {
		    var dirUpload = document.getElementById("dir_upload");
		    if (dirUpload && dirUpload.parentNode) {
		        dirUpload.parentNode.style.display = "none";
		    }
		}

		var self = this;
		var doneBtn = document.getElementById("eXide-browse-upload-done");
		if (doneBtn) {
		    doneBtn.addEventListener("click", function() {
		        filesTable.innerHTML = "";
		        self.$triggerEvent("done", []);
		    });
		}
	}

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

	Constr.prototype.update = function(collection) {
        console.log("Upload collection: %s", collection);
        var filesTable = document.getElementById("files");
        if (filesTable) filesTable.innerHTML = "";
        var thead = this.container.querySelector("#file_upload thead");
        if (thead) thead.style.display = "none";
		var collectionInput = this.container.querySelector('input[name="collection"]');
		if (collectionInput) collectionInput.value = collection;
	};

	return Constr;
}());

eXide.namespace("eXide.browse.Browser");

/**
 * Main interface for the open and save dialogs. Uses
 * a ResourceBrowser within a panel.
 */
eXide.browse.Browser = (function () {

    function createButton(toolbar, title, id, index, imgPath) {
        var button = document.createElement("button");
    	button.title = title;
		button.id = "eXide-browse-toolbar-" + id;
		button.tabindex = index;
		var img = document.createElement("span");
		img.className = "fa fa-lg fa-" + imgPath;
		button.appendChild(img);
		toolbar.appendChild(button);
        return button;
    }

	Constr = function (container) {
		var self = this;
        this.mode = "open";

		var toolbar = container.querySelector(".eXide-browse-toolbar");

		var button = createButton(toolbar, "Reload", "reload", 1, "refresh");
		button.addEventListener("click", function (ev) {
            self.resources.reload(true);
		});

		this.btnRenameResource = createButton(toolbar, 'Rename Selected', 'rename', 2, 'edit');
		this.btnRenameResource.addEventListener("click", (ev) => {
			this.resources.startEditing();
		});

        this.btnCreateCollection = createButton(toolbar, "Create Collection", "create", 3, "folder-o");
		this.btnCreateCollection.addEventListener("click", function (ev) {
			ev.preventDefault();
			self.resources.createCollection();
		});

		this.btnUpload = createButton(toolbar, "Upload Files", "upload", 4, "cloud-upload");
		this.btnUpload.addEventListener("click", function (ev) {
			ev.preventDefault();
			container.querySelector(".eXide-browse-resources").style.display = "none";
			container.querySelector(".eXide-browse-upload").style.display = "";
			self.$triggerEvent("upload-open", [true]);
		});

		this.btnDeleteResource = createButton(toolbar, "Delete", "delete-resource", 5, "trash-o");
		this.btnDeleteResource.addEventListener("click", function (ev) {
			ev.preventDefault();
			self.deleteSelected();
		});

        this.btnProperties = createButton(toolbar, "Properties", "properties", 10, "info");
        this.btnProperties.addEventListener("click", function(ev) {
            ev.preventDefault();
            self.resources.properties();
        });

		button = createButton(toolbar, "Open Selected", "open", 6, "folder-open-o");
		button.addEventListener("click", function (ev) {
			ev.preventDefault();
			eXide.app.openSelectedDocument(null, false);
		});

		button = createButton(toolbar, "Download Selected", "download", 11, "download");
		button.addEventListener("click", function (ev) {
			ev.preventDefault();
			const selected = self.resources.getSelected();
			eXide.app.downloadSelectedResources(selected, false);
		});

        this.btnCopy = createButton(toolbar, "Copy", "copy", 7, "copy");
        this.btnCut = createButton(toolbar, "Cut", "cut", 8, "cut");
        this.btnPaste = createButton(toolbar, "Paste", "paste", 9, "paste");

		this.selection = container.querySelector(".eXide-browse-form input");
		this.container = container;
		this.resources = new eXide.browse.ResourceBrowser(container, container);
		var uploadEl = container.querySelector(".eXide-browse-upload");
		if (uploadEl) uploadEl.style.display = "none";
		this.upload = new eXide.browse.Upload(uploadEl);

		this.resources.addEventListener("activate", this, this.onActivateResource);
		this.resources.addEventListener("activateCollection", this, this.onActivateCollection);

		this.upload.addEventListener("done", this, function () {
			container.querySelector(".eXide-browse-resources").style.display = "";
			container.querySelector(".eXide-browse-upload").style.display = "none";
			self.$triggerEvent("upload-open", [false]);
			this.reload();
		});

        this.btnCopy.addEventListener("click", function (ev) {
    		ev.preventDefault();
			self.resources.copy();
		});
        this.btnCut.addEventListener("click", function (ev) {
        	ev.preventDefault();
			self.resources.cut();
		});
        this.btnPaste.addEventListener("click", function (ev) {
        	ev.preventDefault();
			self.resources.paste();
		});
		var spinner = document.getElementById("eXide-browse-spinner");
		if (spinner) spinner.style.display = "none";
	};

	// Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

	Constr.prototype.init = function() {
		this.resources.resize();
		this.resources.reload();
	};

	Constr.prototype.reload = function(buttons, mode) {
		if (buttons) {
			this.container.querySelectorAll(".eXide-browse-toolbar button").forEach(function(btn) {
				btn.style.display = "none";
			});
			for (var i = 0; i < buttons.length; i++) {
				var btn = document.getElementById("eXide-browse-toolbar-" + buttons[i]);
				if (btn) btn.style.display = "";
			}
		}
        if (mode) {
            this.mode = mode;
        }
        this.resources.setMode(mode);
        this.resources.reload();
		var browseForm = this.container.querySelector(".eXide-browse-form");
		if (this.mode === "save") {
			browseForm.style.display = "";
			browseForm.focus();
		} else {
			browseForm.style.display = "none";
		}

		this.resize();
		this.selection.value = "";
	};

	Constr.prototype.resize = function() {
	};

    Constr.prototype.deleteSelected = function () {
        this.resources.deleteResource();
    };

	Constr.prototype.getSelection = function () {
		var name = this.selection.value;
		if (name == null || name == '')
			return null;
		return {
			name: name,
			path: this.resources._collection + "/" + name,
			writable: true
		};
	};

    Constr.prototype.changeToCollection = function (collection) {
        this.resources.update(collection, true);
    };

	Constr.prototype.onActivateResource = function (doc, writable) {
		if (doc) {
			this.selection.value = doc.name;
		} else {
			this.selection.value = "";
		}
		if (this.mode != "open" && writable) {
			this.btnRenameResource.style.display = "";
			this.btnDeleteResource.style.display = "";
            this.btnProperties.style.display = "";
		} else {
			this.btnDeleteResource.style.display = "none";
            this.btnProperties.style.display = "none";
		}
	};

	Constr.prototype.onActivateCollection = function (key, writable) {
        console.log("Activate collection: %s %s", key, this.mode);
        switch (this.mode) {
            case "open":
            case "save":
                this.container.querySelectorAll(".eXide-browse-toolbar button").forEach(function(btn) {
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
	};

	return Constr;
}());
