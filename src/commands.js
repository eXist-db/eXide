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

import { eXide, namespace } from "./namespace.js";

/**
 * Register editor commands via CM6 keymap.
 */
export const commands = (function () {

    const isMac = /Mac/.test(navigator.platform);
    const bindings = {};
    const commandList = [];

    /**
     * Convert CM6 key string to platform-native display string for menus.
     */
    function displayKey(cm6Key) {
        if (!cm6Key) return "";
        const str = cm6Key
            .replace(/ArrowLeft/g, "←")
            .replace(/ArrowRight/g, "→")
            .replace(/ArrowUp/g, "↑")
            .replace(/ArrowDown/g, "↓")
            .replace(/Backspace/g, "⌫")
            .replace(/Enter/g, "↩")
            .replace(/Escape/g, "⎋")
            .replace(/PageUp/g, "⇞")
            .replace(/PageDown/g, "⇟")
            .replace(/Space/g, "␣");
        if (isMac) {
            return str
                .replace(/Mod-/g, "⌘")
                .replace(/Alt-/g, "⌥")
                .replace(/Shift-/g, "⇧")
                .replace(/Ctrl-/g, "⌃")
                .replace(/-/g, "")
                .toUpperCase();
        }
        return str
            .replace(/Mod-/g, "Ctrl+")
            .replace(/Alt-/g, "Alt+")
            .replace(/Shift-/g, "Shift+")
            .toUpperCase();
    }

    function getKeyBinding(bindingsObj, name) {
        if (!bindingsObj || !bindingsObj[name]) return null;
        const entry = bindingsObj[name];
        if (isMac) {
            return entry.mac || entry.key;
        }
        return entry.key;
    }

    const nameLabels = {
        undo: "Undo", redo: "Redo", gotoLine: "Go to Line",
        historyBack: "Go to Last Edit", fold: "Fold", unfold: "Unfold",
        saveDocument: "Save", runQuery: "Eval", runQueryOrApp: "Run",
        openDocument: "Open", newDocumentFromTemplate: "New from Template",
        closeDocument: "Close", closeAll: "Close All",
        autocomplete: "Autocomplete", nextTab: "Next Tab", previousTab: "Previous Tab",
        functionDoc: "Function Documentation", gotoDefinition: "Go to Definition",
        gotoSymbol: "Go to Symbol", searchReplace: "Find/Replace",
        escape: "Cancel/Escape", dbManager: "DB Manager",
        toggleComment: "Toggle Comment", synchronize: "Synchronize",
        preferences: "Preferences", openApp: "Open Application",
        "xquery-format": "Format Code", quickfix: "Quick Fix",
        expandSelection: "Expand Selection", renameSymbol: "Rename Symbol",
        removeTags: "Remove Tags", extractFunction: "Extract Function",
        extractVariable: "Extract Variable", openTab: "Switch Editor",
        toggleQueryResults: "Toggle Results", commandPalette: "Command Palette",
        findFiles: "Find in Files",
        toggleDiagnostics: "Toggle Diagnostics Panel",
        findReferences: "Find All References"
    };

    function humanName(id) {
        if (nameLabels[id]) return nameLabels[id];
        // gotoTab1 → "Go to Tab 1"
        const tabMatch = id.match(/^gotoTab(\d)$/);
        if (tabMatch) return `Go to Tab ${tabMatch[1]}`;
        // fallback: camelCase → "Camel Case"
        return id.replace(/([a-z])([A-Z])/g, "$1 $2")
                  .replace(/^./, (c) => { return c.toUpperCase(); });
    }

    function addCommand(name, key, exec) {
        const cmd = { name, key, exec };
        commandList.push(cmd);
        if (key) {
            bindings[name] = key;
        }
    }

    return {

        init (parent) {
            // Synchronous load — keybindings must be configured before editor is interactive
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "keybindings.js", false);
            xhr.send();
            if (xhr.status === 200) {
                const kb = JSON.parse(xhr.responseText);
                (function() {
                    // Display-only entries for built-in CM6 commands (no exec — handled by CM6)
                    addCommand("undo", getKeyBinding(kb, "undo"), null);
                    addCommand("redo", getKeyBinding(kb, "redo"), null);

                    addCommand("gotoLine", getKeyBinding(kb, "gotoLine"), () => {
                        parent.gotoLine();
                        return true;
                    });
                    addCommand("historyBack", getKeyBinding(kb, "historyBack"), () => {
                        parent.historyBack();
                        return true;
                    });
                    addCommand("toggleDiagnostics", getKeyBinding(kb, "toggleDiagnostics"), () => {
                        parent.toggleDiagnostics();
                        return true;
                    });
                    addCommand("fold", getKeyBinding(kb, "fold"), (view) => {
                        // CM6 fold is handled by foldKeymap
                        return false;
                    });
                    addCommand("saveDocument", getKeyBinding(kb, "saveDocument"), () => {
                        eXide.app.saveDocument();
                        return true;
                    });
                    addCommand("runQuery", getKeyBinding(kb, "runQuery"), () => {
                        eXide.app.runQuery();
                        return true;
                    });
                    addCommand("runQueryOrApp", getKeyBinding(kb, "runQueryOrApp"), () => {
                        eXide.app.runAppOrQuery();
                        return true;
                    });
                    addCommand("openDocument", getKeyBinding(kb, "openDocument"), () => {
                        eXide.app.openDocument();
                        return true;
                    });
                    addCommand("newDocumentFromTemplate", getKeyBinding(kb, "newDocumentFromTemplate"), () => {
                        eXide.app.newDocumentFromTemplate();
                        return true;
                    });
                    addCommand("closeDocument", getKeyBinding(kb, "closeDocument"), () => {
                        eXide.app.closeDocument();
                        return true;
                    });
                    addCommand("closeAll", getKeyBinding(kb, "closeAll"), () => {
                        eXide.app.closeAll();
                        return true;
                    });
                    addCommand("autocomplete", getKeyBinding(kb, "autocomplete"), (view) => {
                        CM6.startCompletion(view);
                        return true;
                    });
                    addCommand("nextTab", getKeyBinding(kb, "nextTab"), () => {
                        parent.nextTab();
                        return true;
                    });
                    addCommand("previousTab", getKeyBinding(kb, "previousTab"), () => {
                        parent.previousTab();
                        return true;
                    });
                    addCommand("xquery-format", getKeyBinding(kb, "xqueryFormat"), () => {
                        parent.exec("format");
                        return true;
                    });
                    addCommand("functionDoc", getKeyBinding(kb, "functionDoc"), () => {
                        parent.exec("showFunctionDoc");
                        return true;
                    });
                    addCommand("gotoDefinition", getKeyBinding(kb, "gotoDefinition"), () => {
                        parent.exec("gotoDefinition");
                        return true;
                    });
                    addCommand("findReferences", getKeyBinding(kb, "findReferences"), () => {
                        parent.exec("findReferences");
                        return true;
                    });
                    addCommand("gotoSymbol", getKeyBinding(kb, "gotoSymbol"), () => {
                        parent.exec("gotoSymbol");
                        return true;
                    });
                    addCommand("searchReplace", getKeyBinding(kb, "searchReplace"), () => {
                        parent.search.open();
                        return true;
                    });
                    addCommand("escape", getKeyBinding(kb, "escape"), () => {
                        const doc = parent.getActiveDocument();
                        doc.template = null;
                        const head = parent.editor.state.selection.main.head;
                        parent.editor.dispatch({ selection: { anchor: head } });
                        return true;
                    });
                    addCommand("dbManager", getKeyBinding(kb, "dbManager"), () => {
                        eXide.app.manage();
                        return true;
                    });
                    addCommand("toggleComment", getKeyBinding(kb, "toggleComment"), (view) => {
                        CM6.toggleComment(view);
                        return true;
                    });
                    addCommand("synchronize", getKeyBinding(kb, "synchronize"), () => {
                        eXide.app.synchronize();
                        return true;
                    });
                    addCommand("preferences", getKeyBinding(kb, "preferences"), () => {
                        eXide.app.showPreferences();
                        return true;
                    });
                    addCommand("openApp", getKeyBinding(kb, "openApp"), () => {
                        eXide.app.openApp();
                        return true;
                    });
                    addCommand("quickfix", getKeyBinding(kb, "quickfix"), () => {
                        parent.exec("quickFix");
                        return true;
                    });
                    addCommand("expandSelection", getKeyBinding(kb, "expandSelection"), () => {
                        parent.exec("expandSelection");
                        return true;
                    });
                    addCommand("renameSymbol", getKeyBinding(kb, "renameSymbol"), () => {
                        parent.exec("rename");
                        return true;
                    });
                    addCommand("removeTags", getKeyBinding(kb, "removeTags"), () => {
                        parent.exec("removeTags");
                        return true;
                    });
                    addCommand("extractFunction", getKeyBinding(kb, "extractFunction"), () => {
                        parent.exec("extractFunction");
                        return true;
                    });
                    addCommand("extractVariable", getKeyBinding(kb, "extractVariable"), () => {
                        parent.exec("extractVariable");
                        return true;
                    });
                    addCommand("openTab", getKeyBinding(kb, "openTab"), () => {
                        parent.selectTab();
                        return true;
                    });
                    addCommand("toggleQueryResults", getKeyBinding(kb, "toggleQueryResults"), () => {
                        eXide.app.toggleResultsPanel();
                        return true;
                    });
                    addCommand("commandPalette", getKeyBinding(kb, "commandPalette"), () => {
                        eXide.app.getMenu().commandPalette();
                        return true;
                    });
                    addCommand("findFiles", getKeyBinding(kb, "findFiles"), () => {
                        eXide.app.findFiles();
                        return true;
                    });

                    function createExec(tab) {
                        return function() {
                            parent.selectTab(tab - 1);
                            return true;
                        };
                    }

                    for (let i = 1; i < 10; i++) {
                        const tab = i;
                        addCommand(`gotoTab${tab}`, getKeyBinding(kb, `gotoTab${tab}`), createExec(tab));
                    }

                    // Build CM6 keymap from collected commands
                    const keymapEntries = [];
                    for (let j = 0; j < commandList.length; j++) {
                        const cmd = commandList[j];
                        if (cmd.key && cmd.exec) {
                            keymapEntries.push({
                                key: cmd.key,
                                run: cmd.exec,
                                preventDefault: true
                            });
                        }
                    }

                    // Add the keymap to the editor view
                    parent.editor.dispatch({
                        effects: CM6.StateEffect.appendConfig.of(
                            CM6.Prec.highest(CM6.keymap.of(keymapEntries))
                        )
                    });
                })();
            }
        },

        help (container, editor) {
            const el = typeof container === "string" ? document.querySelector(container) : container;
            const tbody = el.querySelector("#keybindings tbody");
            if (!tbody) return;
            tbody.innerHTML = "";
            for (let i = 0; i < commandList.length; i++) {
                const cmd = commandList[i];
                const tr = document.createElement("tr");
                let td = document.createElement("td");
                td.textContent = humanName(cmd.name);
                tr.appendChild(td);
                td = document.createElement("td");
                if (cmd.key) {
                    const span = document.createElement("span");
                    span.className = "shortcut";
                    span.textContent = displayKey(cmd.key);
                    td.appendChild(span);
                }
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
            // Wire filter input
            const filterInput = el.querySelector("#keybindings-filter");
            if (filterInput) {
                const newInput = filterInput.cloneNode(true);
                filterInput.parentNode.replaceChild(newInput, filterInput);
                newInput.value = "";
                newInput.addEventListener("input", function() {
                    const q = this.value.trim().toLowerCase();
                    const trs = tbody.querySelectorAll("tr");
                    trs.forEach((tr) => {
                        const text = tr.textContent.toLowerCase();
                        tr.style.display = (!q || text.indexOf(q) >= 0) ? "" : "none";
                    });
                });
            }
        },

        getShortcut(key) {
            return displayKey(bindings[key]);
        }

    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").commands = commands;
