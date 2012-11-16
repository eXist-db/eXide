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
        
        var menuVisible = false;
        
        // Display sub menu on click
		$("ul li", this.container).click(function (ev) {
            ev.stopPropagation();
            $("ul li ul", $this.container).css({display: "none"});
            $("ul", this).css({display: "block"});
            menuVisible = true;
		});
        $("body").click(function () {
            if (menuVisible) {
                $("ul li ul", $this.container).css({display: "none"});
            }
        });
    };
    
    Constr.prototype.click = function(selector, callback, action) {
        var $this = this;
        if (action) {
            var shortcut = eXide.edit.commands.getShortcut(action);
            if (shortcut) {
                // replace "Command" with Apple Command Symbol
                shortcut = shortcut.replace(/Command/g, String.fromCharCode(8984));
                shortcut = shortcut.replace(/Shift/g, String.fromCharCode(8679));
                shortcut = shortcut.replace(/Option/g, String.fromCharCode(8997));
                shortcut = shortcut.replace(/Control/g, "^");
                $(selector).each(function() {
                    var span = document.createElement("span");
                    span.className = "shortcut";
                    span.appendChild(document.createTextNode(shortcut));
                    this.appendChild(span);
                });
            }
        }
        $(selector).click(function(ev) {
            ev.preventDefault();
            $("ul li ul", $this.container).css({display: "none"});
            callback();
        });
    };
    
    Constr.prototype.add = function(menu, label, title, onclick) {
        var $this = this;
        var menu = $(this.container).find("ul li[title=\"" + menu + "\"]");
        var ul = menu.find("ul");
        ul.append($("<li><a href=\"#\" title=\"" + title + "\">" + label + "</a></li>"));
        var item = ul.find("li:last-child a");
        item.click(function(ev) {
            ev.preventDefault();
            onclick();
            $("ul li ul", $this.container).css({display: "none"});
        });
    };
    
    Constr.prototype.remove = function(menu, title) {
        $.log("Removing menu entry %s", title);
        var menu = $(this.container).find("ul li[title=\"" + menu + "\"]");
        menu.find("ul li a[title = \"" + title + "\"]").remove();
    };
    
    return Constr;
}());