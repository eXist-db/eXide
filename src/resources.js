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

eXide.namespace("eXide.browse.ResourceBrowser");

/**
 * Manages a table view of resources within a collection
 */
eXide.browse.ResourceBrowser = (function () {
	
	var nameFormatter = function(row, cell, value, columnDef, dataContext) {
		if (dataContext.isCollection)
			return '<span class="collection"><img src="resources/images/folder.png"/> ' + value + '</span>';
		else
			return value;
	};
	
	var columns = [
        {id: "name", name:"Name", field: "name", width: 180, formatter: nameFormatter, editor: Slick.Editors.Text},
        {id: "permissions", name: "Permissions", field: "permissions", width: 80},
        {id: "owner", name: "Owner", field: "owner", width: 65},
        {id: "group", name: "Group", field: "group", width: 65},
        {id: "lastMod", name: "Last Modified", field: "last-modified", width: 140}
    ];
    
	var gridOptionsOpen = {
			editable: false,
			multiSelect: false,
			forceSyncScrolling: true,
            forceFitColumns: true
	};
	var gridOptionsManage = {
			editable: true,
            autoEdit: true,
			multiSelect: true,
			autoHeight: false,
            enableCellNavigation: true,
            forceSyncScrolling: true,
            forceFitColumns: true
	};
	
	Constr = function(container, parentContainer) {
		var $this = this;
		this.container = $(container);
        this.breadcrumbs = $(".eXide-browse-breadcrumbs", parentContainer);
		this.loading = false;
        this.clipboard = [];
        this.clipboardMode = "copy";
		this.events = {
			"activate": [],
			"activateCollection": [],
			"activateParent": []
		};
        this.mode = "save";
        this.inEditor = false;
		this.collection = "/db";
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
				if (rows[i] < $this.data.length && $this.data[rows[i]] && !$this.data[rows[i]].writable) {
					enableWrite = false;
					break;
				}
			}
			var doc = rows.length == 1 && $this.data[rows[0]] && !$this.data[rows[0]].isCollection ? $this.data[rows[0]] : null;
			$this.$triggerEvent("activate", [ doc, enableWrite]);
		});
		this.grid.onDblClick.subscribe(function (e, args) {
			var cell = $this.grid.getCellFromEvent(e);
			if ($this.data[cell.row].isCollection) {
				// navigate to new collection
                var coll;
                if ($this.data[cell.row].name == "..")
                    coll = $this.collection.replace(/\/[^\/]+$/, "")
                else
    				coll = $this.collection + "/" + $this.data[cell.row].name;
                $this.$triggerEvent("activateCollection", [ coll, $this.data[cell.row].writable ]);
				$this.update(coll, false);
			} else {
    		    eXide.app.openSelectedDocument();   
			}
		});
		this.grid.onKeyDown.subscribe(function (e) {
            if ($this.inEditor)
                return;
			if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
                switch (e.which) {
    				case 13:
    					e.stopPropagation();
    		            e.preventDefault();
    		            var rows = selectionModel.getSelectedRows();
    		            if (rows.length == 1) {
    						if ($this.data[rows[0]].isCollection) {
    							// navigate to new collection
                                var coll;
                                if ($this.data[rows[0]].name == "..")
                                    coll = $this.collection.replace(/\/[^\/]+$/, "")
                                else
                        			coll = $this.collection + "/" + $this.data[rows[0]].name;
                                $this.$triggerEvent("activateCollection", [ coll, $this.data[rows[0]].writable ]);
                                $this.update(coll, false);
    						} else {
    							eXide.app.openSelectedDocument();
    						}
    		            }
                        break;
    				case 8:
                        e.stopPropagation();
    		            e.preventDefault();
    					var p = $this.collection.lastIndexOf("/");
    					if (p > 0) {
    			            if ($this.collection != "/db") {
    			            	var parent = $this.collection.substring(0, p);
    						
    							// navigate to parent collection
                                $this.$triggerEvent("activateCollection", [ parent ]);
    							$this.update(parent, false);
    						}
    					}
                        break;
                    case 46:
                        $this.deleteResource();
                        break;
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
                    if ($this.data[args.row] && $this.data[args.row].isCollection) {
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
                    var selected = $this.grid.getSelectionModel().getSelectedRows();
                    if (selected.length == 0) {
                		return;
            		}
            		var resources = [];
            		for (var i = 0; i < selected.length; i++) {
            			resources.push($this.collection + "/" + $this.data[selected[i]].name);
            		}
                    var params = $("form", dialog).serialize();
                    params = params + "&" + $.param({ "modify[]": resources});
                    $.getJSON("modules/collections.xql", params,
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
        this.collection = collection;
        this.updateBreadcrumbs();
    };
    
    Constr.prototype.updateBreadcrumbs = function() {
        this.breadcrumbs.empty();
        var self = this;
        var parts = this.collection.split("/");
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
		if (value == "manage") {
			this.grid.setOptions(gridOptionsManage);
		} else {
			this.grid.setOptions(gridOptionsOpen);
		}
	};
	
	Constr.prototype.resize = function () {
	    console.log("Resizing canvas...");
// 		this.grid.render();
        var h = $(".eXide-browse-main").height();
        $(".eXide-browse-resources").height(h);
		this.grid.resizeCanvas();
		this.grid.focus();
	};
	
	Constr.prototype.update = function(collection, reload) {
        if (!reload && collection === this.collection)
            return;
		$.log("Opening resources for %s", collection);
        this.setCollection(collection);
		this.grid.invalidate();
		this.data.length = 0;
        this.grid.setSelectedRows([]);
		this.grid.onViewportChanged.notify();
        this.grid.resetActiveCell();
		this.grid.setActiveCell(0, 1);
        this.grid.focus();
	};
	
	Constr.prototype.load = function (start, end) {
	   if (this.loading) {
	       return;
       }
        if (this.data[start] && (end >= this.data.length || this.data[end])) {
            return;
        }
		var $this = this;
		this.loading = true;
        end += 20;
		var params = { root: this.collection, view: "r", start: start, end: end };
		$.getJSON("modules/collections.xql", params, function (data) {
		    $this.loading = false;
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
                $this.grid.resetActiveCell();
                $this.grid.setActiveCell(0, 1);
			    $this.grid.focus();
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
    
    Constr.prototype.createCollection = function () {
    	var $this = this;
		if (!eXide.app.$checkLogin())
			return;
		eXide.util.Dialog.input("Create Collection", 
			"<label for=\"collection\">Name: </label>" +
			"<input type=\"text\" name=\"collection\" id=\"eXide-browse-collection-name\"/>",
			function () {
			    $("#eXide-browse-spinner").show();
				$.getJSON("modules/collections.xql", { 
						create: $("#eXide-browse-collection-name").val(), 
						collection: $this.collection
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
				$.getJSON("modules/collections.xql", { 
    					remove: $this.collection
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
				    $("#eXide-browse-spinner").show();
					$.getJSON("modules/collections.xql", { 
							remove: resources,
							root: $this.collection
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
        var selected = this.grid.getSelectionModel().getSelectedRows();
    	if (selected.length == 0) {
			return;
		}
		var resources = [];
		for (var i = 0; i < selected.length; i++) {
            if (this.data[selected[i]].name != "..") {
			    resources.push(this.collection + "/" + this.data[selected[i]].name);
            }
		}
        if (resources.length > 0) {
            $("#resource-properties-content").load("modules/collections.xql", { "properties": resources });
            $("#resource-properties-dialog").dialog("open");
        }
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
        this.grid.invalidate();
    	this.data.length = 0;
		this.update(this.collection, true);
		//TODO : modify this to add an event mechanism instead
		eXide.app.syncDirectory(this.collection);
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
            // $.each(data.files, function (index, file) {
            //     var error = $('<span class="text-danger"/>').text('File upload failed.');
            //     $(data.context.children()[index])
            //         .append('<br>')
            //         .append(error);
            // })
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
        
		button = createButton(toolbar, "Open Selected", "open", 6, "edit");
		$(button).click(function (ev) {
			ev.preventDefault();
			eXide.app.openSelectedDocument(false);
		});
		
        this.btnCopy = createButton(toolbar, "Copy", "copy", 7, "copy");
        this.btnCut = createButton(toolbar, "Cut", "cut", 8, "cut");
        this.btnPaste = createButton(toolbar, "Paste", "paste", 9, "paste");
        
		this.selection = $(".eXide-browse-form input", container);
		this.container = container;
		this.resources = new eXide.browse.ResourceBrowser($(".eXide-browse-resources", container), container);
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
        var selected = this.resources.getSelected();
        this.resources.deleteResource();
    };
    
	Constr.prototype.getSelection = function () {
		var name = $(this.selection).val();
		if (name == null || name == '')
			return null;
		return {
			name: name,
			path: this.resources.collection + "/" + name,
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
