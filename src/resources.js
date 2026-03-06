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

// ag-grid exposed as globalThis.agGrid by resources/scripts/ag-grid-bundle.js
var Grid = agGrid.Grid;
var InfiniteRowModelModule = agGrid.InfiniteRowModelModule;

function buildQueryString(params) {
	var parts = [];
	Object.keys(params).forEach(function(key) {
		var val = params[key];
		if (Array.isArray(val)) {
			val.forEach(function(v) {
				parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
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

class DataSource {

	constructor(gridOptions) {
		this.gridOptions = gridOptions;
		this.data = [];
		this._collection = "/db";
	}

	set collection(collection) {
		this._collection = collection;
		this.data.length = 0;
		this.gridOptions.api.purgeInfiniteCache();
	}

	get collection() {
		return this._collection;
	}

	getRows(options) {
		var params = { root: this._collection, view: "r", start: options.startRow, end: options.endRow };
		if (options.filterModel.name) {
			params.filter = options.filterModel.name.filter;
		}
		fetchJSON("modules/collections.xq", params).then((json) => {
			if (json && json.items) {
				options.successCallback(json.items, json.total);
				if (this.data.length === 0) {
					this.gridOptions.api.deselectAll();
					this.gridOptions.api.setFocusedCell(0, 'name');
				}
				this.data.length = json.total;
				for (var i = 0; i < json.items.length; i++) {
					this.data[params.start + i] = json.items[i];
				}
			}

		});
	}

	destroy() {
		this.data = [];
	}
}

/**
 * Manages a table view of resources within a collection
 */
eXide.browse.ResourceBrowser = (function () {

    var useragent = { isMac: /Mac/.test(navigator.platform) };

	var columns = [
		{
			colId: "name",
			headerName: "Name",
			field: "name",
			flex: 1,
			floatingFilter: true,
			filter: "agTextColumnFilter",
			filterParams: {
				filterOptions: ["contains"],
				defaultOption: "contains",
			},
			cellClass: (params) => {
				return params.data && params.data.isCollection ? "collection" : "";
			},
			resizable: true,
			editable: false,
			suppressClickEdit: true
		},
		{
			colId: "permissions",
			headerName: "Permissions",
			field: "permissions",
			minWidth: 90,
			maxWidth: 110,
			suppressNavigable: true,
			resizable: true,
		},
		{
			colId: "owner",
			headerName: "Owner",
			field: "owner",
			width: 90,
			suppressNavigable: true,
			resizable: true,
		},
		{
			colId: "group",
			headerName: "Group",
			field: "group",
			width: 90,
			suppressNavigable: true,
			resizable: true,
		},
		{
			colId: "lastMod",
			headerName: "Last Modified",
			field: "last-modified",
			minWidth: 110,
			suppressNavigable: true,
			resizable: true,
		},
	];

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

		this.gridOptions = {
			columnDefs: columns,
			rowSelection: "multiple",
			rowModelType: "infinite",
			isRowSelectable: (rowNode) => rowNode.data && rowNode.data.permissions
		};
		this.grid = new Grid(document.querySelector(".eXide-browse-resources"), this.gridOptions, { modules: [InfiniteRowModelModule] });
		this.dataSource = new DataSource(this.gridOptions);
		this.gridOptions.api.setDatasource(this.dataSource);
		this.gridOptions.onCellFocused = (params) => {
			if (this.mode === 'open' || this.mode === 'save') {
				const row = params.api.getDisplayedRowAtIndex(params.rowIndex);
				params.api.deselectAll();
				row.setSelected(true);
			}
		};
		this.gridOptions.onRowDoubleClicked = (params) => {
			if (params.data.isCollection) {
				var coll;
				if (params.data.name == "..")
					coll = this.dataSource.collection.replace(/\/[^\/]+$/, "");
				else coll = params.data.key;
				this.$triggerEvent("activateCollection", [coll, params.data.writable]);
				this.update(coll, false);
			} else {
				eXide.app.openSelectedDocument({
					name: params.data.name,
					path: params.data.key,
					writable: params.data.writable
				});
			}
		};
		this.gridOptions.onSelectionChanged = (params) => {
			const rows = params.api.getSelectedRows();
			let enableWrite = true;
			for (let i = 0; i < rows.length; i++) {
				if (!rows[i].writable) {
					enableWrite = false;
					break;
				}
			}
			const doc = (rows.length === 1 && !rows[0].isCollection) ? rows[0] : null;
			self.$triggerEvent("activate", [ doc, enableWrite]);
		};
		this.gridOptions.onCellKeyDown = (e) => {
			if (this.inEditor)
				return;
			if ((e.event.metaKey && useragent.isMac) || (e.event.ctrlKey && !useragent.isMac)) {
				switch (e.which) {
					case 67: // cmd-c
						e.event.stopPropagation();
						e.event.preventDefault();
						this.copy();
						break;
					case 86: // cmd-v
						e.event.stopPropagation();
						e.event.preventDefault();
						this.paste();
						break;
					case 88: // cmd-x
						e.event.stopPropagation();
						e.event.preventDefault();
						this.cut();
						break;
					default:
						break;
				}
			} else if (!e.event.shiftKey && !e.event.altKey && !e.event.ctrlKey) {
				let cell;
				switch (e.event.which) {
					case 13:
						e.event.stopPropagation();
						e.event.preventDefault();
						if (e.data.isCollection) {
							var coll;
							if (e.data.name === "..")
								coll = this.dataSource.collection.replace(/\/[^\/]+$/, "")
							else
								coll = e.data.key;
							this.$triggerEvent("activateCollection", [ coll, e.data.writable ]);
							this.update(coll, false);
						} else {
							eXide.app.openSelectedDocument({
								name: e.data.name,
								path: e.data.key,
								writable: e.data.writable,
							});
						}
						break;
					case 8:
						e.event.stopPropagation();
						e.event.preventDefault();
						const p = this.dataSource.collection.lastIndexOf("/");
						if (p > 0) {
							if (this.dataSource.collection != "/db") {
								const parent = this.dataSource.collection.substring(0, p);
								const cell = this.gridOptions.api.getFocusedCell();
								this.$triggerEvent("activateCollection", [ parent, this.dataSource.data[cell.rowIndex].writable ]);
								this.update(parent, false);
							}
						}
						break;
					case 34:
					case 33:
						break;
					case 36:
						e.event.stopPropagation();
						e.event.preventDefault();
						self.goto(0);
						break;
					case 35:
						e.event.stopPropagation();
						e.event.preventDefault();
						self.goto(self.data.length - 1);
						break;
					case 46:
						cell = e.api.getFocusedCell();
						this.deleteResource(this.dataSource.data[cell.rowIndex]);
						break;
					case 27:
						self.search = "";
						break;
					case 38:
					case 40:
						break;
					default:
						e.event.stopPropagation();
						e.event.preventDefault();
						this.search += e.event.key;
						if (this.searchTimeout) {
							clearTimeout(this.searchTimeout);
							this.searchTimeout = undefined;
						}
						var regex = new RegExp("^" + this.search, "i");
						for (let i = e.rowIndex; i < this.dataSource.data.length; i++) {
							if (this.dataSource.data[i] && regex.test(this.dataSource.data[i].name)) {
								e.api.setFocusedCell(i, 'name');
								break;
							}
						}
						this.searchTimeout = setTimeout(() => {
							this.search = "";
						}, 2000);
						break;
				}
			}
		};
		this.gridOptions.onCellValueChanged = (params) => {
			if (!params.oldValue) {
				return;
			}
			params.column.colDef.editable = false;
			fetchJSON("modules/collections.xq", {
				target: encodeURI(params.newValue),
				rename: encodeURI(params.oldValue),
				root: this.dataSource.collection
			}).then((data) => {
				if (data.status == "fail") {
					eXide.util.Dialog.warning("Rename Error", data.message);
				}
				this.reload();
			});
		};
		this.gridOptions.onCellEditingStopped = (e) => {
			setTimeout(() => { this.inEditor = false }, 200);
		};

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
                    var selected = self.gridOptions.api.getSelectedRows();
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

    Constr.prototype.setCollection = function(collection) {
        this.dataSource.collection = collection;
        this.updateBreadcrumbs();
    };

    Constr.prototype.updateBreadcrumbs = function() {
        this.breadcrumbs.innerHTML = "";
        var self = this;
        var parts = this.dataSource.collection.split("/");
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
		if (value === 'manage') {
			this.gridOptions.rowSelection = 'multiple';
		} else {
			this.gridOptions.rowSelection = "single";
		}
	};

	Constr.prototype.resize = function () {
	    console.log("Resizing canvas...");
		this.reload();
	};

	Constr.prototype.update = function(collection, reload) {
        if (!reload && collection === this.dataSource.collection)
            return;
		console.log("Opening resources for %s", collection);
        this.setCollection(collection);
        document.querySelectorAll('input[name="collection"]').forEach(function(el) {
            el.value = collection;
        });
        this.search = "";
	};

	Constr.prototype.hasSelection = function () {
		const selected = this.gridOptions.api.getSelectedRows();
		return selected && selected.length > 0;
	};

    Constr.prototype.getSelected = function() {
		const selected = this.gridOptions.api.getSelectedRows();
		if (selected.length == 0) {
			return null;
		}
        return selected;
    };

	Constr.prototype.startEditing = function() {
		const cell = this.gridOptions.api.getFocusedCell();
		if (cell.column.colId !== 'name') {
			return;
		}
		this.oldValue = this.dataSource.data[cell.rowIndex].key;
		cell.column.colDef.editable = true;
		this.inEditor = true;
		this.gridOptions.api.startEditingCell({
			rowIndex: cell.rowIndex,
			colKey: cell.column.colId
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
						collection: self.dataSource.collection
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
    					remove: self.dataSource.collection
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
		const selected = row ? [row] : this.gridOptions.api.getSelectedRows();
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
							root: self.dataSource.collection
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
		const selected = this.gridOptions.api.getSelectedRows();
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
                params.append("properties", r);
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
		const selected = this.gridOptions.api.getSelectedRows();
		if (selected.length == 0) {
			return;
		}
        this.clipboard = [];
		for (var i = 0; i < selected.length; i++) {
            var path = selected[i].key;

			this.clipboard.push(path);
		}
        console.log("Clipboard: %o", this.clipboard);
    };

    Constr.prototype.paste = function() {
        var self = this;
        console.log("Pasting resources %o to %s in mode %s", this.clipboard, this.dataSource.collection, this.clipboardMode);
        var params = { root: this.dataSource.collection };
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
		this.gridOptions.api.setFocusedCell(row);
    };

    Constr.prototype.focus = function() {
        var canvas = this.container.querySelector(".grid-canvas");
        if (canvas) canvas.focus();
    };

	Constr.prototype.reload = function() {
		this.update(this.dataSource.collection, true);
		//TODO : modify this to add an event mechanism instead
		eXide.app.syncDirectory(this.dataSource.collection);
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
			path: this.resources.dataSource.collection + "/" + name,
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
