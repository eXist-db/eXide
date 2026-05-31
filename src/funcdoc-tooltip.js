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

/**
 * Function documentation tooltip using CM6's showTooltip.
 *
 * Replaces eXide.util.Popup for the "Navigate > Function doc" use case.
 * Uses a StateField to manage tooltip lifecycle within CM6's state model.
 *
 * Data flow:
 *   1. User triggers showFunctionDoc → fetches from api/editor/completions
 *   2. Dispatches setFuncDocItems effect with structured results
 *   3. StateField creates tooltip anchored at cursor position
 *   4. Tooltip DOM: filter input + signature list + detail pane
 *   5. Escape / click-away → dispatches clearFuncDoc effect → tooltip removed
 *
 * Data format (from funcdoc.xq, adapted from atom-editor-support):
 *   { text, snippet, type, description, arguments[], leftLabel, path }
 *
 * Rendering adapted from existdb-langserver's getHover() which formats
 * signature + description + per-param details as Markdown for VS Code.
 * We render to HTML since we're in the browser.
 */
eXide.namespace("eXide.edit.FuncDocTooltip");

eXide.edit.FuncDocTooltip = (function () {

    var StateField = CM6.StateField;
    var StateEffect = CM6.StateEffect;
    var showTooltip = CM6.showTooltip;

    // --- Effects ---

    var setFuncDocItems = StateEffect.define();
    var clearFuncDoc = StateEffect.define();

    // --- Tooltip State Field ---

    var funcDocField = StateField.define({
        create: function () {
            return null;
        },
        update: function (value, tr) {
            for (var i = 0; i < tr.effects.length; i++) {
                var e = tr.effects[i];
                if (e.is(setFuncDocItems)) {
                    return e.value;
                }
                if (e.is(clearFuncDoc)) {
                    return null;
                }
            }
            return value;
        },
        provide: function (field) {
            return showTooltip.computeN([field], function (state) {
                var data = state.field(field);
                if (!data) return [];
                return [makeTooltip(data)];
            });
        }
    });

    // --- Tooltip DOM Builder ---

    function makeTooltip(data) {
        return {
            pos: data.pos,
            above: true,
            strictSide: false,
            arrow: false,
            create: function (view) {
                return { dom: buildTooltipDOM(view, data) };
            }
        };
    }

    function buildTooltipDOM(view, data) {
        var items = data.items;
        var onSelect = data.onSelect;

        var container = document.createElement("div");
        container.className = "cm-funcdoc-tooltip";
        container.setAttribute("tabindex", "0");

        // --- Filter bar ---
        var filterBar = document.createElement("div");
        filterBar.className = "cm-funcdoc-filter";
        var filterInput = document.createElement("input");
        filterInput.type = "text";
        filterInput.placeholder = "Type to filter\u2026";
        filterInput.className = "cm-funcdoc-filter-input";
        filterBar.appendChild(filterInput);
        container.appendChild(filterBar);

        // --- Two-panel body ---
        var body = document.createElement("div");
        body.className = "cm-funcdoc-body";

        var listPane = document.createElement("div");
        listPane.className = "cm-funcdoc-list";

        var detailPane = document.createElement("div");
        detailPane.className = "cm-funcdoc-detail";
        detailPane.innerHTML = "<p class='cm-funcdoc-detail-placeholder'>Select a function to view documentation</p>";

        body.appendChild(listPane);
        body.appendChild(detailPane);
        container.appendChild(body);

        // --- Status bar ---
        var statusBar = document.createElement("div");
        statusBar.className = "cm-funcdoc-status";
        statusBar.textContent = items.length + " match" + (items.length !== 1 ? "es" : "");
        container.appendChild(statusBar);

        // --- Populate list ---
        var rows = [];
        var selectedIndex = 0;

        function renderList(filtered) {
            listPane.innerHTML = "";
            rows = [];
            for (var i = 0; i < filtered.length; i++) {
                var row = createRow(filtered[i], i);
                rows.push({ el: row, item: filtered[i] });
                listPane.appendChild(row);
            }
            statusBar.textContent = filtered.length + " match" + (filtered.length !== 1 ? "es" : "");
            if (rows.length > 0) {
                selectedIndex = 0;
                activateRow(0);
            } else {
                detailPane.innerHTML = "<p class='cm-funcdoc-detail-placeholder'>No matches</p>";
            }
        }

        function createRow(item, index) {
            var row = document.createElement("div");
            row.className = "cm-funcdoc-row";
            row.setAttribute("data-index", index);

            var sigSpan = document.createElement("span");
            sigSpan.className = "cm-funcdoc-sig";
            sigSpan.textContent = item.text || item.signature || item.name || item.label;
            row.appendChild(sigSpan);

            // Return type badge (from funcdoc.xq's leftLabel field,
            // mirroring atom-editor-support's leftLabel convention)
            if (item.leftLabel) {
                var retType = document.createElement("span");
                retType.className = "cm-funcdoc-return-type";
                retType.textContent = item.leftLabel;
                row.appendChild(retType);
            }

            row.addEventListener("click", function () {
                activateRow(parseInt(row.getAttribute("data-index"), 10));
            });

            row.addEventListener("dblclick", function () {
                if (onSelect) {
                    onSelect(rows[parseInt(row.getAttribute("data-index"), 10)].item);
                }
                dismiss(view);
            });

            return row;
        }

        function activateRow(index) {
            if (index < 0 || index >= rows.length) return;
            for (var i = 0; i < rows.length; i++) {
                rows[i].el.classList.toggle("cm-funcdoc-selected", i === index);
            }
            selectedIndex = index;

            // Scroll into view
            var el = rows[index].el;
            if (el.offsetTop < listPane.scrollTop) {
                listPane.scrollTop = el.offsetTop;
            } else if (el.offsetTop + el.offsetHeight > listPane.scrollTop + listPane.clientHeight) {
                listPane.scrollTop = el.offsetTop + el.offsetHeight - listPane.clientHeight;
            }

            showDetail(rows[index].item);
        }

        /**
         * Render function documentation in the detail pane.
         *
         * Handles two data formats:
         *   1. Structured (from funcdoc.xq): description, arguments[], leftLabel
         *   2. Legacy (from docs.xq / local functions): help (pre-rendered HTML)
         *
         * The structured format is adapted from atom-editor-support and
         * rendered similarly to existdb-langserver's getHover(), which
         * produces: **signature** as **returnType** + description + params.
         */
        function showDetail(item) {
            detailPane.innerHTML = "";

            // --- Signature header ---
            var sigHeader = document.createElement("div");
            sigHeader.className = "cm-funcdoc-detail-sig";
            var code = document.createElement("code");
            code.textContent = item.text || item.signature || item.name || item.label;
            sigHeader.appendChild(code);
            if (item.leftLabel) {
                var retSpan = document.createElement("span");
                retSpan.className = "cm-funcdoc-detail-returns-inline";
                retSpan.textContent = " as " + item.leftLabel;
                sigHeader.appendChild(retSpan);
            }
            detailPane.appendChild(sigHeader);

            // --- Structured documentation (funcdoc.xq format) ---
            if (item.description || (item.arguments && item.arguments.length > 0)) {
                if (item.description) {
                    var descP = document.createElement("p");
                    descP.className = "cm-funcdoc-description";
                    descP.textContent = item.description;
                    detailPane.appendChild(descP);
                }

                // Per-argument documentation (structured, from funcdoc.xq)
                if (item.arguments && item.arguments.length > 0) {
                    var argsSection = document.createElement("div");
                    argsSection.className = "cm-funcdoc-args";
                    var argsTitle = document.createElement("div");
                    argsTitle.className = "cm-funcdoc-args-title";
                    argsTitle.textContent = "Parameters";
                    argsSection.appendChild(argsTitle);

                    var dl = document.createElement("dl");
                    for (var i = 0; i < item.arguments.length; i++) {
                        var arg = item.arguments[i];
                        var dt = document.createElement("dt");
                        dt.textContent = "$" + arg.name + " as " + arg.type;
                        dl.appendChild(dt);
                        if (arg.description) {
                            var dd = document.createElement("dd");
                            dd.textContent = arg.description;
                            dl.appendChild(dd);
                        }
                    }
                    argsSection.appendChild(dl);
                    detailPane.appendChild(argsSection);
                }

                // Return type
                if (item.leftLabel) {
                    var retSection = document.createElement("div");
                    retSection.className = "cm-funcdoc-returns";
                    var retTitle = document.createElement("span");
                    retTitle.className = "cm-funcdoc-returns-label";
                    retTitle.textContent = "Returns: ";
                    retSection.appendChild(retTitle);
                    var retVal = document.createElement("code");
                    retVal.textContent = item.leftLabel;
                    retSection.appendChild(retVal);
                    detailPane.appendChild(retSection);
                }
            }
            // --- Legacy HTML documentation (docs.xq / local functions) ---
            else if (item.help || item.tooltip) {
                var helpDiv = document.createElement("div");
                helpDiv.className = "cm-funcdoc-detail-help";
                helpDiv.innerHTML = item.help || item.tooltip;
                detailPane.appendChild(helpDiv);
            }

            // --- Insert template ---
            var template = item.snippet || item.template;
            if (template) {
                var templateDiv = document.createElement("div");
                templateDiv.className = "cm-funcdoc-detail-template";
                var templateLabel = document.createElement("span");
                templateLabel.className = "cm-funcdoc-detail-label";
                templateLabel.textContent = "Template:";
                templateDiv.appendChild(templateLabel);
                var templateCode = document.createElement("code");
                templateCode.textContent = template
                    .replace(/\$\{(\d+):([^}]*)}/g, "$2")
                    .replace(/\$\{(\d+)}/g, "")
                    .replace(/\$(\d+)/g, "");
                templateDiv.appendChild(templateCode);

                var insertBtn = document.createElement("button");
                insertBtn.className = "cm-funcdoc-insert-btn";
                insertBtn.textContent = "Insert";
                insertBtn.addEventListener("click", function () {
                    if (onSelect) onSelect(item);
                    dismiss(view);
                });
                templateDiv.appendChild(insertBtn);
                detailPane.appendChild(templateDiv);
            }

            // Source path (for imported module functions)
            if (item.path || item.source) {
                var srcDiv = document.createElement("div");
                srcDiv.className = "cm-funcdoc-detail-source";
                srcDiv.textContent = "Source: " + (item.path || item.source);
                detailPane.appendChild(srcDiv);
            }
        }

        // --- Filtering ---
        filterInput.addEventListener("input", function () {
            var term = filterInput.value;
            if (!term) {
                renderList(items);
                return;
            }
            var regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            var filtered = items.filter(function (item) {
                var text = item.text || item.signature || item.name || item.label;
                return regex.test(text);
            });
            renderList(filtered);
        });

        // --- Keyboard handling ---
        container.addEventListener("keydown", function (ev) {
            if (ev.key === "ArrowDown" || ev.key === "Down") {
                ev.preventDefault();
                if (selectedIndex < rows.length - 1) activateRow(selectedIndex + 1);
            } else if (ev.key === "ArrowUp" || ev.key === "Up") {
                ev.preventDefault();
                if (selectedIndex > 0) activateRow(selectedIndex - 1);
            } else if (ev.key === "Enter") {
                ev.preventDefault();
                if (onSelect && rows[selectedIndex]) {
                    onSelect(rows[selectedIndex].item);
                }
                dismiss(view);
            } else if (ev.key === "Escape") {
                ev.preventDefault();
                dismiss(view);
            }
        });

        // Initial render
        renderList(items);

        // Focus the filter input after a tick (tooltip needs to be in DOM first)
        setTimeout(function () {
            filterInput.focus();
        }, 0);

        return container;
    }

    function dismiss(view) {
        view.dispatch({ effects: clearFuncDoc.of(null) });
        view.focus();
    }

    // --- Public API ---

    function show(view, items, onSelect) {
        var pos = view.state.selection.main.head;
        view.dispatch({
            effects: setFuncDocItems.of({
                pos: pos,
                items: items,
                onSelect: onSelect || null
            })
        });
    }

    function extension() {
        return funcDocField;
    }

    return {
        show: show,
        dismiss: dismiss,
        extension: extension
    };
}());
