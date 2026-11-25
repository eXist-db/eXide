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
import { DialogManager } from "./dialog-utils.js";
import { Sender } from "./events.js";
import { util } from "./util.js";

// localStorage["eXide.projects"] is shared between eXide versions running
// against the same browser. eXide 3.x stores it as a flat map of
// abbrev -> project object, and its getProjectFor() reads
// `project.root.length` for EVERY entry with no guard (eXide <= 3.5.x,
// src/deployment.js). So any value lacking a string `root` crashes 3.x
// hard on load with "Cannot read properties of undefined (reading
// 'length')". To stay compatible when a user alternates between 3.x and
// 4.x against the same storage, every entry we keep — and everything we
// persist — must be a real project with a string `root`. In particular we
// must never write the malformed `{ "undefined": { packages: [...] } }`
// entry that a non-app `api/packages` response would otherwise produce.
function isProject(value) {
    return value != null && typeof value === "object" &&
        typeof value.root === "string" && value.root.length > 0;
}

// Keep only well-formed project entries (and drop the "undefined" key),
// so a malformed entry can neither be persisted nor survive a reload.
function sanitizeProjects(projects) {
    const clean = {};
    if (projects && typeof projects === "object") {
        Object.keys(projects).forEach((key) => {
            if (key !== "undefined" && isProject(projects[key])) {
                clean[key] = projects[key];
            }
        });
    }
    return clean;
}

export class Projects {
    constructor() {
        this.projects = {};
    }

    findProject(collection, callback) {
        const project = this.getProjectFor(collection);
        if (project && project !== null) {
            callback(project);
        } else {
            this.getProject(collection, callback);
        }
    }

    async getProject(collection, callback) {
        const cb = typeof callback === "function" ? callback : function () { };
        if (!collection || collection === "/db" || collection === "/db/" || collection.indexOf("__new__") !== -1) {
            cb(null);
            return;
        }
        const $this = this;
        const url = `api/packages/?collection=${encodeURIComponent(collection)}`;
        try {
            const response = await fetch(url);
            const data = response.ok ? await response.json() : null;
            // A non-app collection yields a response without an abbrev/root
            // (e.g. the full `{ packages: [...] }` list). Treat that as "no
            // project" rather than storing it under the key "undefined", which
            // would poison eXide.projects (see isProject above).
            if (!isProject(data) || !data.abbrev) {
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
        } catch {
            cb(null);
        }
    }

    getProjectFor(collection) {
        const filteredProjects = Object.values(this.projects)
            .filter(project => isProject(project) && collection.startsWith(project.root));

        return filteredProjects[0] || null;
    }

    saveState() {
        // Sanitize on the way out so a malformed in-memory entry can never be
        // persisted — this is what keeps a later eXide 3.x load from crashing.
        localStorage["eXide.projects"] = JSON.stringify(sanitizeProjects(this.projects));
    }

    restoreState() {
        const $this = this;
        if (localStorage["eXide.projects"]) {
            // Sanitize on the way in so storage already poisoned by an earlier
            // build self-heals on the next load.
            this.projects = sanitizeProjects(JSON.parse(localStorage["eXide.projects"]));
        }
        // refresh state to see if app package config has chaged in the db (e.g added Git)
        const projects = this.projects;
        Object.keys(projects).forEach((key) => {
            const project = projects[key];
            if (project.root) {
                $this.getProject(project.root);
            }
        });

    }
}
/**
 * Edit deployment descriptors.
 */
export class PackageEditor extends Sender {
    constructor(projects) {
        super();
        const $this = this;
        this.projects = projects;
        this.currentProject = null;

        const runDialogEl = document.getElementById("dialog-run-app");
        this.runDialog = DialogManager.create(runDialogEl, {
            appendTo: "#layout-container",
            title: "Run Application",
            modal: false,
            width: 300,
            height: 240,
            buttons: {
                "Done" () { this.close(); }
            }
        });
        runDialogEl.querySelector("input[name='live-reload']").addEventListener("click", function (ev) {
            $this.currentProject.liveReload = this.checked;
            document.querySelector("#menu-deploy-live span").setAttribute("class", $this.currentProject.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
        });

        const syncDialogEl = document.getElementById("synchronize-dialog");
        this.syncDialog = DialogManager.create(syncDialogEl, {
            appendTo: "#layout-container",
            title: "Synchronize to Directory",
            modal: false,
            width: 500,
            height: 440,
            buttons: {
                "Close" () { this.close(); },
                "Apply" () {
                    const dir = syncDialogEl.querySelector("input[name=\"dir\"]").value;
                    if (dir && dir.length > 0) {
                        $this.currentProject.dir = dir;
                    }
                    $this.currentProject.autoSync = syncDialogEl.querySelector("input[name=\"auto\"]").checked;
                    this.close();
                },
                async "Synchronize" () {
                    const dir = syncDialogEl.querySelector("input[name=\"dir\"]").value;
                    if (!dir || dir.length === 0) {
                        document.getElementById("synchronize-report").textContent = "No output directory specified!";
                        return;
                    }
                    $this.currentProject.dir = dir;

                    const reportEl = document.getElementById("synchronize-report");
                    reportEl.textContent = "Synchronization in progress ...";
                    const response = await fetch("api/sync", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            collection: syncDialogEl.querySelector("input[name=\"collection\"]").value,
                            dir,
                            after: syncDialogEl.querySelector("input[name=\"start\"]").value
                        })
                    });
                    const data = await response.json();
                    reportEl.textContent = data.error || (`Updated: ${data.updated || 0} files`);
                }
            }
        });
        this.syncDialogEl = syncDialogEl;

