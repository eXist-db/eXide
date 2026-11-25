import { namespace } from "./namespace.js";
import { DialogManager } from "./dialog-utils.js";
import { editorUtils } from "./editor-utils.js";

export const IncrementalSearch = (function () {

    const searchOptions = {
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false
    };

    function setSearch(view, needle, options) {
        if (!needle) return;
        const query = new CM6.SearchQuery({
            search: needle,
            caseSensitive: options && options.caseSensitive,
            regexp: options && options.regExp,
            wholeWord: options && options.wholeWord
        });
        view.dispatch({ effects: CM6.setSearchQuery.of(query) });
        CM6.findNext(view);
    }

    const Constr = function (input, editor) {
        const $this = this;
        $this.inputEl = typeof input === "string" ? document.querySelector(input) : input;
        $this.inputEl.style.display = "none";
        $this.inputEl.addEventListener("keyup", function (ev) {
            switch (ev.which) {
                case 27:
                case 13:
                    ev.preventDefault();
                    $this.inputEl.style.display = "none";
                    $this.editor.focus();
                    break;
                case 40:
                    ev.preventDefault();
                    CM6.findNext($this.editor);
                    break;
                case 38:
                    ev.preventDefault();
                    CM6.findPrevious($this.editor);
                    break;
                case 71:
                    if (ev.metaKey || ev.ctrlKey) {
                        ev.preventDefault();
                        CM6.findNext($this.editor);
                        break;
                    }
                default:
                    $this.onChange();
                    break;
            }
        });
        $this.editor = editor;
    };

    Constr.prototype.start = function () {
        const lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        this.currentLine = lead.row;
        this.inputEl.value = "";
        this.inputEl.style.display = "";
        this.inputEl.focus();
    };

    Constr.prototype.onChange = function () {
        editorUtils.gotoLine(this.editor, this.currentLine + 1);
        const search = this.inputEl.value;
        setSearch(this.editor, search, searchOptions);
        this.inputEl.focus();
    };

    return Constr;
}());

export const Files = (function() {
    let dlg = null;
    let dialogEl = null;

    function ensureDialog() {
        if (dlg) return;
        dialogEl = document.getElementById("find-dialog");
        dlg = DialogManager.create(dialogEl, {
            title: "Find in Files",
            modal: false,
            height: 400,
            width: 600
        });
    }

    return {
        open: function(doc, project, callback) {
            ensureDialog();
            const projectInput = dialogEl.querySelector("input.project");
            if (project) {
                projectInput.disabled = false;
                projectInput.value = project.root;
                dialogEl.querySelector(".project-path").textContent = project.abbrev;
            } else {
                projectInput.disabled = true;
            }
            dialogEl.querySelector("input[name='collection']").value = doc.getBasePath();
            dlg.setButtons({
                "Close": function() { dlg.close(); },
                "Search": function() {
                    const form = dialogEl.querySelector("form");
                    const params = new URLSearchParams(new FormData(form)).toString();
                    callback(params);
                    dlg.close();
                }
            });
            dlg.open();
        }
    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.find").IncrementalSearch = IncrementalSearch;
namespace("eXide.find").Files = Files;
