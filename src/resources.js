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
eXide.namespace("eXide.browse.CollectionBrowser");

/**
 * Manages a tree component for browsing collections
 */
eXide.browse.CollectionBrowser = (function () {
	
	Constr = function (container) {
		var $this = this;
		this.events = {
			"activate": []
		};
		this.selected = null;
		
		var treeDiv = document.createElement("div");
		treeDiv.className = "eXide-browse-collections eXide-browse-content";
		container.append(treeDiv);
		this.container = $(treeDiv);
		
		this.container.dynatree({
            persist: false,
            rootVisible: false,
            initAjax: { url: "modules/collections.xql" },
            clickFolderMode: 1,
            autoFocus: false,
            keyboard: false,
            onActivate: function (dtnode) {
                var key = dtnode.data.key;
                $.log("activate %s: is writable: %s", key, dtnode.data.writable);
                $this.selected = key;
                $this.$triggerEvent("activate", [key, dtnode.data.writable]);
            },
            onPostInit: function(isReloading, isError) {
                $.log("Reloading: %s", isReloading);
            	$this.select($this.selected);
            }
        });
	};
	
    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);
    
	Constr.prototype.getSelection = function () {
		return this.selected;
	};
	
    Constr.prototype.getSelected = function() {
        return {
            isCollection: false,
            name: this.selected
        };
    };
    
    Constr.prototype.select = function (key) {
        var tree = this.container.dynatree("getTree");
        var dbNode = null;
        if (key) {
    		dbNode = tree.getNodeByKey(key);
            if (dbNode == null) {
                var key = key.substring(0, key.lastIndexOf('/'));
                $.log("Activating parent collection %s", key);
                dbNode = tree.getNodeByKey(key);
            }
    	}
    	if (dbNode == null) {
            key = "/db";
    		dbNode = tree.getNodeByKey(key);
    	}
        if (dbNode != null)
            this.selected = key;
    	dbNode.activate();
    	dbNode.expand(true);
    };
    
	Constr.prototype.reload = function () {
		$.log("Reloading tree...");
		var tree = this.container.dynatree("getTree");
		tree.reload();
	};
	
    Constr.prototype.createCollection = function () {
		var $this = this;
		if (!eXide.app.$checkLogin())
			return;
		eXide.util.Dialog.input("Create Collection", 
				"<label for=\"collection\">Name: </label>" +
				"<input type=\"text\" name=\"collection\" id=\"eXide-browse-collection-name\"/>",
				function () {
					$.getJSON("modules/collections.xql", { 
							create: $("#eXide-browse-collection-name").val(), 
							collection: $this.selected
						},
						function (data) {
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
					$.getJSON("modules/collections.xql", { 
						remove: $this.selected
					},
					function (data) {
						if (data.status == "fail") {
							eXide.util.Dialog.warning("Delete Collection Error", data.message);
						} else {
							$this.reload();
						}
					}
				);
		});
	};

    return Constr;
}());

eXide.namespace("eXide.browse.ResourceBrowser");

/**
 * Manages a table view of resources within a collection
 */
eXide.browse.ResourceBrowser = (function () {
	
	var nameFormatter = function(row, cell, value, columnDef, dataContext) {
		if (dataContext.isCollection)
			return '<span class="collection"><img src="resources/images/folder_add.png"/> ' + value + '</span>';
		else
			return value;
	};
	
	var columns = [
	               {id: "name", name:"Name", field: "name", width: 120, formatter: nameFormatter, editor: Slick.Editors.Text},
	               {id: "permissions", name: "Permissions", field: "permissions", width: 80},
	               {id: "owner", name: "Owner", field: "owner", width: 70},
	               {id: "group", name: "Group", field: "group", width: 70},
	               {id: "lastMod", name: "Last Modified", field: "last-modified", width: 115}
	              ];
    
	var gridOptionsOpen = {
			editable: false,
			multiSelect: false
	};
	var gridOptionsManage = {
			editable: true,
            autoEdit: true,
			multiSelect: true,
            enableCellNavigation: true
	};
	
	Constr = function(container) {
		var $this = this;
		this.container = $(container);
        this.clipboard = [];
        this.clipboardMode = "copy";
		this.events = {
			"activate": [],
			"activateCollection": [],
			"activateParent": []
		};
        this.mode = "save";
        this.inEditor = false;
		this.collection = null;
		this.data = [];
		this.grid = new Slick.Grid(this.container, this.data, columns, gridOptionsManage);
		var selectionModel = new Slick.RowSelectionModel();
		this.grid.setSelectionModel(selectionModel);
		selectionModel.onSelectedRangesChanged.subscribe(function(e, args) {
			var rows = selectionModel.getSelectedRows();
            if ($this.data.length == 0) {
                return;
            }
			var enableWrite = true;
			for (var i = 0; i < rows.length; i++) {
				if (rows[i] < $this.data.length && !$this.data[rows[i]].writable) {
					enableWrite = false;
					break;
				}
			}
			var doc = rows.length == 1 && !$this.data[rows[0]].isCollection ? $this.data[rows[0]] : null;
			$this.$triggerEvent("activate", [ doc, enableWrite]);
		});
		this.grid.onDblClick.subscribe(function (e, args) {
			var cell = $this.grid.getCellFromEvent(e);
			if ($this.data[cell.row].isCollection) {
				// navigate to new collection
				var childColl = $this.collection + "/" + $this.data[cell.row].name;
				$this.$triggerEvent("activateCollection", [ childColl ]);
			}
		});
		this.grid.onKeyDown.subscribe(function (e) {
            if ($this.inEditor)
                return;
			if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
				if (e.which == 13) {
					e.stopPropagation();
		            e.preventDefault();
		            var rows = selectionModel.getSelectedRows();
		            if (rows.length == 1) {
						if ($this.data[rows[0]].isCollection) {
							// navigate to new collection
							var childColl = $this.collection + "/" + $this.data[rows[0]].name;
							$this.$triggerEvent("activateCollection", [ childColl ]);
						} else {
							eXide.app.openSelectedDocument();
						}
		            }
				} else if (e.which == 8) {
					var p = $this.collection.lastIndexOf("/");
					if (p > 0) {
						e.stopPropagation();
			            e.preventDefault();
			            if ($this.collection != "/db") {
			            	var parent = $this.collection.substring(0, p);
						
							// navigate to parent collection
							$this.$triggerEvent("activateCollection", [ parent ]);
						}
					}
				}
			}
		});
        this.grid.onBeforeEditCell.subscribe(function(e, args) {
            $this.inEditor = true;
            // save old value before editing
            $this.oldValue = $this.data[args.row].name;
        });
        this.grid.onBeforeCellEditorDestroy.subscribe(function(e, args) {
            $this.inEditor = false;
        });
        this.grid.onCellChange.subscribe(function(e, args) {
            if (!$this.oldValue) {
                return;
            }
            $.getJSON("modules/collections.xql", { 
					target: $this.data[args.row].name,
                    rename: $this.oldValue,
					root: $this.collection
				},
				function (data) {
					$this.reload();
                    if ($this.data[args.row].isCollection) {
                        $this.$triggerEvent("activateCollection", [ $this.data[args.row].name ]);
                    }
					if (data.status == "fail") {
						eXide.util.Dialog.warning("Rename Error", data.message);
					}
				}
		    );
        });
		this.grid.onViewportChanged.subscribe(function(e,args) {
            var vp = $this.grid.getViewport();
            $this.load(vp.top, vp.bottom);
        });
	};

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);
    
	Constr.prototype.setMode = function(value) {
        this.mode = value;
		if (value == "manage") {
			this.grid.setOptions(gridOptionsManage);
		} else {
			this.grid.setOptions(gridOptionsOpen);
		}
	};
	
	Constr.prototype.resize = function () {
		this.grid.resizeCanvas();
		this.container.find(".grid-canvas").focus();
	};
	
	Constr.prototype.update = function(collection, reload) {
        if (!reload && collection === this.collection)
            return;
		$.log("Opening resources for %s", collection);
		this.collection = collection;
		this.grid.invalidate();
		this.data.length = 0;
		this.grid.resetActiveCell();
        this.grid.setSelectedRows([]);
		this.grid.onViewportChanged.notify();
	};
	
	Constr.prototype.load = function (start, end) {
		var $this = this;
		var params = { root: this.collection, view: "r", start: start, end: end };
		$.getJSON("modules/collections.xql", params, function (data) {
			for (var i = start; i <= end; i++) {
				$this.grid.invalidateRow(i);
			}
			if (data && data.items) {
				$this.data.length = data.total;
				for (var i = 0; i < data.items.length; i++) {
					$this.data[start + i] = data.items[i];
				}
			} else {
				$this.data.length = 0;
			}
			$this.grid.updateRowCount();
			$this.grid.render();
			if (start == 0) {
                $this.grid.setActiveCell(0, 1);
			    $this.container.find(".grid-canvas").focus();
			}
		});
	};
	
	Constr.prototype.hasSelection = function () {
		var rows = this.grid.getSelectionModel().getSelectedRows();
		return rows && rows.length > 0;
	};
	
    Constr.prototype.getSelected = function() {
        var selected = this.grid.getSelectionModel().getSelectedRows();
		if (selected.length == 0) {
			return null;
		}
        var items = [];
        for (var i = 0; i < selected.length; i++) {
            var item = this.collection + "/" + this.data[selected[i]].name;
            items.push(item);
        }
        return items;
    };
    
	Constr.prototype.deleteResource = function() {
		var selected = this.grid.getSelectionModel().getSelectedRows();
		if (selected.length == 0) {
			return;
		}
		var resources = [];
		for (var i = 0; i < selected.length; i++) {
			resources.push(this.data[selected[i]].name);
		}
		var $this = this;
		eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete the selected resources?",
				function () {
					$.log("Deleting resources %o", resources);
					$.getJSON("modules/collections.xql", { 
							remove: resources,
							root: $this.collection
						},
						function (data) {
							$this.reload();
							if (data.status == "fail") {
								eXide.util.Dialog.warning("Delete Resource Error", data.message);
							}
						}
				    );
		});
	};
	
    Constr.prototype.cut = function() {
        this.clipboardMode = "move";
        this.copy();
    };
    
    Constr.prototype.copy = function() {
        var selected = this.grid.getSelectionModel().getSelectedRows();
        this.clipboard = [];
		for (var i = 0; i < selected.length; i++) {
            var path = this.data[selected[i]].name;
            if (path.substr(0, 1) != "/") {
                path = this.collection + "/" + path;
            }
			this.clipboard.push(path);
		}
        $.log("Clipboard: %o", this.clipboard);
    };
    
    Constr.prototype.paste = function() {
        var $this = this;
        $.log("Copying resources %o to %s", this.clipboard, this.collection);
        var params = { root: this.collection };
        params[this.clipboardMode] = this.clipboard;
		$.getJSON("modules/collections.xql", params,
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
    
    Constr.prototype.focus = function() {
        this.container.find(".grid-canvas").focus();
    };
    
	Constr.prototype.reload = function() {
		this.update(this.collection, true);
	};
	
	return Constr;
}());

