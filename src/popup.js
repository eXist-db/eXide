/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2013 Wolfgang Meier
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
eXide.namespace("eXide.util.Popup");

/**
 * Display popup window for selecting an entry from an HTML table.
 * The user can cycle through the entries using the up/down keys.
 * Pressing return selects an item and passes it to the onSelect
 * callback function. Pressing any other key closes the popup and
 * calls onSelect with a null argument.
 */
eXide.util.Popup = (function () {
    
    var data = [];
    var container;
    var inner;
    var table;
    var parent;
    var tooltips = null;
    var selection = null;
    var onSelect = function() { };
    var filter = "";
    var keyDown = false;
    
    function init(div, editor) {
        container = $(div);
        parent = editor;
        
        var titlebar = $("<div class='title'><a href='#'>[X]</a><span>Type to filter</span></div>").appendTo(container);
        inner = $("<div class='items'><table></table></div>").appendTo(container);
        table = inner.find("table");
        tooltips = $("<div class='tooltips hide'></div>").appendTo(container);
        
		titlebar.find("a").click(function (ev) {
			ev.preventDefault();
			hide();
		});
		
        initKeyboardHandlers();
    }
    
    function initKeyboardHandlers() {
        $(container).on("keydown", function (ev) {
            keydown = true;
        	if (ev.which == 40) {
                ev.preventDefault();
                var pos = table.find("tr").index(selection);
    			var next = selection.nextAll(":visible").first();
    			if (next.length > 0) {
    				activate(next);
    			}
    		} else if (ev.which == 38) {
                ev.preventDefault();
    			var prev = selection.prevAll(":visible").first();
    			if (prev.length > 0) {
    				activate(prev);
    			}
    		} else if (ev.which == 13) {
                ev.preventDefault();
    			var pos = table.find("tr").index(selection);
    			
    			// close container and unbind event
    			hide();
    			
    			// pass content to callback function
    			onSelect.call(null, data[pos]);
    			
    		} else if (ev.which == 27) {
                ev.preventDefault();
    			// ESC key pressed: close container
    			hide();
    			
    			// apply callback with null argument 
    			onSelect.call(null, null);
    		} else if (ev.which == 8) {
                ev.preventDefault();
    		    if (filter.length > 0) {
    		        filter = filter.substring(0, filter.length - 1);   
                    filterEntries();
    		    }
    		}
    	});
        $(container).on("keypress", function (ev) {
            if (!keydown) {
                return;
            }
            var key = ev.which == 0 ? ev.keyCode : ev.which;
            switch(key) {
                case 40:
                case 38:
                case 13:
                case 27:
                case 8:
                    break;
                default:
                    filter = filter + String.fromCharCode(key);
                    filterEntries();
                    break;
            }
        });
    }
    
    function filterEntries() {
        $(container).find(".title span").text(filter);
        if (filter.length == 0) {
            table.find("tr").css("display", "");
        } else {
            table.find("tr").removeClass("selection").css("display", "none");
            var regex = new RegExp(filter, "i");
            table.find("tr").each(function(pos) {
                var label = $(this).find("td:first .label").text();
                if (regex.test(label)) {
                    $(this).css("display", "");
                }
            });
        }
        activate(table.find("tr:visible").first());
    }
    
    function activate(node) {
        if (node.length == 0) {
            return;
        }
        selection.removeClass("selection");
		node.addClass("selection");
		selection = node;
        var domNode = node[0];
        var domTable = inner[0];
		if (domNode.offsetTop < domTable.scrollTop)
            domTable.scrollTop = domNode.offsetTop - 3;
        else if (domNode.offsetTop + domNode.offsetHeight > domTable.scrollTop + domTable.clientHeight)
            domTable.scrollTop = domNode.offsetTop + domNode.offsetHeight - domTable.clientHeight + 3;
        
        var description = selection.find(".tooltip");
        if (description.length > 0) {
            toggleTooltip(true, function() {
                tooltips.empty().html(description[0].innerHTML);
            });
        } else {
            toggleTooltip(false);
        }
    }
    
    function compareLabels (a, b) {
		return (a.label == b.label) ? 0 : (a.label > b.label) ? 1 : -1;
	}
    
    function toggleTooltip(show, content) {
        var visible = tooltips.width() > 0;
        tooltips.empty();
        if (show) {
            if (!visible) {
                tooltips.removeClass("hide").animate({ width: 320 }, 300, function() {
                    tooltips.html(content);
                });
            } else {
                tooltips.html(content);
            }
        } else {
            if (visible) {
                tooltips.animate({ width: 0 }, 300, function() {
                    tooltips.addClass("hide");
                });
            }
        }
    }
    
    function hide() {
        // close container and unbind event
		container.css("display", "none");
		tooltips.css("width", "0").empty().addClass("hide");
        keydown = false;
        filter = "";
        $(container).find(".title span").text(filter);
        parent.focus();
    }
    
    function position(pos) {
        var lineHeight = 15;
        container.css({visibility: "hidden", display: "block"});
        container.css({ left: pos.pageX, top: pos.pageY + lineHeight });
        var winW = window.innerWidth || Math.max(document.body.offsetWidth, document.documentElement.offsetWidth);
        var winH = window.innerHeight || Math.max(document.body.offsetHeight, document.documentElement.offsetHeight);
        var box = container[0].getBoundingClientRect();
        var overlapX = box.right - winW, overlapY = box.bottom - winH;
        if (overlapX > 0) {
          if (box.right - box.left > winW) {
            container[0].style.width = (winW - 5) + "px";
            overlapX -= (box.right - box.left) - winW;
          }
          container.css("left", (left = pos.pageX - overlapX) + "px");
        }
        if (overlapY > 0) {
          var height = box.bottom - lineHeight - box.top;
          if (box.top - height > 0) {
            overlapY = (height + lineHeight);
            below = false;
          } else if (height > winH) {
            container.height((winH - 5) + "px");
            overlapY -= height - winH;
          }
          container.css("top", (top = pos.pageY - overlapY) + "px");
        }
        container.css({visibility: "visible", display: "none"});
    }
    
    function show(items, callback) {
        onSelect = callback;
        data = items;
        filter = "";
        table.empty();
        data.sort(compareLabels);
        
        for (var i = 0; i < data.length; i++) {
			var tr = document.createElement("tr");
			if (i == 0) {
				tr.className = "selection";
                selection = $(tr);
			}
            var td;
            if (data[i].label instanceof Array) {
                for (var j = 0; j < data[i].label.length; j++) {
                    td = document.createElement("td");
                    var span = document.createElement("span");
                    span.className = "label";
                    span.appendChild(document.createTextNode(data[i].label[j]));
                    td.appendChild(span);
                    tr.appendChild(td);
                }
            } else {
                td = document.createElement("td");
                var span = document.createElement("span");
                span.className = "label";
			    span.appendChild(document.createTextNode(data[i].label));
                td.appendChild(span);
                tr.appendChild(td);
            }
			if (data[i].tooltip) {
				var help = document.createElement("span");
				help.className = "tooltip";
                help.innerHTML = data[i].tooltip;
				
				td.appendChild(help);
			}
            table.append(tr);
			
			$(tr).click(function () {
				selection.removeClass("selection");
				$(this).addClass("selection");
                activate($(this));
			});
			$(tr).dblclick(function () {
				var pos = table.find("tr").index(selection);
				
				// close container and unbind event
				container.css("display", "none");
				if (tooltips)
					tooltips.css("display", "none");
				
				// pass content to callback function
				onSelect.call(null, data[pos]);
			});
		}
        
        activate(selection);
        
        container.fadeIn().focus();
    }
    
    return {
        "init": init,
        "show": show,
        "position": position
    };
}());