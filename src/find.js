eXide.namespace("eXide.find.IncrementalSearch");

eXide.find.IncrementalSearch = (function () {
    
    var searchOptions = {
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false
    };
    
    Constr = function (input, editor) {
        var $this = this;
        $this.input = $(input);
        $this.input.hide();
        $this.input.keyup(function (ev) {
            switch (ev.which) {
                case 27:
                case 13:
                    // ESC or Return pressed
                    ev.preventDefault();
                    $this.input.hide();
                    $this.editor.focus();
                    break;
                case 40:
                    // Down
                    ev.preventDefault();
                    $this.editor.findNext();
                    break;
                case 38:
                    // Up
                    ev.preventDefault();
                    $this.editor.findPrevious();
                    break;
                case 71:
                    // Ctrl-G, Command-G or Alt-G
                    if (ev.metaKey || ev.ctrlKey) {
                        ev.preventDefault();
                        $this.editor.findNext();
                        break;
                    }
                default:
                    $this.onChange();
                    break;
            }
        });
        $this.editor = editor;
    };
    
    Constr.prototype.start = function () {
        var sel = this.editor.getSession().getSelection();
        var lead = sel.getSelectionLead();
		this.currentLine = lead.row;
        this.input.val("");
        this.input.show().focus();
    };
    
    Constr.prototype.onChange = function () {
        this.editor.gotoLine(this.currentLine);
        var search = this.input.val();
        this.editor.find(search, searchOptions, true);
        this.input.focus();
    };
    
    return Constr;
}());

eXide.namespace("eXide.find.SearchReplace");

eXide.find.SearchReplace = (function () {
    
    var searchOptions = {
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false
    };
    
    Constr = function (editor) {
        var self = this;
        self.editor = editor;
        self.needleSet = false;
        self.lastSearch = null;
        self.container = $("#find-replace-dialog");
        self.container.dialog({
            modal: false,
    		autoOpen: false,
    		height: 300,
    		width: 600,
            buttons: {
                "Close": function () { $(this).dialog("close"); self.editor.focus(); },
                "Replace": function() {
                    self.replace(false);
                },
                "Replace All": function() {
                    self.replace(true);
                },
                "Find Next": function () { 
                    self.find(1);
                },
                "Find Previous": function() {
                    self.find(-1);
                }
            }
        });
    };
    
    Constr.prototype.open = function() {
        this.container.dialog("open");
        this.container.find("input[name='search']").focus();
    };
    
    Constr.prototype.find = function(direction) {
        var search = this.container.find("input[name='search']").val();
        $.log("Searching for %s", search);
        if (search && search.length > 0) {
            if (this.lastSearch != null && this.lastSearch == search) {
                if (direction == -1)
                    this.editor.findPrevious();
                else
                    this.editor.findNext();
            } else {
                this.editor.find(search, this.getOptions(), true);
                this.needleSet = true;
            }
            this.editor.focus();
        }
    };
    
    Constr.prototype.replace = function(all) {
        var search = this.container.find("input[name='search']").val();
        if (search && search.length > 0) {
            if (!this.needleSet) {
                this.editor.find(search, this.getOptions(), true);
                this.needleSet = true;
            }
            var replace = this.container.find("input[name='replace']").val();
            if (replace && replace.length > 0) {
                if (all) {
                    this.editor.replaceAll(replace);
                } else {
                    this.editor.replace(replace);
                    this.editor.findNext();
                }
            }
        }
    };
    
    Constr.prototype.getOptions = function() {
        var caseSensitive = this.container.find("input[name='case']").is(":checked");
        var regex = this.container.find("input[name = 'regex']").is(":checked");
        return {
            wrap: true,
            caseSensitive: caseSensitive,
            regExp: regex
        };
    };
    
    return Constr;
}());

eXide.namespace("eXide.find.Files");