eXide.namespace("eXide.browse.Upload");

/**
 * File upload widget
 */
eXide.browse.Upload = (function () {
	
	Constr = function (container) {
		this.container = container;
		
		this.events = {
			"done": []
		};
		
		$("#file_upload").fileUploadUI({
			sequentialUploads: true,
	        uploadTable: $('#files'),
	        buildUploadRow: function (files, index, handler) {
	            return $('<tr><td>' + files[index].name + '<\/td>' +
	                    '<td class="file_upload_progress"><div><\/div><\/td>' +
	                    '<td class="file_upload_cancel">' +
	                    '<button class="ui-state-default ui-corner-all" title="Cancel">' +
	                    '<span class="ui-icon ui-icon-cancel">Cancel<\/span>' +
	                    '<\/button><\/td><\/tr>');
	        },
	        buildDownloadRow: function (info) {
	        	if (info.error) {
	        		return $("<tr><td>" + info.name + "</td><td>" + info.error + "</td></tr>");
	        	}
	        	return null;
	        }
	    });
		var $this = this;
		$("#eXide-browse-upload-done").button().click(function() {
			$('#files').empty();
			$this.$triggerEvent("done", []);
		});
	}
	
    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);
    
	Constr.prototype.update = function(collection) {
			$("input[name=\"collection\"]", this.container).val(collection);
	};
	
	return Constr;
}());

