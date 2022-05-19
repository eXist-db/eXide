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
eXide.namespace("eXide.util.Menubar");

/**
 * Implements the main menubar behaviour
 */
eXide.util.Menubar = (function() {
    
    Constr = function (container) {
        var $this = this;
        this.container = container;
        this.editor = null;
        this.commands = {};
        
        var menuVisible = false;
        
        // Display sub menu on click
		$("ul li>a", this.container).click(function (ev) {
            var link = $(this);
            var openMenu = $("ul li>a.open", $this.container);
            if (openMenu.length > 0) {
                openMenu.removeClass("open");
                openMenu.next("ul").fadeOut(100, function() {
                    link.addClass("open");
                    link.next("ul").fadeIn(100);
                });
            } else {
                link.addClass("open");
                link.next("ul").fadeIn(200);
            }
            menuVisible = true;
            return false;
		});
        $("body").click(function () {
            if (menuVisible) {
                $("ul li ul", $this.container).fadeOut(100);
                $("ul li>a", $this.container).removeClass("open");
            }
        });
    };
    
    Constr.prototype.commandPalette = function() {
        var self = this;
	    var popupItems = [];
	    for (var key in self.commands) {
	        var command = self.commands[key];
	        popupItems.push(command);
	    }

        if (popupItems.length > 1) {
            var left = this.editor.getOffset().left;
            eXide.util.Popup.position({ pageX: left, pageY: 40 });
            eXide.util.Popup.show(popupItems, function (selected) {
                if (selected) {
                    selected.callback();
                    if (self.editor) {
                        self.editor.focus();
                    }
                }
            });
        }
    };
    
    Constr.prototype.click = function(selector, callback, action) {
        var $this = this;
        var item = $(selector);
        var label = item.text();
        if (!action) {
            action = item.attr("data-command");
        }
        if (action) {
            var shortcut = eXide.edit.commands.getShortcut(action);
            if (shortcut) {
                // replace "Command" with Apple Command Symbol
                shortcut = shortcut.replace(/Command/g, String.fromCharCode(8984));
                shortcut = shortcut.replace(/Shift/g, String.fromCharCode(8679));
                shortcut = shortcut.replace(/Option/g, String.fromCharCode(8997));
                shortcut = shortcut.replace(/Control/g, "^");
                item.each(function() {
                    var span = document.createElement("span");
                    span.className = "shortcut";
                    span.appendChild(document.createTextNode(shortcut));
                    this.appendChild(span);
                });
            }
        }
        if (item.attr("id")) {
            $this.commands[item.attr("id")] = {
                label: [label, item.find(".shortcut").text()],
                callback: callback
            };
        }
        item.click(function(ev) {
            ev.preventDefault();
            callback();
            if ($this.editor) {
                $this.editor.focus();
            }
            if($('#login-dialog').is(':visible')) {
                $("#login-dialog input:first").focus();
            }
            $("ul li ul", $this.container).fadeOut(100);
            $("ul li>a", $this.container).removeClass("open");
        });
    };
    
    Constr.prototype.add = function(menu, label, title, index, onclick) {
        var $this = this;
        var shortcut = "";
        if (index < 10) {
            shortcut = "<span class=\"shortcut\">" + eXide.edit.commands.getShortcut("gotoTab" + index) + "</span>";
        }
        var menu = $(this.container).find("ul li[title=\"" + menu + "\"]");
        var ul = menu.find("ul");
        ul.append($("<li><a href=\"#\" title=\"" + title + "\">" + label + shortcut + "</a></li>"));
        var item = ul.find("li:last-child a");
        item.click(function(ev) {
            ev.preventDefault();
            ul.fadeOut(100);
            $("ul li>a", $this.container).removeClass("open");
            onclick();
            if ($this.editor) {
                $this.editor.focus();
            }
        });
    };
    
    Constr.prototype.remove = function(menu, title) {
        var menu = $(this.container).find("ul li[title=\"" + menu + "\"]");
        menu.find("ul li a[title = \"" + title + "\"]").remove();
    };
    
    Constr.prototype.removeAll = function(menu) {
        var menu = $(this.container).find("ul li[title=\"" + menu + "\"] ul");
        menu.empty();
    };
    
    return Constr;
}());