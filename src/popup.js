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
        container = typeof div === "string" ? document.querySelector(div) : div;
        parent = editor;

        var titlebar = document.createElement("div");
        titlebar.className = "title";
        titlebar.innerHTML = "<a href='#'>[X]</a><span>Type to filter</span>";
        container.appendChild(titlebar);

        inner = document.createElement("div");
        inner.className = "items";
        inner.innerHTML = "<table></table>";
        container.appendChild(inner);
        table = inner.querySelector("table");

        tooltips = document.createElement("div");
        tooltips.className = "tooltips hide";
        container.appendChild(tooltips);

        titlebar.querySelector("a").addEventListener("click", function(ev) {
            ev.preventDefault();
            hide();
        });

        initKeyboardHandlers();
    }

    function initKeyboardHandlers() {
        container.addEventListener("keydown", function (ev) {
            keyDown = true;
            if (ev.which == 40) {
                ev.preventDefault();
                var next = nextVisible(selection);
                if (next) {
                    activate(next);
                }
            } else if (ev.which == 38) {
                ev.preventDefault();
                var prev = prevVisible(selection);
                if (prev) {
                    activate(prev);
                }
            } else if (ev.which == 13) {
                ev.preventDefault();
                var pos = rowIndex(selection);
                hide();
                onSelect.call(null, data[pos]);
            } else if (ev.which == 27) {
                ev.preventDefault();
                hide();
                onSelect.call(null, null);
            } else if (ev.which == 8) {
                ev.preventDefault();
                if (filter.length > 0) {
                    filter = filter.substring(0, filter.length - 1);
                    filterEntries();
                }
            }
        });
        container.addEventListener("keypress", function (ev) {
            if (!keyDown) {
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

    function rowIndex(row) {
        var rows = table.querySelectorAll("tr");
        for (var i = 0; i < rows.length; i++) {
            if (rows[i] === row) return i;
        }
        return -1;
    }

    function nextVisible(row) {
        var el = row.nextElementSibling;
        while (el) {
            if (el.style.display !== "none") return el;
            el = el.nextElementSibling;
        }
        return null;
    }

    function prevVisible(row) {
        var el = row.previousElementSibling;
        while (el) {
            if (el.style.display !== "none") return el;
            el = el.previousElementSibling;
        }
        return null;
    }

    function filterEntries() {
        container.querySelector(".title span").textContent = filter;
        var rows = table.querySelectorAll("tr");
        if (filter.length == 0) {
            for (var i = 0; i < rows.length; i++) {
                rows[i].style.display = "";
            }
        } else {
            var regex = new RegExp(filter, "i");
            for (var i = 0; i < rows.length; i++) {
                rows[i].classList.remove("selection");
                rows[i].style.display = "none";
                var label = rows[i].querySelector("td:first-child .label");
                if (label && regex.test(label.textContent)) {
                    rows[i].style.display = "";
                }
            }
        }
        var first = table.querySelector("tr:not([style*='display: none'])");
        if (first) activate(first);
    }

    function activate(node) {
        if (!node) return;
        if (selection) selection.classList.remove("selection");
        node.classList.add("selection");
        selection = node;
        if (node.offsetTop < inner.scrollTop)
            inner.scrollTop = node.offsetTop - 3;
        else if (node.offsetTop + node.offsetHeight > inner.scrollTop + inner.clientHeight)
            inner.scrollTop = node.offsetTop + node.offsetHeight - inner.clientHeight + 3;

        var description = selection.querySelector(".tooltip");
        if (description) {
            toggleTooltip(true, function() {
                tooltips.innerHTML = description.innerHTML;
            });
        } else {
            toggleTooltip(false);
        }
    }

    function compareLabels (a, b) {
        return (a.label == b.label) ? 0 : (a.label > b.label) ? 1 : -1;
    }

    function toggleTooltip(show, content) {
        var visible = tooltips.offsetWidth > 0 && !tooltips.classList.contains("hide");
        tooltips.innerHTML = "";
        if (show) {
            if (!visible) {
                tooltips.classList.remove("hide");
                tooltips.style.width = "320px";
                if (content) content();
            } else {
                if (content) content();
            }
        } else {
            if (visible) {
                tooltips.style.width = "0";
                tooltips.classList.add("hide");
            }
        }
    }

    function hide() {
        container.style.display = "none";
        tooltips.style.width = "0";
        tooltips.innerHTML = "";
        tooltips.classList.add("hide");
        keyDown = false;
        filter = "";
        container.querySelector(".title span").textContent = filter;
        parent.focus();
    }

    function position(pos) {
        var lineHeight = 15;
        container.style.visibility = "hidden";
        container.style.display = "block";
        container.style.left = pos.pageX + "px";
        container.style.top = (pos.pageY + lineHeight) + "px";
        var winW = window.innerWidth || Math.max(document.body.offsetWidth, document.documentElement.offsetWidth);
        var winH = window.innerHeight || Math.max(document.body.offsetHeight, document.documentElement.offsetHeight);
        var box = container.getBoundingClientRect();
        var overlapX = box.right - winW, overlapY = box.bottom - winH;
        if (overlapX > 0) {
          if (box.right - box.left > winW) {
            container.style.width = (winW - 5) + "px";
            overlapX -= (box.right - box.left) - winW;
          }
          container.style.left = (pos.pageX - overlapX) + "px";
        }
        if (overlapY > 0) {
          var height = box.bottom - lineHeight - box.top;
          if (box.top - height > 0) {
            overlapY = (height + lineHeight);
          } else if (height > winH) {
            container.style.height = (winH - 5) + "px";
            overlapY -= height - winH;
          }
          container.style.top = (pos.pageY - overlapY) + "px";
        }
        container.style.visibility = "visible";
        container.style.display = "none";
    }

    function show(items, callback) {
        onSelect = callback;
        data = items;
        filter = "";
        table.innerHTML = "";
        data.sort(compareLabels);

        for (var i = 0; i < data.length; i++) {
            var tr = document.createElement("tr");
            if (i == 0) {
                tr.className = "selection";
                selection = tr;
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
            table.appendChild(tr);

            tr.addEventListener("click", function () {
                if (selection) selection.classList.remove("selection");
                this.classList.add("selection");
                activate(this);
            });
            tr.addEventListener("dblclick", function () {
                var pos = rowIndex(selection);
                container.style.display = "none";
                if (tooltips) tooltips.style.display = "none";
                onSelect.call(null, data[pos]);
            });
        }

        activate(selection);

        container.style.display = "block";
        container.focus();
    }

    return {
        "init": init,
        "show": show,
        "position": position
    };
}());
