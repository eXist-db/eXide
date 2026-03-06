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
        this.container = typeof container === "string" ? document.querySelector(container) : container;
        this.editor = null;
        this.commands = {};

        var menuVisible = false;

        // Display sub menu on click
        var topLinks = this.container.querySelectorAll("ul li > a");
        for (var i = 0; i < topLinks.length; i++) {
            topLinks[i].addEventListener("click", function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var link = this;
                var openMenus = $this.container.querySelectorAll("ul li > a.open");
                if (openMenus.length > 0) {
                    for (var j = 0; j < openMenus.length; j++) {
                        openMenus[j].classList.remove("open");
                        var sub = openMenus[j].nextElementSibling;
                        if (sub && sub.tagName === "UL") sub.style.display = "none";
                    }
                }
                link.classList.add("open");
                var nextUl = link.nextElementSibling;
                if (nextUl && nextUl.tagName === "UL") nextUl.style.display = "block";
                menuVisible = true;
            });
        }
        document.body.addEventListener("click", function() {
            if (menuVisible) {
                var subs = $this.container.querySelectorAll("ul li ul");
                for (var j = 0; j < subs.length; j++) subs[j].style.display = "none";
                var opens = $this.container.querySelectorAll("ul li > a.open");
                for (var j = 0; j < opens.length; j++) opens[j].classList.remove("open");
                menuVisible = false;
            }
        });
    };

    function closeMenus($this) {
        var subs = $this.container.querySelectorAll("ul li ul");
        for (var j = 0; j < subs.length; j++) subs[j].style.display = "none";
        var opens = $this.container.querySelectorAll("ul li > a.open");
        for (var j = 0; j < opens.length; j++) opens[j].classList.remove("open");
    }

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
        var item = document.querySelector(selector);
        if (!item) return;
        var label = item.textContent;
        if (!action) {
            action = item.getAttribute("data-command");
        }
        if (action) {
            var shortcut = eXide.edit.commands.getShortcut(action);
            if (shortcut) {
                var span = document.createElement("span");
                span.className = "shortcut";
                span.appendChild(document.createTextNode(shortcut));
                item.appendChild(span);
            }
        }
        if (item.id) {
            var shortcutEl = item.querySelector(".shortcut");
            $this.commands[item.id] = {
                label: [label, shortcutEl ? shortcutEl.textContent : ""],
                callback: callback
            };
        }
        item.addEventListener("click", function(ev) {
            ev.preventDefault();
            callback();
            if ($this.editor) {
                $this.editor.focus();
            }
            var loginDialog = document.getElementById("login-dialog");
            if (loginDialog) {
                var parentDialog = loginDialog.closest("dialog");
                if (parentDialog && parentDialog.open) {
                    var firstInput = loginDialog.querySelector("input");
                    if (firstInput) firstInput.focus();
                }
            }
            closeMenus($this);
        });
    };

    Constr.prototype.add = function(menu, label, title, index, onclick) {
        var $this = this;
        var shortcut = "";
        if (index < 10) {
            shortcut = "<span class=\"shortcut\">" + eXide.edit.commands.getShortcut("gotoTab" + index) + "</span>";
        }
        var menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"]");
        if (!menuEl) return;
        var ul = menuEl.querySelector("ul");
        if (!ul) return;
        var li = document.createElement("li");
        li.innerHTML = "<a href=\"#\" title=\"" + title + "\">" + label + shortcut + "</a>";
        ul.appendChild(li);
        var itemLink = li.querySelector("a");
        itemLink.addEventListener("click", function(ev) {
            ev.preventDefault();
            closeMenus($this);
            onclick();
            if ($this.editor) {
                $this.editor.focus();
            }
        });
    };

    Constr.prototype.remove = function(menu, title) {
        var menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"]");
        if (!menuEl) return;
        var link = menuEl.querySelector("ul li a[title=\"" + title + "\"]");
        if (link && link.parentNode) link.parentNode.remove();
    };

    Constr.prototype.removeAll = function(menu) {
        var menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"] ul");
        if (menuEl) menuEl.innerHTML = "";
    };

    return Constr;
}());
