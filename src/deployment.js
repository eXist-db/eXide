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
eXide.namespace("eXide.edit.Projects");

eXide.edit.Projects = (function () {

    Constr = function () {
        this.projects = {};
    };

    Constr.prototype.findProject = function (collection, callback) {
        const project = this.getProjectFor(collection);
        if (project && project !== null) {
            callback(project);
        } else {
            this.getProject(collection, callback);
        }
    };

    Constr.prototype.getProject = function (collection, callback) {
        const cb = typeof callback == "function" ? callback : function () { };
        if (!collection || collection === "/db" || collection === "/db/" || collection.indexOf("__new__") !== -1) {
            cb(null);
            return;
        }
        const $this = this;
        const url = "api/packages/?collection=" + encodeURIComponent(collection);
        fetch(url).then(function(response) {
            if (!response.ok) return null;
            return response.json();
        }).then(function (data) {
            if (!data) {
                cb(null);
                return;
            }
            const project = $this.projects[data.abbrev];
            if (project) {
                Object.assign(project, data);
                cb(project);
            } else {
                $this.projects[data.abbrev] = data;
                cb(data);
            }
        }).catch(function () {
            cb(null);
        });
    };

    Constr.prototype.getProjectFor = function (collection) {
        const filteredProjects = Object.values(this.projects)
            .filter(project => project &&  project.root && collection.startsWith(project.root));

        return filteredProjects[0] || null;
    };

    Constr.prototype.saveState = function () {
        localStorage["eXide.projects"] = JSON.stringify(this.projects);
    };

    Constr.prototype.restoreState = function () {
        const $this = this;
        if (localStorage["eXide.projects"]) {
            this.projects = JSON.parse(localStorage["eXide.projects"]);
            if (typeof this.projects != 'object')
                this.projects = {};
        }
        // refresh state to see if app package config has chaged in the db (e.g added Git)
        const projects = this.projects;
        Object.keys(projects).forEach(function (key) {
            const project = projects[key];
            if (project.root) {
                $this.getProject(project.root);
            }
        });

    };

    return Constr;
}(eXide.util.oop));

eXide.namespace("eXide.edit.PackageEditor");

/**
 * Edit deployment descriptors.
 */
