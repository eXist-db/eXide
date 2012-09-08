eXide.namespace("eXide.find.IncrementalSearch");

eXide.find.IncrementalSearch = (function () {
    
    var searchOptions = {
        backwards: false,
        wrap: false,
        caseSensitive: false,
        wholeWord: false,
        regExp: false
    };
    
    Constr = function (input, editor) {
        var $this = this;
        $this.input = $(input);
        $this.input.hide();
        $this.input.keydown(function (ev) {
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
    };
    
    return Constr;
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
        $.log("Initializing import module dialog");
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
