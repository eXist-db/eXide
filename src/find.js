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
        {id:"prefix", name:"Prefix", field:"prefix", width: 100},
		{id:"uri", name:"URI", field:"uri", width: 240},
		{id:"at", name:"Location", field:"at", width: 200}
	];
    var options = {
		editable: false,
        multiSelect: false
	};
    var moduleData = [];
    var grid;
    
    $(document).ready(function() {
        grid = new Slick.Grid("#module-list", moduleData, columns, options);
        var selectionModel = new Slick.RowSelectionModel({selectActiveRow: true});
    	grid.setSelectionModel(selectionModel);
        grid.onDblClick.subscribe(function (e, args) {
    		var cell = grid.getCellFromEvent(e);
            eXide.find.Modules.$triggerEvent("open", [ moduleData[cell.row] ]);
		});
        $("#select-module-dialog").dialog({
    		modal: false,
    		autoOpen: false,
    		height: 400,
    		width: 600,
            open: eXide.find.Modules.$init
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