eXide.edit.PackageEditor = (function () {

    Constr = function (projects) {
        const $this = this;
        this.projects = projects;
        this.currentProject = null;

        const runDialogEl = document.getElementById("dialog-run-app");
        this.runDialog = eXide.util.DialogManager.create(runDialogEl, {
            appendTo: "#layout-container",
            modal: false,
            width: 300,
            height: 240,
            buttons: {
                "Done": function () { this.close(); }
            }
        });
        runDialogEl.querySelector("input[name='live-reload']").addEventListener("click", function (ev) {
            $this.currentProject.liveReload = this.checked;
            document.querySelector("#menu-deploy-live span").setAttribute("class", $this.currentProject.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
        });

        const syncDialogEl = document.getElementById("synchronize-dialog");
        this.syncDialog = eXide.util.DialogManager.create(syncDialogEl, {
            appendTo: "#layout-container",
            title: "Synchronize to Directory",
            modal: false,
            width: 500,
            height: 440,
            buttons: {
                "Apply": function () {
                    const dir = syncDialogEl.querySelector("input[name=\"dir\"]").value;
                    if (dir && dir.length > 0) {
                        $this.currentProject.dir = dir;
                    }
                    $this.currentProject.autoSync = syncDialogEl.querySelector("input[name=\"auto\"]").checked;
                    this.close();
                },
                "Synchronize": function () {
                    const dir = syncDialogEl.querySelector("input[name=\"dir\"]").value;
                    if (!dir || dir.length == 0) {
                        document.getElementById("synchronize-report").textContent = "No output directory specified!";
                        return;
                    }
                    $this.currentProject.dir = dir;

                    const params = new URLSearchParams({
                        start: syncDialogEl.querySelector("input[name=\"start\"]").value,
                        dir: dir,
                        auto: syncDialogEl.querySelector("input[name=\"auto\"]").value,
                        collection: syncDialogEl.querySelector("input[name=\"collection\"]").value,
                        indent: document.getElementById("indent-on-download-package").checked,
                        "expand-xincludes": document.getElementById("expand-xincludes-on-download-package").checked,
                        "omit-xml-declarationaration": document.getElementById("omit-xml-declaration-on-download-package").checked
                    });
                    const reportEl = document.getElementById("synchronize-report");
                    reportEl.textContent = "Synchronization in progress ...";
                    fetch("api/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            collection: syncDialogEl.querySelector("input[name=\"collection\"]").value,
                            dir: dir,
                            after: syncDialogEl.querySelector("input[name=\"start\"]").value
                        })
                    }).then(function (response) {
                        return response.json();
                    }).then(function (data) {
                        reportEl.textContent = data.error || ("Updated: " + (data.updated || 0) + " files");
                    });
                },
                "Close": function () { this.close(); }
            }
        });
        this.syncDialogEl = syncDialogEl;

        const gitCheckoutEl = document.getElementById("dialog-git-checkout");
        this.gitCheckoutDialog = eXide.util.DialogManager.create(gitCheckoutEl, {
            appendTo: "#layout-container",
            title: "Git Checkout",
            modal: false,
            width: 500,
            height: 240,
            buttons: {
                "Switch Branch": function () {
                    const branch = gitCheckoutEl.querySelector("form [name='git-checkout']").value;
                    eXide.app.git.command($this.currentProject, 'checkout', branch, function (data) {
                        document.getElementById("toolbar-current-branch").textContent = branch;
                        document.getElementById("menu-git-active").textContent = branch;
                    });
                    this.close();
                },
                "Cancel": function () { this.close(); }
            }
        });

        const gitCommitEl = document.getElementById("dialog-git-commit");
        this.gitCommitDialog = eXide.util.DialogManager.create(gitCommitEl, {
            appendTo: "#layout-container",
            title: "Synchonize and Commit",
            modal: false,
            width: 500,
            height: 360,
            buttons: {
                "Sync and Commit": function () {
                    const form = gitCommitEl.querySelector("form"),
                        title = form.querySelector("[name='git-commit-title']").value,
                        desc = form.querySelector("[name='git-commit-desc']").value,
                        option = title + '\n\n' + desc,
                        start = form.querySelector("[name='start']").value,
                        statusEl = document.getElementById("git-commit-status");

                    if (!title || title.length == 0) {
                        statusEl.textContent = "title for commit message is required";
                        return;
                    }

                    statusEl.textContent = "Synchronization in progress ...";
                    fetch("api/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            collection: $this.currentProject.root,
                            after: start
                        })
                    }).then(function (response) {
                        return response.json();
                    }).then(function (data) {
                        statusEl.textContent = data.error || ("Updated: " + (data.updated || 0) + " files");
                        eXide.app.git.command($this.currentProject, 'commit', option);
                    });

                    this.close();
                },
                "Cancel": function () { this.close(); }
            }
        });

    };

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    Constr.prototype.download = function (collection) {
        const $this = this;
        this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found.");
                return;
            }
            // POST triggers XAR build + download via Roaster
            fetch("api/packages/" + encodeURIComponent(project.abbrev) + "/build", {
                method: "POST"
            })
                .then(function (response) {
                    if (!response.ok) throw new Error("Build failed: " + response.status);
                    return response.blob();
                })
                .then(function (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = project.abbrev + "-" + (project.version || "0.1") + ".xar";
                    a.click();
                    URL.revokeObjectURL(url);
                })
                .catch(function (err) {
                    eXide.util.error("Download failed: " + err.message);
                });
        });
    };

    /**
     * Synchronize current application package to file system directory.
     */
    Constr.prototype.synchronize = function (collection) {
        const $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                eXide.util.error("You need to be logged in as an admin user with dba role " +
                    "to use this feature.");
                return;
            }
            document.getElementById("synchronize-report").innerHTML = "";
            $this.currentProject = project;
            const el = $this.syncDialogEl;
            const projectNameEl = el.querySelector(".project-name");
            if (projectNameEl) projectNameEl.textContent = project.abbrev;
            el.querySelector("input[name=\"start\"]").value = project.deployed;
            if (project.dir) {
                el.querySelector("input[name=\"dir\"]").value = project.dir;
            } else {
                el.querySelector("input[name=\"dir\"]").value = "";
            }
            el.querySelector("input[name=\"collection\"]").value = project.root;
            el.querySelector("input[name=\"auto\"]").checked = project.autoSync;
            $this.syncDialog.open();
        });
    };

    Constr.prototype.autoSync = function (collection) {
        const project = this.projects.getProjectFor(collection);
        if (project && project.autoSync) {
            fetch("api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    collection: project.root,
                    dir: project.dir,
                    after: project.deployed
                })
            }).then(function (response) {
                if (response.ok) {
                    eXide.util.message("Synchronized directory");
                }
            });
        }
    };

    Constr.prototype.runApp = function (collection, firstLoad) {
        const $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }

            const runEl = $this.runDialog.content;
            runEl.querySelector("input[name='live-reload']").checked = project.liveReload;

            $this.currentProject = project;
            const url = project.url.replace(/\/{2,}/, "/");
            const link = eXide.configuration.context + url + "/";

            const a = runEl.querySelector("a");
            a.setAttribute("href", link);
            a.setAttribute("target", project.abbrev);
            a.textContent = link;

            if (firstLoad) {
                runEl.querySelector(".first-load").style.display = "";
                runEl.querySelector(".second-load").style.display = "none";
            } else {
                runEl.querySelector(".first-load").style.display = "";
                runEl.querySelector(".second-load").style.display = "none";
            }
            $this.runDialog.open();
        });
    };

    Constr.prototype.saveState = function () {
        this.projects.saveState();
    };

    Constr.prototype.restoreState = function () {
        this.projects.restoreState();
    };

    /**
     * Git Checkout.
     */
    Constr.prototype.gitCheckout = function (collection) {
        const $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                eXide.util.error("You need to be logged in as an admin user with dba role " +
                    "to use this feature.");
                return;
            }
            $this.currentProject = project;

            const select = document.getElementById("git-checkout-select");
            if (select) {
                select.innerHTML = "";
                project.gitBranch.forEach(function (branch) {
                    const opt = document.createElement("option");
                    opt.value = branch;
                    opt.textContent = branch;
                    select.appendChild(opt);
                });
            }

            $this.gitCheckoutDialog.open();
        })
    }
    /**
     * Git Commit.
     */
    Constr.prototype.gitCommit = function (collection) {
        const $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                eXide.util.error("You need to be logged in as an admin user with dba role " +
                    "to use this feature.");
                return;
            }
            $this.currentProject = project;
            $this.gitCommitDialog.open();
        })
    }


    return Constr;
}());