eXide.namespace("eXide.find.IncrementalSearch");

eXide.find.IncrementalSearch = (function () {

    var searchOptions = {
        backwards: false,
        wrap: true,
        caseSensitive: false,
        wholeWord: false,
        regExp: false
    };

    function setSearch(view, needle, options) {
        if (!needle) return;
        var query = new CM6.SearchQuery({
            search: needle,
            caseSensitive: options && options.caseSensitive,
            regexp: options && options.regExp,
            wholeWord: options && options.wholeWord
        });
        view.dispatch({ effects: CM6.setSearchQuery.of(query) });
        CM6.findNext(view);
    }

    Constr = function (input, editor) {
        var $this = this;
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
        var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
        this.currentLine = lead.row;
        this.inputEl.value = "";
        this.inputEl.style.display = "";
        this.inputEl.focus();
    };

    Constr.prototype.onChange = function () {
        editorUtils.gotoLine(this.editor, this.currentLine + 1);
        var search = this.inputEl.value;
        setSearch(this.editor, search, searchOptions);
        this.inputEl.focus();
    };

    return Constr;
}());

eXide.namespace("eXide.find.SearchReplace");

eXide.find.SearchReplace = (function () {

    function setSearch(view, needle, options, replaceStr) {
        if (!needle) return;
        var query = new CM6.SearchQuery({
            search: needle,
            replace: replaceStr || "",
            caseSensitive: options && options.caseSensitive,
            regexp: options && options.regExp,
            wholeWord: options && options.wholeWord
        });
        view.dispatch({ effects: CM6.setSearchQuery.of(query) });
        CM6.findNext(view);
    }

    Constr = function (editor) {
        var self = this;
        self.editor = editor;
        self.needleSet = false;
        self.lastSearch = null;
        self.containerEl = document.getElementById("find-replace-dialog");
        self.dlg = eXide.util.DialogManager.create(self.containerEl, {
            modal: false,
            title: "Find / Replace",
            height: 300,
            width: 600,
            buttons: {
                "Find Previous": function() { self.find(-1); },
                "Find Next": function() { self.find(1); },
                "Replace": function() { self.replace(false); },
                "Replace All": function() { self.replace(true); },
                "Close": function() { this.close(); self.editor.focus(); }
            }
        });
    };

    Constr.prototype.open = function() {
        this.dlg.open();
        this.containerEl.querySelector("input[name='search']").focus();
    };

    Constr.prototype.find = function(direction) {
        var search = this.containerEl.querySelector("input[name='search']").value;
        console.log("Searching for %s", search);
        if (search && search.length > 0) {
            if (this.lastSearch != null && this.lastSearch == search) {
                if (direction == -1)
                    CM6.findPrevious(this.editor);
                else
                    CM6.findNext(this.editor);
            } else {
                setSearch(this.editor, search, this.getOptions());
                this.needleSet = true;
            }
            this.editor.focus();
        }
    };

    Constr.prototype.replace = function(all) {
        var search = this.containerEl.querySelector("input[name='search']").value;
        if (search && search.length > 0) {
            var replace = this.containerEl.querySelector("input[name='replace']").value || "";
            setSearch(this.editor, search, this.getOptions(), replace);
            this.needleSet = true;
            if (replace.length > 0) {
                if (all) {
                    CM6.replaceAll(this.editor);
                } else {
                    CM6.replaceNext(this.editor);
                    CM6.findNext(this.editor);
                }
            }
        }
    };

    Constr.prototype.getOptions = function() {
        var caseSensitive = this.containerEl.querySelector("input[name='case']").checked;
        var regex = this.containerEl.querySelector("input[name='regex']").checked;
        return {
            wrap: true,
            caseSensitive: caseSensitive,
            regExp: regex
        };
    };

    return Constr;
}());

eXide.namespace("eXide.find.Files");

eXide.find.Files = (function() {
    var dlg = null;
    var dialogEl = null;

    function ensureDialog() {
        if (dlg) return;
        dialogEl = document.getElementById("find-dialog");
        dlg = eXide.util.DialogManager.create(dialogEl, {
            title: "Search Binary Files",
            modal: false,
            height: 400,
            width: 600
        });
    }

    return {
        open: function(doc, project, callback) {
            ensureDialog();
            var projectInput = dialogEl.querySelector("input.project");
            if (project) {
                projectInput.disabled = false;
                projectInput.value = project.root;
                dialogEl.querySelector(".project-path").textContent = project.abbrev;
            } else {
                projectInput.disabled = true;
            }
            dialogEl.querySelector("input[name='collection']").value = doc.getBasePath();
            dlg.setButtons({
                "Search": function() {
                    var form = dialogEl.querySelector("form");
                    var params = new URLSearchParams(new FormData(form)).toString();
                    callback(params);
                    dlg.close();
                },
                "Close": function() { dlg.close(); }
            });
            dlg.open();
        }
    };
}());
