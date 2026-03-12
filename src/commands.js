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
eXide.namespace("eXide.edit.commands");

/**
 * Register editor commands via CM6 keymap.
 */
eXide.edit.commands = (function () {

    var isMac = /Mac/.test(navigator.platform);
    var bindings = {};
    var commandList = [];

    /**
     * Convert CM6 key string to platform-native display string for menus.
     */
    function displayKey(cm6Key) {
        if (!cm6Key) return "";
        var str = cm6Key
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
        var entry = bindingsObj[name];
        if (isMac) {
            return entry.mac || entry.key;
        }
        return entry.key;
    }

    var nameLabels = {
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
        findFiles: "Find in Files"
    };

    function humanName(id) {
        if (nameLabels[id]) return nameLabels[id];
        // gotoTab1 → "Go to Tab 1"
        var tabMatch = id.match(/^gotoTab(\d)$/);
        if (tabMatch) return "Go to Tab " + tabMatch[1];
        // fallback: camelCase → "Camel Case"
        return id.replace(/([a-z])([A-Z])/g, "$1 $2")
                  .replace(/^./, function(c) { return c.toUpperCase(); });
    }

    function addCommand(name, key, exec) {
        var cmd = { name: name, key: key, exec: exec };
        commandList.push(cmd);
        if (key) {
            bindings[name] = key;
        }
    }

    return {

        init: function (parent) {
            // Synchronous load — keybindings must be configured before editor is interactive
            var xhr = new XMLHttpRequest();
            xhr.open("GET", "keybindings.js", false);
            xhr.send();
            if (xhr.status === 200) {
                var kb = JSON.parse(xhr.responseText);
                (function() {
                    // Display-only entries for built-in CM6 commands (no exec — handled by CM6)
                    addCommand("undo", getKeyBinding(kb, "undo"), null);
                    addCommand("redo", getKeyBinding(kb, "redo"), null);

                    addCommand("gotoLine", getKeyBinding(kb, "gotoLine"), function() {
                        parent.gotoLine();
                        return true;
                    });
                    addCommand("historyBack", getKeyBinding(kb, "historyBack"), function() {
                        parent.historyBack();
                        return true;
                    });
                    addCommand("fold", getKeyBinding(kb, "fold"), function(view) {
                        // CM6 fold is handled by foldKeymap
                        return false;
                    });
                    addCommand("saveDocument", getKeyBinding(kb, "saveDocument"), function() {
                        eXide.app.saveDocument();
                        return true;
                    });
                    addCommand("runQuery", getKeyBinding(kb, "runQuery"), function() {
                        eXide.app.runQuery();
                        return true;
                    });
                    addCommand("runQueryOrApp", getKeyBinding(kb, "runQueryOrApp"), function() {
                        eXide.app.runAppOrQuery();
                        return true;
                    });
                    addCommand("openDocument", getKeyBinding(kb, "openDocument"), function() {
                        eXide.app.openDocument();
                        return true;
                    });
                    addCommand("newDocumentFromTemplate", getKeyBinding(kb, "newDocumentFromTemplate"), function() {
                        eXide.app.newDocumentFromTemplate();
                        return true;
                    });
                    addCommand("closeDocument", getKeyBinding(kb, "closeDocument"), function() {
                        eXide.app.closeDocument();
                        return true;
                    });
                    addCommand("closeAll", getKeyBinding(kb, "closeAll"), function() {
                        eXide.app.closeAll();
                        return true;
                    });
                    addCommand("autocomplete", getKeyBinding(kb, "autocomplete"), function(view) {
                        CM6.startCompletion(view);
                        return true;
                    });
                    addCommand("nextTab", getKeyBinding(kb, "nextTab"), function() {
                        parent.nextTab();
                        return true;
                    });
                    addCommand("previousTab", getKeyBinding(kb, "previousTab"), function() {
                        parent.previousTab();
                        return true;
                    });
                    addCommand("xquery-format", getKeyBinding(kb, "xqueryFormat"), function() {
                        parent.exec("format");
                        return true;
                    });
                    addCommand("functionDoc", getKeyBinding(kb, "functionDoc"), function() {
                        parent.exec("showFunctionDoc");
                        return true;
                    });
                    addCommand("gotoDefinition", getKeyBinding(kb, "gotoDefinition"), function() {
                        parent.exec("gotoDefinition");
                        return true;
                    });
                    addCommand("gotoSymbol", getKeyBinding(kb, "gotoSymbol"), function() {
                        parent.exec("gotoSymbol");
                        return true;
                    });
                    addCommand("searchReplace", getKeyBinding(kb, "searchReplace"), function() {
                        parent.search.open();
                        return true;
                    });
                    addCommand("escape", getKeyBinding(kb, "escape"), function() {
                        var doc = parent.getActiveDocument();
                        doc.template = null;
                        var head = parent.editor.state.selection.main.head;
                        parent.editor.dispatch({ selection: { anchor: head } });
                        return true;
                    });
                    addCommand("dbManager", getKeyBinding(kb, "dbManager"), function() {
                        eXide.app.manage();
                        return true;
                    });
                    addCommand("toggleComment", getKeyBinding(kb, "toggleComment"), function(view) {
                        CM6.toggleComment(view);
                        return true;
                    });
                    addCommand("synchronize", getKeyBinding(kb, "synchronize"), function() {
                        eXide.app.synchronize();
                        return true;
                    });
                    addCommand("preferences", getKeyBinding(kb, "preferences"), function() {
                        eXide.app.showPreferences();
                        return true;
                    });
                    addCommand("openApp", getKeyBinding(kb, "openApp"), function() {
                        eXide.app.openApp();
                        return true;
                    });
                    addCommand("quickfix", getKeyBinding(kb, "quickfix"), function() {
                        parent.exec("quickFix");
                        return true;
                    });
                    addCommand("expandSelection", getKeyBinding(kb, "expandSelection"), function() {
                        parent.exec("expandSelection");
                        return true;
                    });
                    addCommand("renameSymbol", getKeyBinding(kb, "renameSymbol"), function() {
                        parent.exec("rename");
                        return true;
                    });
                    addCommand("removeTags", getKeyBinding(kb, "removeTags"), function() {
                        parent.exec("removeTags");
                        return true;
                    });
                    addCommand("extractFunction", getKeyBinding(kb, "extractFunction"), function() {
                        parent.exec("extractFunction");
                        return true;
                    });
                    addCommand("extractVariable", getKeyBinding(kb, "extractVariable"), function() {
                        parent.exec("extractVariable");
                        return true;
                    });
                    addCommand("openTab", getKeyBinding(kb, "openTab"), function() {
                        parent.selectTab();
                        return true;
                    });
                    addCommand("toggleQueryResults", getKeyBinding(kb, "toggleQueryResults"), function() {
                        eXide.app.toggleResultsPanel();
                        return true;
                    });
                    addCommand("commandPalette", getKeyBinding(kb, "commandPalette"), function() {
                        eXide.app.getMenu().commandPalette();
                        return true;
                    });
                    addCommand("findFiles", getKeyBinding(kb, "findFiles"), function() {
                        eXide.app.findFiles();
                        return true;
                    });

                    function createExec(tab) {
                        return function() {
                            parent.selectTab(tab - 1);
                            return true;
                        };
                    }

                    for (var i = 1; i < 10; i++) {
                        var tab = i;
                        addCommand("gotoTab" + tab, getKeyBinding(kb, "gotoTab" + tab), createExec(tab));
                    }

                    // Build CM6 keymap from collected commands
                    var keymapEntries = [];
                    for (var j = 0; j < commandList.length; j++) {
                        var cmd = commandList[j];
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

        help: function (container, editor) {
            var el = typeof container === "string" ? document.querySelector(container) : container;
            var tables = el.querySelectorAll("table");
            for (var t = 0; t < tables.length; t++) {
                var tbl = tables[t];
                tbl.innerHTML = "";
                for (var i = 0; i < commandList.length; i++) {
                    var cmd = commandList[i];
                    var tr = document.createElement("tr");
                    var td = document.createElement("td");
                    td.textContent = humanName(cmd.name);
                    tr.appendChild(td);
                    td = document.createElement("td");
                    if (cmd.key) {
                        var kbd = document.createElement("kbd");
                        kbd.textContent = displayKey(cmd.key);
                        td.appendChild(kbd);
                    }
                    tr.appendChild(td);
                    tbl.appendChild(tr);
                }
            }
        },

        getShortcut: function(key) {
            return displayKey(bindings[key]);
        }

    };
}());
