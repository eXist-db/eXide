/**
 * Local Files pane for eXide Desktop.
 * Injected via Tauri window.eval(). All filesystem I/O is done Rust-side;
 * this script only handles the UI. Data is passed in via function calls
 * from Rust's window.eval().
 */
(function () {
    "use strict";
    if (window.__exideLocalFiles) return;

    var currentFolder = null;

    // ── Create the LOCAL tab ──
    var tabsContainer = document.getElementById("tabs-outline-container");
    if (!tabsContainer) return;
    var tabBar = tabsContainer.querySelector("ul");
    if (!tabBar) return;

    var localTab = document.createElement("li");
    localTab.innerHTML = '<a href="#">local</a>';
    localTab.style.cursor = "pointer";
    tabBar.appendChild(localTab);

    // ── Create the LOCAL pane body ──
    var westPanel = document.querySelector(".panel-west");
    if (!westPanel) return;

    var localBody = document.createElement("div");
    localBody.id = "local-files-body";
    localBody.style.cssText = "display:none; flex:1; flex-direction:column; overflow:hidden; min-height:0;";

    var toolbar = document.createElement("div");
    toolbar.style.cssText = "padding:4px 6px; display:flex; gap:4px; border-bottom:1px solid #e2e8f0; flex-shrink:0;";

    var pathLabel = document.createElement("span");
    pathLabel.style.cssText = "font-size:10px; color:#718096; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:22px; flex:1;";
    pathLabel.textContent = "Use File \u203a Open Local Folder";
    toolbar.appendChild(pathLabel);
    localBody.appendChild(toolbar);

    var scroller = document.createElement("div");
    scroller.style.cssText = "flex:1; overflow-y:auto; overflow-x:auto; min-height:0;";
    var tree = document.createElement("div");
    tree.className = "tree";
    tree.style.cssText = "min-width:min-content; width:max-content; min-width:100%;";
    var treeUl = document.createElement("ul");
    treeUl.style.cssText = "padding:0; margin:0;";
    tree.appendChild(treeUl);
    scroller.appendChild(tree);
    localBody.appendChild(scroller);

    var outlineBody = document.getElementById("outline-body");
    if (outlineBody && outlineBody.parentNode) {
        outlineBody.parentNode.insertBefore(localBody, outlineBody.nextSibling);
    } else {
        westPanel.appendChild(localBody);
    }

    // ── Tab switching ──
    localTab.querySelector("a").addEventListener("click", function (e) {
        e.preventDefault();
        showLocalPane();
    });

    function showLocalPane() {
        var dirBody = document.getElementById("directory-body");
        var outBody = document.getElementById("outline-body");
        if (dirBody) dirBody.style.display = "none";
        if (outBody) { outBody.style.position = "absolute"; outBody.style.visibility = "hidden"; }
        localBody.style.display = "flex";
        tabBar.querySelectorAll("li").forEach(function (li) { li.classList.remove("active"); });
        localTab.classList.add("active");
    }

    // ── Open folder with pre-loaded data (called from Rust) ──
    function openFolderWithData(path, entries) {
        currentFolder = path;
        pathLabel.textContent = path.replace(/^.*[\/\\]/, "");
        pathLabel.title = path;
        showLocalPane();
        renderEntries(entries, treeUl, 0);
    }

    // ── Render entries from data ──
    function renderEntries(entries, parentUl, depth) {
        parentUl.innerHTML = "";
        entries.forEach(function (entry) {
            var li = document.createElement("li");
            li.className = entry.is_dir ? "collection" : "resource";
            li.style.cssText = "list-style:none; display:grid; grid-template-columns:auto 1fr; grid-template-rows:19px; align-items:center; gap:0 4px; cursor:pointer; border-radius:3px; padding:0 3px 0 " + (10 + depth * 12) + "px;";

            var icon = document.createElement("span");
            icon.className = entry.is_dir ? "fa fa-folder" : "fa fa-file-o";
            icon.style.cssText = "font-size:12px; color:" + (entry.is_dir ? "#2b6cb0" : "#718096") + "; width:14px; text-align:center;";

            var label = document.createElement("span");
            label.textContent = entry.name;
            label.style.cssText = "display:block; white-space:nowrap; color:#2d3748;";

            li.appendChild(icon);
            li.appendChild(label);

            if (entry.is_dir) {
                var childUl = document.createElement("ul");
                childUl.style.cssText = "grid-column:1/-1; grid-row:2; display:none; padding:0; margin:0;";
                li.appendChild(childUl);

                // Pre-render children if available
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
            } else {
                li.addEventListener("click", function (e) {
                    e.stopPropagation();
                    openLocalFile(entry.path, entry.name);
                });
            }

            li.addEventListener("mouseenter", function () { li.style.background = "rgba(0,0,0,0.06)"; });
            li.addEventListener("mouseleave", function () { li.style.background = ""; });
            parentUl.appendChild(li);
        });
    }

    // ── Called from Rust when subdirectory data is ready ──
    function renderSubdir(entries) {
        var pending = window.__exideLocalFiles._pendingSubdir;
        if (pending) {
            renderEntries(entries, pending.ul, pending.depth);
            window.__exideLocalFiles._pendingSubdir = null;
        }
    }

    // ── Called from Rust when file content is ready ──
    function openFileContent(name, path, content) {
        var editor = eXide.app.getEditor();
        editor.newDocument(null, guessMode(name));
        var view = editor.editor;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content }
        });
        var doc = editor.getActiveDocument();
        doc.name = name;
        doc.path = path;
        doc.saved = true;
        doc._localFile = true;
        editor.updateTabStatus(doc.path, doc);
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
                // Update the tab label — find tab by old path and update
                var tabLink = document.querySelector('#tabs a[title="' + oldPath + '"]');
                if (tabLink) {
                    tabLink.textContent = name;
                    tabLink.title = path;
                }
            })
            .catch(function (err) {
                try { eXide.util.error("Could not open file: " + err.message); } catch(e) {}
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
        renderSubdir: renderSubdir,
        openFileContent: openFileContent,
        showPane: showLocalPane,
        _pendingSubdir: null
    };
})();
