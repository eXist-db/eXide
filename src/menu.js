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

    const Constr = function (container) {
        const $this = this;
        this.container = typeof container === "string" ? document.querySelector(container) : container;
        this.editor = null;
        this.commands = {};

        let menuVisible = false;

        // Display sub menu on click
        const topLinks = this.container.querySelectorAll("ul li > a");
        for (let i = 0; i < topLinks.length; i++) {
            topLinks[i].addEventListener("click", function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                const link = this;
                const wasOpen = link.classList.contains("open");
                const openMenus = $this.container.querySelectorAll("ul li > a.open");
                for (let j = 0; j < openMenus.length; j++) {
                    openMenus[j].classList.remove("open");
                    const sub = openMenus[j].nextElementSibling;
                    if (sub && sub.tagName === "UL") sub.style.display = "none";
                }
                if (!wasOpen) {
                    link.classList.add("open");
                    const nextUl = link.nextElementSibling;
                    if (nextUl && nextUl.tagName === "UL") nextUl.style.display = "block";
                    menuVisible = true;
                } else {
                    menuVisible = false;
                }
            });
        }
        document.body.addEventListener("click", function() {
            if (menuVisible) {
                const subs = $this.container.querySelectorAll("ul li ul");
                for (let j = 0; j < subs.length; j++) subs[j].style.display = "none";
                const opens = $this.container.querySelectorAll("ul li > a.open");
                for (let j = 0; j < opens.length; j++) opens[j].classList.remove("open");
                menuVisible = false;
            }
        });
    };

    function closeMenus($this) {
        const subs = $this.container.querySelectorAll("ul li ul");
        for (let j = 0; j < subs.length; j++) subs[j].style.display = "none";
        const opens = $this.container.querySelectorAll("ul li > a.open");
        for (let j = 0; j < opens.length; j++) opens[j].classList.remove("open");
    }

    Constr.prototype.commandPalette = function() {
        const self = this;
        const items = [];
        for (const key in self.commands) {
            items.push(self.commands[key]);
        }
        if (items.length > 0) {
            eXide.util.QuickPicker.show(items, function (selected) {
                if (selected) {
                    selected.callback();
                }
                if (self.editor) self.editor.focus();
            }, { title: "Command Palette", placeholder: "Run command\u2026", parentEditor: self.editor });
        }
    };

    Constr.prototype.click = function(selector, callback, action) {
        const $this = this;
        const item = document.querySelector(selector);
        if (!item) return;
        const label = item.textContent;
        if (!action) {
            action = item.getAttribute("data-command");
        }
        if (action) {
            const shortcut = eXide.edit.commands.getShortcut(action);
            if (shortcut) {
                const span = document.createElement("span");
                span.className = "shortcut";
                span.appendChild(document.createTextNode(shortcut));
                item.appendChild(span);
            }
        }
        if (item.id) {
            const shortcutEl = item.querySelector(".shortcut");
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
            const loginDialog = document.getElementById("login-dialog");
            if (loginDialog) {
                const parentDialog = loginDialog.closest("dialog");
                if (parentDialog && parentDialog.open) {
                    const firstInput = loginDialog.querySelector("input");
                    if (firstInput) firstInput.focus();
                }
            }
            closeMenus($this);
        });
    };

    Constr.prototype.add = function(menu, label, title, index, onclick) {
        const $this = this;
        let shortcut = "";
        if (index < 10) {
            shortcut = "<span class=\"shortcut\">" + eXide.edit.commands.getShortcut("gotoTab" + index) + "</span>";
        }
        const menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"]");
        if (!menuEl) return;
        const ul = menuEl.querySelector("ul");
        if (!ul) return;
        const li = document.createElement("li");
        li.innerHTML = "<a href=\"#\" title=\"" + title + "\">" + label + shortcut + "</a>";
        ul.appendChild(li);
        const itemLink = li.querySelector("a");
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
        const menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"]");
        if (!menuEl) return;
        const link = menuEl.querySelector("ul li a[title=\"" + title + "\"]");
        if (link && link.parentNode) link.parentNode.remove();
    };

    Constr.prototype.removeAll = function(menu) {
        const menuEl = this.container.querySelector("ul li[title=\"" + menu + "\"] ul");
        if (menuEl) menuEl.innerHTML = "";
    };

    return Constr;
}());
