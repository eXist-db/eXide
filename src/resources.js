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

import { Grid } from "@ag-grid-community/core";
import { InfiniteRowModelModule } from "@ag-grid-community/infinite-row-model";

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
		$.getJSON("modules/collections.xq", params, (json) => {
			if (json && json.items) {
				options.successCallback(json.items, json.total);
				if (this.data.length === 0) {
					this.gridOptions.api.deselectAll();
					this.gridOptions.api.setFocusedCell(0, 'name');
				}
				// this.gridOptions.api.sizeColumnsToFit();
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

    var useragent = require("ace/lib/useragent");

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
		var $this = this;
		this.container = $(container);
        this.breadcrumbs = $(".eXide-browse-breadcrumbs", parentContainer);
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
				// navigate to new collection
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
			$this.$triggerEvent("activate", [ doc, enableWrite]);
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
						// nothing to do
						break;
				}
			} else if (!e.event.shiftKey && !e.event.altKey && !e.event.ctrlKey) {
				let cell;
				switch (e.event.which) {
					// enter
					case 13:
						e.event.stopPropagation();
						e.event.preventDefault();
						if (e.data.isCollection) {
							// navigate to new collection
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
					// backspace
					case 8:
						e.event.stopPropagation();
						e.event.preventDefault();
						const p = this.dataSource.collection.lastIndexOf("/");
						if (p > 0) {
							if (this.dataSource.collection != "/db") {
								const parent = this.dataSource.collection.substring(0, p);
								const cell = this.gridOptions.api.getFocusedCell();
								// navigate to parent collection
								this.$triggerEvent("activateCollection", [ parent, this.dataSource.data[cell.rowIndex].writable ]);
								this.update(parent, false);
							}
						}
						break;
					// page down
					case 34:
					// page up
					case 33:
						break;
					// home
					case 36:
						e.event.stopPropagation();
						e.event.preventDefault();
						$this.goto(0);
						break;
					// end
					case 35:
						e.event.stopPropagation();
						e.event.preventDefault();
						$this.goto($this.data.length - 1);
						break;
					// delete
					case 46:
						cell = e.api.getFocusedCell();
						this.deleteResource(this.dataSource.data[cell.rowIndex]);
						break;
					// escape
					case 27:
						$this.search = "";
						break;
					// down/up
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
			$.getJSON("modules/collections.xq", {
				target: encodeURI(params.newValue),
				rename: encodeURI(params.oldValue),
				root: this.dataSource.collection
			}, (data) => {
				if (data.status == "fail") {
					eXide.util.Dialog.warning("Rename Error", data.message);
				}
				this.reload();
			});
		};
		this.gridOptions.onCellEditingStopped = (e) => {
			setTimeout(() => { this.inEditor = false }, 200);
		};

        $("#resource-properties-dialog").dialog({
            title: "Resource/collection properties",
			modal: true,
	        autoOpen: false,
	        height: 380,
	        width: 460,
            buttons: {
                "Cancel": function () { $(this).dialog("close"); },
                "Apply": function() {
                    var dialog = this;
					const selected = $this.gridOptions.api.getSelectedRows();
                    if (selected.length == 0) {
                		return;
            		}
            		var resources = [];
            		for (var i = 0; i < selected.length; i++) {
            			resources.push(selected[i].key);
            		}
                    var params = $("form", dialog).serialize();
                    params = params + "&" + $.param({ "modify[]": resources});
                    $.getJSON("modules/collections.xq", params,
                        function(data) {
                            $(dialog).dialog("close");
                            $this.reload();
                        }
                    );
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
        this.breadcrumbs.empty();
        var self = this;
        var parts = this.dataSource.collection.split("/");
		parts = parts.map(part => decodeURI(part));
        var span = $("<span>/</span>");
        var path = "/";
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            if (part && part.length > 0) {
                path += part + "/";
                var a = $('<a href="#">').append(part);
                a.data("collection", path);
                span.append(a).append("/");
                a.click(function(ev) {
                    ev.preventDefault();
                    self.update($(this).data("collection"), false);
                });
            }
        }
        this.breadcrumbs.html(span);
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
		$.log("Opening resources for %s", collection);
		// this.grid.gotoCell(0, 0);
        this.setCollection(collection);
    	$('input[name="collection"]').val(collection);
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
    	var $this = this;
		if (!eXide.app.$checkLogin())
			return;
		eXide.util.Dialog.input("Create Collection",
			"<label for=\"collection\">Name: </label>" +
			"<input type=\"text\" name=\"collection\" id=\"eXide-browse-collection-name\"/>",
			function () {
			    $("#eXide-browse-spinner").show();
				$.getJSON("modules/collections.xq", {
						create: $("#eXide-browse-collection-name").val(),
						collection: $this.dataSource.collection
					},
					function (data) {
					    $("#eXide-browse-spinner").hide();
						if (data.status == "fail") {
							eXide.util.Dialog.warning("Create Collection Error", data.message);
						} else {
							$this.reload();
						}
					}
				);
			}
		);
	};

	Constr.prototype.deleteCollection = function () {
		var $this = this;
		eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete collection " + $this.selected + "?",
			function () {
			    $("#eXide-browse-spinner").show();
				$.getJSON("modules/collections.xq", {
    					remove: $this.dataSource.collection
    				},
    				function (data) {
    				    $("#eXide-browse-spinner").hide();
    					if (data.status == "fail") {
    						eXide.util.Dialog.warning("Delete Collection Error", data.message);
    					} else {
    						$this.reload();
    					}
    				}
    			);
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
		var $this = this;
		eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete the selected resources?",
				function () {
				    $("#eXide-browse-spinner").show();
					$.getJSON("modules/collections.xq", {
							remove: resources,
							root: $this.dataSource.collection
						},
						function (data) {
						    $("#eXide-browse-spinner").hide();
							$this.reload();
							if (data.status == "fail") {
								eXide.util.Dialog.warning("Delete Resource Error", data.message);
							}
						}
				    );
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
            $("#resource-properties-content").load("modules/collections.xq", { "properties": resources });
            $("#resource-properties-dialog").dialog("open");
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
        $.log("Clipboard: %o", this.clipboard);
    };

    Constr.prototype.paste = function() {
        var $this = this;
        $.log("Pasting resources %o to %s in mode %s", this.clipboard, this.dataSource.collection, this.clipboardMode);
        var params = { root: this.dataSource.collection };
        params[this.clipboardMode] = this.clipboard;
		$.getJSON("modules/collections.xq", params,
			function (data) {
				$.log(data.status);
				if (data.status == "fail") {
					eXide.util.Dialog.warning("Delete Resource Error", data.message);
				} else {
					$this.reload();
				}
			}
	    );
    };

    Constr.prototype.goto = function(row) {
		this.gridOptions.api.setFocusedCell(row);
    };

    Constr.prototype.focus = function() {
        this.container.find(".grid-canvas").focus();
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

	function initUpload(container, button, dropzone) {
	    var progressAll = $("#progress-all", container);
	    $(button).fileupload({
			sequentialUploads: true,
            autoUpload: false,
            dataType: 'json',
            dropZone: dropzone
        }).on('fileuploadadd', function (e, data) {
            $("#file_upload thead").show();
            $("#eXide-browse-spinner").show();
            data.context = $('#files');
            for (var i = 0; i < data.files.length; i++) {
                var count = data.context.find("tr").length;
                var file = data.files[i];
                if (file.name != ".") {
                    var node = null;
                    var path = file.name;
                    if (file.webkitRelativePath) {
                        path = file.webkitRelativePath;
                    } else if (file.relativePath) {
                        path = file.relativePath + path;
                    }
                    file.path = path;
                    if (count == 200) {
                        $('<tr><td colspan="3">Only 200 files are shown. More follow...</td></tr>').appendTo(data.context);
                    } else if (count < 200) {
                        node = $('<tr data-name="' + path + '"/>');
                        node.append($('<td/>').text(file.name));
                        node.append($('<td/>').text(file.size));
                        node.append($('<td class="file_upload_progress"><div class="ui-progressbar-value" style="width: 0%;"></div></td>'));
                        node.appendTo(data.context);
                    }

                    data.formData = {
                        path: path,
                        collection: $("input[name=\"collection\"]", container).val(),
                        deploy: $("input[name='deploy']", container).is(":checked")
                    };

                    var future = data.submit();
                    future.done(function() {
                        if (node) {
                            node.remove();
                        }
                    });
                }
            }
        }).on("fileuploadprogress", function (e, data) {
            $.each(data.files, function(index, file) {
                var progress = parseInt(data.loaded / data.total * 100, 10);
                var tr = $("tr[data-name='" + file.path + "']", container);
                tr.find(".ui-progressbar-value").css("width", progress + "%");
            });

        }).on("fileuploadprogressall", function (e, data) {
            var progress = parseInt(data.loaded / data.total * 100, 10);
            progressAll.css("width", progress + "%").text(progress + "%");
            if (progress >= 100) {
                $("#files").empty();
                $("#eXide-browse-spinner").hide();
            }
        }).on('fileuploaddone', function (e, data) {
            progressAll.empty().css("width", "0%");

        }).on('fileuploadfail', function (e, data) {
            console.log("error: ", data);
        });
	}

	Constr = function (container) {
		this.container = container;

		this.events = {
			"done": []
		};
		$("#progress-all").empty().css("width", "0%");
		initUpload(container, "#file_upload", $(".file_upload_drop"));
		if (isDirUploadSupported()) {
		    initUpload(container, "#dir_upload", null);
		} else {
		    $("#dir_upload").parent().hide();
		}

		var $this = this;
		$("#eXide-browse-upload-done").button({ "icons": { primary: "fa fa-times" }}).click(function() {
			$('#files').empty();
			$this.$triggerEvent("done", []);
		});
	}

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

	Constr.prototype.update = function(collection) {
        $.log("Upload collection: %s", collection);
        $("#files").empty();
        $("#file_upload thead").hide();
		$("input[name=\"collection\"]", this.container).val(collection);
	};

	return Constr;
}());

eXide.namespace("eXide.browse.Browser");

/**
 * Main interface for the open and save dialogs. Uses
 * a ResourceBrowser within a jquery.layout
 * panel.
 */
eXide.browse.Browser = (function () {

    function createButton(toolbar, title, id, index, imgPath) {
        var button = document.createElement("button");
    	button.title = title;
		button.id = "eXide-browse-toolbar-" + id;
		button.tabindex = index;
		var img = document.createElement("span");
		img.className = "fa fa-lg fa-" + imgPath;
// 		var img = document.createElement("img");
// 		img.src = "resources/images/" + imgPath;
		button.appendChild(img);
		toolbar.append(button);
        return button;
    }

	Constr = function (container) {
		var $this = this;
        this.mode = "open";

		var toolbar = $(".eXide-browse-toolbar", container);

		var button = createButton(toolbar, "Reload", "reload", 1, "refresh");
		$(button).click(function (ev) {
            $this.resources.reload(true);
		});

		this.btnRenameResource = createButton(toolbar, 'Rename Selected', 'rename', 2, 'edit');
		$(this.btnRenameResource).click((ev) => {
			this.resources.startEditing();
		});

        this.btnCreateCollection = createButton(toolbar, "Create Collection", "create", 3, "folder-o");
		$(this.btnCreateCollection).click(function (ev) {
			ev.preventDefault();
			$this.resources.createCollection();
		});

		this.btnUpload = createButton(toolbar, "Upload Files", "upload", 4, "cloud-upload");
		$(this.btnUpload).click(function (ev) {
			ev.preventDefault();
			$(".eXide-browse-resources", container).hide();
			$(".eXide-browse-upload", container).show();
			$this.$triggerEvent("upload-open", [true]);
		});

		this.btnDeleteResource = createButton(toolbar, "Delete", "delete-resource", 5, "trash-o");
		$(this.btnDeleteResource).click(function (ev) {
			ev.preventDefault();
			$this.deleteSelected();
		});

        this.btnProperties = createButton(toolbar, "Properties", "properties", 10, "info");
        $(this.btnProperties).click(function(ev) {
            ev.preventDefault();
            $this.resources.properties();
        });

		button = createButton(toolbar, "Open Selected", "open", 6, "folder-open-o");
		$(button).click(function (ev) {
			ev.preventDefault();
			eXide.app.openSelectedDocument(null, false);
		});

		button = createButton(toolbar, "Download Selected", "download", 11, "download");
		$(button).click(function (ev) {
			ev.preventDefault();
			const selected = $this.resources.getSelected();
			eXide.app.downloadSelectedResources(selected, false);
		});

        this.btnCopy = createButton(toolbar, "Copy", "copy", 7, "copy");
        this.btnCut = createButton(toolbar, "Cut", "cut", 8, "cut");
        this.btnPaste = createButton(toolbar, "Paste", "paste", 9, "paste");

		this.selection = $(".eXide-browse-form input", container);
		this.container = container;
		this.resources = new eXide.browse.ResourceBrowser(container, container);
		this.upload = new eXide.browse.Upload($(".eXide-browse-upload", container).hide());

		this.resources.addEventListener("activate", this, this.onActivateResource);
		this.resources.addEventListener("activateCollection", this, this.onActivateCollection);

		this.upload.addEventListener("done", this, function () {
			$(".eXide-browse-resources", container).show();
			$(".eXide-browse-upload", container).hide();
			$this.$triggerEvent("upload-open", [false]);
			this.reload();
		});

        $(this.btnCopy).click(function (ev) {
    		ev.preventDefault();
			$this.resources.copy();
		});
        $(this.btnCut).click(function (ev) {
        	ev.preventDefault();
			$this.resources.cut();
		});
        $(this.btnPaste).click(function (ev) {
        	ev.preventDefault();
			$this.resources.paste();
		});
		$("#eXide-browse-spinner").hide();
	};

	// Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

	/**
	 * jquery.layout needs to be initialized when the containing div
	 * becomes visible. This does not happen until the dialog is shown
	 * the first time.
	 */
	Constr.prototype.init = function() {
		this.resources.resize();
		this.resources.reload();
	};

	Constr.prototype.reload = function(buttons, mode) {
		if (buttons) {
			$(".eXide-browse-toolbar button", this.container).hide();
			for (var i = 0; i < buttons.length; i++) {
				$("#eXide-browse-toolbar-" + buttons[i]).show();
			}
		}
        if (mode) {
            this.mode = mode;
        }
        this.resources.setMode(mode);
        this.resources.reload();
		if (this.mode === "save") {
			$(".eXide-browse-form", this.container).show().focus();
		} else {
			$(".eXide-browse-form", this.container).hide();
		}

		this.resize();
		$(this.selection).val("");
	};

	Constr.prototype.resize = function() {
	};

    Constr.prototype.deleteSelected = function () {
        this.resources.deleteResource();
    };

	Constr.prototype.getSelection = function () {
		var name = $(this.selection).val();
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
			$(this.selection).val(doc.name);
		} else {
			$(this.selection).val("");
		}
		if (this.mode != "open" && writable) {
			$(this.btnRenameResource).css("display", "");
			$(this.btnDeleteResource).css("display", "");
            $(this.btnProperties).css("display", "");
		} else {
			$(this.btnDeleteResource).css("display", "none");
            $(this.btnProperties).css("display", "none");
		}
	};

	Constr.prototype.onActivateCollection = function (key, writable) {
        $.log("Activate collection: %s %s", key, this.mode);
        switch (this.mode) {
            case "open":
            case "save":
                $(".eXide-browse-toolbar button", this.container).hide();
                $(this.btnCreateCollection).css("display", "");
                break;
            default:
                if (writable) {
					$(this.btnRenameResource).css('display', '');
    				$(this.btnCreateCollection).css("display", "");
    				$(this.btnUpload).css("display", "");
                    $(this.btnCut).css("display", "");
                    $(this.btnPaste).css("display", "");
				    $(this.btnDeleteResource).css("display", "");
                } else {
                    $(this.btnCreateCollection).css("display", "none");
        			$(this.btnUpload).css("display", "none");
                    $(this.btnCut).css("display", "none");
                    $(this.btnPaste).css("display", "none");
				    $(this.btnDeleteResource).css("display", "none");
                }
        }
		this.upload.update(key, writable);
	};

	return Constr;
}());