        const gitCheckoutEl = document.getElementById("dialog-git-checkout");
        this.gitCheckoutDialog = DialogManager.create(gitCheckoutEl, {
            appendTo: "#layout-container",
            title: "Git Checkout",
            modal: false,
            width: 500,
            height: 240,
            buttons: {
                "Cancel" () { this.close(); },
                "Switch Branch" () {
                    const branch = gitCheckoutEl.querySelector("form [name='git-checkout']").value;
                    eXide.app.git.command($this.currentProject, 'checkout', branch, (data) => {
                        document.getElementById("toolbar-current-branch").textContent = branch;
                        document.getElementById("menu-git-active").textContent = branch;
                    });
                    this.close();
                }
            }
        });

        const gitCommitEl = document.getElementById("dialog-git-commit");
        this.gitCommitDialog = DialogManager.create(gitCommitEl, {
            appendTo: "#layout-container",
            title: "Synchronize and Commit",
            modal: false,
            width: 500,
            height: 360,
            buttons: {
                "Cancel" () { this.close(); },
                "Sync and Commit" () {
                    const form = gitCommitEl.querySelector("form"),
                        title = form.querySelector("[name='git-commit-title']").value,
                        desc = form.querySelector("[name='git-commit-desc']").value,
                        option = `${title}\n\n${desc}`,
                        start = form.querySelector("[name='start']").value,
                        statusEl = document.getElementById("git-commit-status");

                    if (!title || title.length === 0) {
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
                    }).then((response) => {
                        return response.json();
                    }).then((data) => {
                        statusEl.textContent = data.error || (`Updated: ${data.updated || 0} files`);
                        eXide.app.git.command($this.currentProject, 'commit', option);
                    });

                    this.close();
                }
            }
        });

    }

    download(collection) {
        this.projects.findProject(collection, async (project) => {
            if (!project) {
                util.error("Application not found.");
                return;
            }
            // POST triggers XAR build + download via Roaster
            try {
                const response = await fetch(`api/packages/${encodeURIComponent(project.abbrev)}/build`, {
                    method: "POST"
                });
                if (!response.ok) throw new Error(`Build failed: ${response.status}`);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${project.abbrev}-${project.version || "0.1"}.xar`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                util.error(`Download failed: ${err.message}`);
            }
        });
    }

    /**
     * Synchronize current application package to file system directory.
     */
    synchronize(collection) {
        const $this = this;
        $this.projects.findProject(collection, (project) => {
            if (!project) {
                util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                util.error("You need to be logged in as an admin user with dba role " +
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
    }

    async autoSync(collection) {
        const project = this.projects.getProjectFor(collection);
        if (project && project.autoSync) {
            const response = await fetch("api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    collection: project.root,
                    dir: project.dir,
                    after: project.deployed
                })
            });
            if (response.ok) {
                util.message("Synchronized directory");
            }
        }
    }

    runApp(collection, firstLoad) {
        const $this = this;
        $this.projects.findProject(collection, (project) => {
            if (!project) {
                util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }

            const runEl = $this.runDialog.content;
            runEl.querySelector("input[name='live-reload']").checked = project.liveReload;

            $this.currentProject = project;
            const url = project.url.replace(/\/{2,}/, "/");
            const link = `${eXide.configuration.context + url}/`;

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
    }

    saveState() {
        this.projects.saveState();
    }

    restoreState() {
        this.projects.restoreState();
    }

    /**
     * Git Checkout.
     */
    gitCheckout(collection) {
        const $this = this;
        $this.projects.findProject(collection, (project) => {
            if (!project) {
                util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                util.error("You need to be logged in as an admin user with dba role " +
                    "to use this feature.");
                return;
            }
            $this.currentProject = project;

            const select = document.getElementById("git-checkout-select");
            if (select) {
                select.innerHTML = "";
                project.gitBranch.forEach((branch) => {
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
    gitCommit(collection) {
        const $this = this;
        $this.projects.findProject(collection, (project) => {
            if (!project) {
                util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            if (!eXide.app.login.isAdmin) {
                util.error("You need to be logged in as an admin user with dba role " +
                    "to use this feature.");
                return;
            }
            $this.currentProject = project;
            $this.gitCommitDialog.open();
        })
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").Projects = Projects;
namespace("eXide.edit").PackageEditor = PackageEditor;