eXide.namespace("eXide.browse.Browser");

/**
 * Main interface for the open and save dialogs. Uses
 * a ResourceBrowser and CollectionBrowser within a jquery.layout
 * panel.
 */
eXide.browse.Browser = (function () {

    function createButton(toolbar, title, id, index, imgPath) {
        var button = document.createElement("button");
    	button.title = title;
		button.id = "eXide-browse-toolbar-" + id;
		button.tabindex = index;
		var img = document.createElement("img");
		img.src = "resources/images/" + imgPath;
		button.appendChild(img);
		toolbar.append(button);
        return button;
    }
    
	Constr = function (container) {
		var $this = this;
        this.mode = "open";
		var toolbar = $(".eXide-browse-toolbar", container);
		
		var button = createButton(toolbar, "Reload", "reload", 1, "arrow_refresh.png");
		$(button).click(function (ev) {
            $this.resources.reload(true);
			$this.collections.reload();
		});
		
        this.btnCreateCollection = createButton(toolbar, "Create Collection", "create", 3, "folder_add.png");
		$(this.btnCreateCollection).click(function (ev) {
			ev.preventDefault();
			$this.collections.createCollection();
		});
		
		this.btnUpload = createButton(toolbar, "Upload Files", "upload", 4, "database_add.png");
		$(this.btnUpload).click(function (ev) {
			ev.preventDefault();
			$(".eXide-browse-resources", container).hide();
			$(".eXide-browse-upload", container).show();
		});
		
		this.btnDeleteResource = createButton(toolbar, "Delete", "delete-resource", 5, "bin.png")
		$(this.btnDeleteResource).click(function (ev) {
			ev.preventDefault();
			$this.deleteSelected();
		});
		
		button = createButton(toolbar, "Open Selected", "open", 6, "page_edit.png");
		$(button).click(function (ev) {
			ev.preventDefault();
			eXide.app.openSelectedDocument(false);
		});
		
        this.btnCopy = createButton(toolbar, "Copy", "copy", 7, "page_copy.png");
        this.btnCut = createButton(toolbar, "Cut", "cut", 8, "cut.png");
        this.btnPaste = createButton(toolbar, "Paste", "paste", 9, "page_paste.png");
        
		this.selection = $(".eXide-browse-form input", container);
		this.container = container;
		this.resources = new eXide.browse.ResourceBrowser($(".eXide-browse-resources", container));
		this.collections = new eXide.browse.CollectionBrowser($(".eXide-browse-collections", container));
		this.upload = new eXide.browse.Upload($(".eXide-browse-upload", container).hide());
		this.layout = null;
		
		this.collections.addEventListener("activate", this, this.onActivateCollection);
		this.collections.addEventListener("activate", this.resources, this.resources.update);
		this.collections.addEventListener("activate", this.upload, this.upload.update);
		this.resources.addEventListener("activate", this, this.onActivateResource);
		this.resources.addEventListener("activateCollection", this, this.onChangeCollection);
		this.upload.addEventListener("done", this, function () {
			$(".eXide-browse-resources", container).show();
			$(".eXide-browse-upload", container).hide();
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
	}
	
	Constr.prototype = {
		
		/**
		 * jquery.layout needs to be initialized when the containing div
		 * becomes visible. This does not happen until the dialog is shown
		 * the first time.
		 */
		init: function() {
			var h = $(this.container).innerHeight()  - 
				$(".eXide-browse-form", this.container).height() - 25;
			$(".eXide-browse-panel", this.container).height(h);
			if (this.layout == null) {
				this.layout = $(".eXide-browse-panel", this.container).layout({
					enableCursorHotkey: false,
					north__resizable: false,
					north__closable: false,
					north__spacing_open: 0, 
					south__resizable: false,
					west__size: 200,
					west__initClosed: false,
					west__contentSelector: ".eXide-browse-content",
					center__minSize: 300,
					center__contentSelector: ".eXide-browse-content",
					onresize: function () {
						this.resources.resize();
					}
				});
				this.resources.resize();
			}
		},
		
		reload: function(buttons, mode) {
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
			if (this.mode === "save") {
				$(".eXide-browse-form", this.container).show().focus();
			} else {
				$(".eXide-browse-form", this.container).hide();
			}
			if (this.layout != null) {
				this.resize();
				this.collections.reload();
				this.resources.update(this.collections.getSelection(), true);
				$(this.selection).val("");
			}
		},
		
		resize: function() {
			var h = $(this.container).innerHeight() - 
				$(".eXide-browse-form", this.container).height() - 25;
			$(".eXide-browse-panel", this.container).height(h);
			this.layout.resizeAll();
		},
		
        deleteSelected: function () {
            var selected = this.resources.getSelected();
            if (selected == null) {
                selected = this.collections.getSelected();
    			var $this = this;
    			eXide.util.Dialog.input("Confirm Deletion", "Are you sure you want to delete the selected collections?",
					function () {
						$.log("Deleting collection %o", selected);
						$.getJSON("modules/collections.xql", { 
    							remove: [ selected.name ]
    						},
    						function (data) {
								$this.reload();
    							if (data.status == "fail") {
    								eXide.util.Dialog.warning("Delete Collection Error", data.message);
    							}
    						}
					    );
    			});
            } else {
                this.resources.deleteResource();
            }
        },
        
		getSelection: function () {
			var name = $(this.selection).val();
			if (name == null || name == '')
				return null;
			return {
				name: name,
				path: this.collections.getSelection() + "/" + name,
				writable: true
			};
		},
		
		onActivateResource: function (doc, writable) {
			if (doc) {
				$(this.selection).val(doc.name);
			} else {
				$(this.selection).val("");
			}
			if (this.mode != "open" && writable) {
				$(this.btnDeleteResource).css("display", "");
			} else {
				$(this.btnDeleteResource).css("display", "none");
			}
		},
		
		onActivateCollection: function (key, writable) {
			if (this.mode != "open" && writable) {
				$(this.btnCreateCollection).css("display", "");
				$(this.btnUpload).css("display", "");
				$(this.btnDeleteResource).css("display", "");
                $(this.btnCut).css("display", "");
                $(this.btnPaste).css("display", "");
			} else {
				$(this.btnCreateCollection).css("display", "none");
				$(this.btnUpload).css("display", "none");
				$(this.btnDeleteResource).css("display", "none");
                $(this.btnCut).css("display", "none");
                $(this.btnPaste).css("display", "none");
			}
				
			this.resources.update(key, writable);
			this.upload.update(key, writable);
		},
		
		onChangeCollection: function (path) {
			this.collections.select(path);
			this.collections.reload();
			this.resources.update(this.collections.getSelection());
		},
        
        onChange: function() {
            $.log("Reloading db manager views");
            this.collections.reload();
        }
	};
	
	return Constr;
}());
