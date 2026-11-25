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

import { namespace } from "./namespace.js";

/**
 * QuickPicker — modal selection dialog replacing eXide.util.Popup.
 *
 * Uses native <dialog> with a text filter input, keyboard navigation
 * (Up/Down/Enter/Escape), and optional detail pane. Drop-in replacement
 * for the old Popup API.
 *
 * Usage:
 *   eXide.util.QuickPicker.show(items, callback, options)
 *
 * Items: array of { label, [detail], [tooltip], ...extra }
 *   - label: string or [col1, col2, ...] for multi-column display
 *   - detail: optional secondary text (displayed lighter)
 *   - tooltip: optional HTML shown in side panel on selection
 *   - extra properties are passed through to the callback
 *
 * callback(selected): called with the selected item, or null if cancelled
 * options: { title, placeholder, parentEditor }
 */
export const QuickPicker = (function () {

    let dialog = null;
    let filterInput = null;
    let listEl = null;
    let detailPane = null;
    let items = [];
    let filteredItems = [];
    let selectedIndex = 0;
    let onSelect = null;
    let parentEditor = null;

    function ensureDOM() {
        if (dialog) return;

        dialog = document.createElement("dialog");
        dialog.className = "quick-picker";
        dialog.innerHTML =
            '<div class="quick-picker-titlebar">' +
                '<span class="quick-picker-title"></span>' +
                '<button type="button" class="quick-picker-close">\u2715</button>' +
            '</div>' +
            '<div class="quick-picker-header">' +
                '<input type="text" class="quick-picker-filter" placeholder="Type to filter\u2026" autocomplete="off" spellcheck="false">' +
            '</div>' +
            '<div class="quick-picker-body">' +
                '<ul class="quick-picker-list" role="listbox"></ul>' +
                '<div class="quick-picker-detail"></div>' +
            '</div>';
        document.body.appendChild(dialog);

        // Close button
        dialog.querySelector(".quick-picker-close").addEventListener("click", cancel);

        // Drag support via title bar
        const titleBar = dialog.querySelector(".quick-picker-titlebar");
        titleBar.style.cursor = "move";
        let dragState = null;
        titleBar.addEventListener("mousedown", function(e) {
            if (e.target.classList.contains("quick-picker-close")) return;
            e.preventDefault();
            dragState = { startX: e.clientX, startY: e.clientY, origLeft: dialog.offsetLeft, origTop: dialog.offsetTop };
            function onMove(e) {
                if (!dragState) return;
                dialog.style.left = (dragState.origLeft + e.clientX - dragState.startX) + "px";
                dialog.style.top = (dragState.origTop + e.clientY - dragState.startY) + "px";
                dialog.style.transform = "none";
            }
            function onUp() {
                dragState = null;
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            }
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });

        filterInput = dialog.querySelector(".quick-picker-filter");
        listEl = dialog.querySelector(".quick-picker-list");
        detailPane = dialog.querySelector(".quick-picker-detail");

        filterInput.addEventListener("input", function () {
            applyFilter(filterInput.value);
        });

        dialog.addEventListener("keydown", function (ev) {
            if (ev.key === "ArrowDown") {
                ev.preventDefault();
                moveSelection(1);
            } else if (ev.key === "ArrowUp") {
                ev.preventDefault();
                moveSelection(-1);
            } else if (ev.key === "Enter") {
                ev.preventDefault();
                confirm();
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                cancel();
            }
        });

        dialog.addEventListener("close", function () {
            // Browser-initiated close (e.g. Escape on <dialog>)
            if (onSelect) {
                const cb = onSelect;
                onSelect = null;
                cb(null);
            }
            returnFocus();
        });

        listEl.addEventListener("click", function (ev) {
            const li = ev.target.closest("li");
            if (!li) return;
            const idx = Array.prototype.indexOf.call(listEl.children, li);
            if (idx >= 0) {
                selectedIndex = idx;
                renderSelection();
                confirm();
            }
        });
    }

    function show(itemsIn, callback, options) {
        options = options || {};
        ensureDOM();

        items = (itemsIn || []).slice().sort(function (a, b) {
            const la = Array.isArray(a.label) ? a.label[0] : a.label;
            const lb = Array.isArray(b.label) ? b.label[0] : b.label;
            return la < lb ? -1 : la > lb ? 1 : 0;
        });
        filteredItems = items;
        selectedIndex = 0;
        onSelect = callback;
        parentEditor = options.parentEditor || null;

        if (options.placeholder) filterInput.placeholder = options.placeholder;
        else filterInput.placeholder = "Type to filter\u2026";

        const titleEl = dialog.querySelector(".quick-picker-title");
        titleEl.textContent = options.title || "";

        // Reset position for each open
        dialog.style.left = "";
        dialog.style.top = "";
        dialog.style.transform = "";

        filterInput.value = "";
        renderList();
        dialog.showModal();
        filterInput.focus();
    }

    function applyFilter(text) {
        if (!text) {
            filteredItems = items;
        } else {
            const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filteredItems = items.filter(function (item) {
                const label = Array.isArray(item.label) ? item.label.join(" ") : item.label;
                return regex.test(label);
            });
        }
        selectedIndex = 0;
        renderList();
    }

    function renderList() {
        listEl.innerHTML = "";
        for (let i = 0; i < filteredItems.length; i++) {
            const item = filteredItems[i];
            const li = document.createElement("li");
            li.setAttribute("role", "option");

            if (Array.isArray(item.label)) {
                for (let j = 0; j < item.label.length; j++) {
                    const span = document.createElement("span");
                    span.className = j === 0 ? "quick-picker-label" : "quick-picker-shortcut";
                    span.textContent = item.label[j];
                    li.appendChild(span);
                }
            } else {
                const span = document.createElement("span");
                span.className = "quick-picker-label";
                span.textContent = item.label;
                li.appendChild(span);
            }

            if (item.detail) {
                const detail = document.createElement("span");
                detail.className = "quick-picker-item-detail";
                detail.textContent = item.detail;
                li.appendChild(detail);
            }

            if (i === selectedIndex) li.classList.add("selected");
            listEl.appendChild(li);
        }
        updateDetail();
    }

    function renderSelection() {
        const lis = listEl.querySelectorAll("li");
        for (let i = 0; i < lis.length; i++) {
            lis[i].classList.toggle("selected", i === selectedIndex);
        }
        // Scroll selected into view
        const sel = listEl.querySelector("li.selected");
        if (sel) sel.scrollIntoView({ block: "nearest" });
        updateDetail();
    }

    function updateDetail() {
        const item = filteredItems[selectedIndex];
        if (item && item.tooltip) {
            detailPane.innerHTML = item.tooltip;
            detailPane.classList.add("visible");
        } else {
            detailPane.innerHTML = "";
            detailPane.classList.remove("visible");
        }
    }

    function moveSelection(delta) {
        if (filteredItems.length === 0) return;
        selectedIndex = Math.max(0, Math.min(filteredItems.length - 1, selectedIndex + delta));
        renderSelection();
    }

    function confirm() {
        const selected = filteredItems[selectedIndex] || null;
        const cb = onSelect;
        onSelect = null;
        if (dialog.hasAttribute("open")) dialog.close();
        returnFocus();
        if (cb) cb(selected);
    }

    function cancel() {
        const cb = onSelect;
        onSelect = null;
        if (dialog.hasAttribute("open")) dialog.close();
        returnFocus();
        if (cb) cb(null);
    }

    function returnFocus() {
        if (parentEditor) {
            parentEditor.focus();
        }
    }

    return {
        show: show
    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.util").QuickPicker = QuickPicker;
