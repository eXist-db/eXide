/**
 * Local Files pane for eXide Desktop.
 * Injected via Tauri window.eval(). All filesystem I/O is done Rust-side;
 * this script only handles the UI. Data is passed in via function calls.
 */
(function () {
    "use strict";
    if (window.__exideLocalFiles) return;

    var currentFolder = null;

    // ── Add LOCAL tab to the outline tab bar ──
    var tabBar = document.getElementById("tabs-outline");
    if (!tabBar) return;

    var localTab = document.createElement("li");
    var localTabLink = document.createElement("a");
    localTabLink.className = "tab";
    localTabLink.href = "#";
    localTabLink.textContent = "local";
    localTab.appendChild(localTabLink);
    tabBar.appendChild(localTab);

    // ── Create the LOCAL pane body (same structure as directory-body) ──
    var westPanel = document.getElementById("outline-container");
    if (!westPanel) westPanel = document.querySelector(".panel-west");
    if (!westPanel) return;

    var localBody = document.createElement("div");
    localBody.id = "local-files-body";
    // Match #directory-body / #outline-body styling
    localBody.style.cssText = "position:absolute; visibility:hidden; flex:1; min-height:0; width:100%; display:flex; flex-direction:column; overflow:hidden;";

    // Toolbar (matches #dir-toolbar)
    var toolbar = document.createElement("div");
    toolbar.id = "local-toolbar";
    toolbar.style.cssText = "display:flex; gap:4px; padding:3px 6px; border-bottom:1px solid #e2e8f0; flex-shrink:0; align-items:center;";

    var openBtn = document.createElement("button");
    openBtn.title = "Open Folder (use File menu)";
    openBtn.style.cssText = "background:none; border:1px solid transparent; border-radius:3px; padding:1px 4px; cursor:default; color:#64748b; font-size:13px; line-height:1;";
    openBtn.innerHTML = '<i class="fa fa-folder-open-o"></i>';
    toolbar.appendChild(openBtn);

    var pathLabel = document.createElement("span");
    pathLabel.style.cssText = "font-size:10px; color:#718096; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;";
    pathLabel.textContent = "File \u203a Open Local Folder\u2026";
    toolbar.appendChild(pathLabel);

    localBody.appendChild(toolbar);

    // Tree view (matches #dir-tree-view > .panel-scroller > .tree > ul)
    var treeViewWrap = document.createElement("div");
    treeViewWrap.style.cssText = "flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; min-width:0;";

    var scroller = document.createElement("div");
    scroller.className = "panel-scroller";

    var tree = document.createElement("div");
    tree.className = "tree";

    var treeUl = document.createElement("ul");
    treeUl.id = "local-directory";
    tree.appendChild(treeUl);
    scroller.appendChild(tree);
    treeViewWrap.appendChild(scroller);
    localBody.appendChild(treeViewWrap);

    // Filter input (matches .panel-filter)
    var filterWrap = document.createElement("div");
    filterWrap.className = "panel-filter";
    var filterInput = document.createElement("input");
    filterInput.type = "search";
    filterInput.id = "local-filter";
    filterInput.placeholder = "Filter local files...";
    filterWrap.appendChild(filterInput);
    localBody.appendChild(filterWrap);

    // Insert after outline-body and directory-body
    var dirBody = document.getElementById("directory-body");
    if (dirBody && dirBody.parentNode) {
        dirBody.parentNode.insertBefore(localBody, dirBody.nextSibling);
    } else {
        westPanel.appendChild(localBody);
    }

    // ── Filter logic ──
    filterInput.addEventListener("keyup", function () {
        var regex = new RegExp(this.value, "i");
        var items = treeUl.querySelectorAll("li");
        items.forEach(function (li) {
            var span = li.querySelector("span:last-child");
            if (span) {
                li.style.display = regex.test(span.textContent) ? "" : "none";
            }
        });
    });

    // ── Tab switching ──
    // eXide's original handler (editor.js line 570) uses querySelectorAll("a.tab")
    // and toggles active by index (0=collections, 1=outline). It doesn't know about
    // LOCAL (index 2). We need to completely replace the tab click behavior.

    // Gather all tabs. Clone existing ones to remove eXide's old click handlers
    // (eXide's handler toggles active by index, not aware of LOCAL).
    var allTabs = tabBar.querySelectorAll("a.tab");
    var tabData = [];
    var editor = typeof eXide !== "undefined" && eXide.app ? eXide.app.getEditor() : null;

    allTabs.forEach(function (a, i) {
        // Only clone if eXide's handlers are attached (i.e., editor is initialized)
        var link = a;
        if (editor && i < 2) {
            var clone = a.cloneNode(true);
            a.parentNode.replaceChild(clone, a);
            link = clone;
        }
        if (i === 0) tabData.push({ link: link, name: "collections" });
        else if (i === 1) tabData.push({ link: link, name: "outline" });
    });
    tabData.push({ link: localTabLink, name: "local" });

    tabData.forEach(function (tab) {
        tab.link.addEventListener("click", function (e) {
            e.preventDefault();

            // Set active on clicked tab, remove from others
            tabData.forEach(function (t) { t.link.classList.remove("active"); });
            tab.link.classList.add("active");

            // Show/hide panes
            if (tab.name === "collections") {
                if (editor && editor.directory) editor.directory.toggle(true);
                if (editor && editor.outline) editor.outline.toggle(false);
                hideLocalPane();
                clearLocalActive();
            } else if (tab.name === "outline") {
                if (editor && editor.directory) editor.directory.toggle(false);
                if (editor && editor.outline) editor.outline.toggle(true);
                hideLocalPane();
                clearLocalActive();
            } else if (tab.name === "local") {
                if (editor && editor.directory) editor.directory.toggle(false);
                if (editor && editor.outline) editor.outline.toggle(false);
                localBody.style.position = "relative";
                localBody.style.visibility = "visible";
                // Force active style inline
                localTabLink.style.color = "#2b6cb0";
                localTabLink.style.borderBottomColor = "#2b6cb0";
            }
        });
    });

    function showLocalPane() {
        if (editor && editor.directory) editor.directory.toggle(false);
        if (editor && editor.outline) editor.outline.toggle(false);
        localBody.style.position = "relative";
        localBody.style.visibility = "visible";
        tabData.forEach(function (t) { t.link.classList.remove("active"); });
        localTabLink.classList.add("active");
        // Force the active style directly in case CSS class doesn't take effect
        localTabLink.style.color = "#2b6cb0";
        localTabLink.style.borderBottomColor = "#2b6cb0";
    }

    function clearLocalActive() {
        localTabLink.style.color = "";
        localTabLink.style.borderBottomColor = "";
    }

    function hideLocalPane() {
        localBody.style.position = "absolute";
        localBody.style.visibility = "hidden";
        clearLocalActive();
    }

    // ── Open folder with pre-loaded data (called from Rust) ──
    function openFolderWithData(path, entries) {
        currentFolder = path;
        pathLabel.textContent = path.replace(/^.*[\/\\]/, "");
        pathLabel.title = path;
        showLocalPane();
        renderEntries(entries, treeUl, 0);
    }

    // ── Render entries using the same .tree markup as Collections ──
    function renderEntries(entries, parentUl, depth) {
        parentUl.innerHTML = "";
        entries.forEach(function (entry) {
            var li = document.createElement("li");
            li.className = entry.is_dir ? "collection" : "resource";

            var icon = document.createElement("i");
            icon.className = entry.is_dir ? "fa fa-folder" : "fa fa-file-o";

            var label = document.createElement("span");
            label.textContent = entry.name;

            li.appendChild(icon);
            li.appendChild(label);

            if (entry.is_dir) {
                var childUl = document.createElement("ul");
                li.appendChild(childUl);

                if (entry.children && entry.children.length > 0) {
                    renderEntries(entry.children, childUl, depth + 1);
                }

                var expanded = false;
                li.addEventListener("click", function (e) {
                    e.stopPropagation();
                    if (!expanded) {
                        childUl.style.display = "";
                        icon.className = "fa fa-folder-open";
                        expanded = true;
                    } else {
                        childUl.style.display = "none";
                        icon.className = "fa fa-folder";
                        expanded = false;
                    }
                });

                // Start collapsed
                childUl.style.display = "none";
            } else {
                li.addEventListener("click", function (e) {
                    e.stopPropagation();
                    openLocalFile(entry.path, entry.name);
                });
            }

            parentUl.appendChild(li);
        });
    }

    // ── Open a local file via the localfs:// custom protocol ──
    function openLocalFile(path, name) {
        var url = "localfs://read" + encodeURI(path);
        fetch(url)
            .then(function (resp) {
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                return resp.text();
            })
            .then(function (content) {
                var editor = eXide.app.getEditor();
                editor.newDocument(null, guessMode(name));
                var view = editor.editor;
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: content }
                });
                var doc = editor.getActiveDocument();
                var oldPath = doc.path;
                doc.name = name;
                doc.path = path;
                doc.saved = true;
                doc._localFile = true;
                var tabLink = document.querySelector('#tabs a[title="' + oldPath + '"]');
                if (tabLink) {
                    tabLink.textContent = name;
                    tabLink.title = path;
                }
            })
            .catch(function (err) {
                try { eXide.util.error("Could not open file: " + err.message); } catch(ex) {}
            });
    }

    function guessMode(filename) {
        var ext = filename.split(".").pop().toLowerCase();
        var modes = {
            xq: "xquery", xql: "xquery", xqm: "xquery", xquery: "xquery",
            xml: "xml", xsl: "xml", xslt: "xml", xsd: "xml", xconf: "xml",
            html: "html", htm: "html", xhtml: "html",
            css: "css", less: "less",
            js: "javascript", json: "json",
            md: "markdown", markdown: "markdown"
        };
        return modes[ext] || "xml";
    }

    window.__exideLocalFiles = {
        openFolderWithData: openFolderWithData,
        showPane: showLocalPane
    };
})();