eXide.find.Files = (function() {
    var dialog;
    
    $(document).ready(function() {
        dialog =  $("#find-dialog");
        dialog.dialog({
            title: "Search binary files",
            modal: false,
            autoOpen: false,
            height: 400,
    		width: 600
        });
    });
    
    return {
        open: function(doc, project, callback) {
            if (project) {
                dialog.find("input.project").get().disabled = false;
                dialog.find("input.project").val(project.root);
                dialog.find(".project-path").text(project.abbrev);
            } else {
                dialog.find("input.project").get().disabled = true;
            }
            dialog.find("input[name='collection']").val(doc.getBasePath());
            var buttons = {
                "Close": function () { $(this).dialog("close"); self.editor.focus(); },
                "Search": function() {
                    var params = dialog.find("form").serialize();
                    callback(params);
                    $(this).dialog("close");
                }
            };
            dialog.dialog("option", "buttons", buttons);
            dialog.dialog("open");
        }
    }
}());

eXide.namespace("eXide.find.Modules");

/**
 * Static utility methods.
 */
eXide.find.Modules = (function () {
    var events = {
		"open": [],
        "import": []
	};
    
    var columns = [
        {id:"prefix", name:"Prefix", field:"prefix", sortable: true, resizable: true, maxWidth: 100, minWidth: 60},
		{id:"uri", name:"URI", field:"uri", sortable: true, resizable: true, minWidth: 100},
		{id:"at", name:"Location", field:"at", sortable: true, resizable: true}
	];
    var options = {
		editable: false,
        multiSelect: false,
        forceFitColumns: true
	};
    var moduleData = [];
    var grid;
    
    $(document).ready(function() {
        $("#select-module-dialog").dialog({
        	modal: false,
    		autoOpen: false,
    		height: 400,
    		width: 600,
            open: eXide.find.Modules.$init
        });
        grid = new Slick.Grid("#module-list", moduleData, columns, options);
        var selectionModel = new Slick.RowSelectionModel({selectActiveRow: true});
    	grid.setSelectionModel(selectionModel);
        grid.onDblClick.subscribe(function (e, args) {
    		var cell = grid.getCellFromEvent(e);
            eXide.find.Modules.$triggerEvent("open", [ moduleData[cell.row] ]);
		});
        grid.onSort.subscribe(function (e, col) {
            $.log("sorting on field: %s", col.sortCol.field);
            moduleData.sort(function (m1, m2) {
                var field = col.sortCol.field;
                var sign = col.sortAsc ? 1 : -1;
                var value1 = m1[field], value2 = m2[field];
                var result = (value1 == value2 ? 0 : (value1 > value2 ? 1 : -1)) * sign;
                if (result != 0) {
                    return result;
                }
                return 0;
            });
            grid.invalidate();
            grid.render();
        });
    });
    
    return {
        select: function(mode) {
            var buttons = {
                "Open": function () { eXide.find.Modules.trigger("open"); $(this).dialog("close"); },
                "Cancel": function () { $(this).dialog("close"); }
            };
            if (mode == "xquery") {
                buttons["Import"] = function () { eXide.find.Modules.trigger("import"); $(this).dialog("close"); }
            };
            $("#select-module-dialog").dialog("option", "buttons", buttons);
            $("#select-module-dialog").dialog("open");
        },
        
        trigger: function(event) {
            var selected = grid.getSelectionModel().getSelectedRows();
            if (selected.length == 1) {
                eXide.find.Modules.$triggerEvent(event, [ moduleData[selected[0]] ]);
            }
        },
        
        $init: function() {
            grid.resizeCanvas();
            grid.invalidate();
    	    moduleData.length = 0;
            $.getJSON("modules/find.xql", function (data) {
                moduleData.length = data.length;
                for (var i = 0; i < data.length; i++) {
                    moduleData[i] = data[i];
                }
                grid.updateRowCount();
			    grid.render();
                grid.setActiveCell(0, 0);
    			grid.setSelectedRows([0]);
				$("#module-list").find(".grid-canvas").focus();
            })
        },
        
        addEventListener: function (name, obj, callback) {
    		var event = events[name];
			if (event) {
				event.push({
					obj: obj,
					callback: callback
				});
			}
		},
		
		$triggerEvent: function (name, args) {
			var event = events[name];
			if (event) {
				for (var i = 0; i < event.length; i++) {
					event[i].callback.apply(event[i].obj, args);
				}
			}
		}
    };
}());
