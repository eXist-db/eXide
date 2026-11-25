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
eXide.namespace("eXide.util.Help");

/**
 * Singleton object: Help dialog.
 */
eXide.util.Help = (function () {

    let sections = null;
    let currentPage = -1;
    let helpDlg = null;

    function ensureDialog() {
        if (helpDlg) return;
        const el = document.createElement("div");
        el.id = "eXide-dialog-help";
        el.innerHTML = '<div class="help" id="eXide-dialog-help-body"></div>';
        document.body.appendChild(el);
        helpDlg = eXide.util.DialogManager.create(el, {
            appendTo: "#layout-container",
            modal: false,
            title: "Quick Start",
            width: 600,
            height: 400,
            buttons: {
                "Close": function() { this.close(); },
                "Previous": function() { eXide.util.Help.previous(); },
                "Next": function() {
                    if (sections && currentPage + 1 >= sections.length) {
                        this.close();
                    } else {
                        eXide.util.Help.next();
                    }
                }
            }
        });
    }

    // The primary button reads "Done" on the last page, where it closes the tour,
    // and "Next" everywhere else. "Previous" is disabled on the first page.
    function updateButtons() {
        const buttons = helpDlg.dialog.querySelectorAll(".eXide-dialog-buttons button");
        const previousBtn = buttons[1], nextBtn = buttons[2];
        if (previousBtn) previousBtn.disabled = currentPage <= 0;
        if (nextBtn) nextBtn.textContent = sections && currentPage + 1 >= sections.length ? "Done" : "Next";
    }

    return {

        show: function () {
            ensureDialog();
            helpDlg.open();
            if (!sections) {
                eXide.util.Help.load();
            } else {
                eXide.util.Help.next();
            }
        },

        next: function() {
            if (sections && currentPage + 1 < sections.length) {
                currentPage++;
                document.getElementById("eXide-dialog-help-body").innerHTML = sections[currentPage];
            }
            updateButtons();
        },

        previous: function() {
            if (currentPage > 0) {
                currentPage--;
                document.getElementById("eXide-dialog-help-body").innerHTML = sections[currentPage];
            }
            updateButtons();
        },

        showFirstTime: function() {
            if (!eXide.util.supportsHtml5Storage)
                return;
            const showHints = localStorage.getItem("eXide.hints");
            if (!showHints || showHints === "1") {
                eXide.util.Help.show();
            }
        },

        load: function() {
            fetch("help.html")
            .then(function(response) {
                if (!response.ok) throw response;
                return response.text();
            })
            .then(function(html) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, "text/html");
                const sectionEls = doc.querySelectorAll("section");
                sections = [];
                for (let i = 0; i < sectionEls.length; i++) {
                    sections.push(sectionEls[i].innerHTML);
                }
                eXide.util.Help.show();
            })
            .catch(function(err) {
                if (err.status === 404) {
                    eXide.util.error("Failed to open help texts.");
                } else {
                    eXide.util.Dialog.warning("Deployment Error",
                        "<p>An error has been reported by the database.</p>");
                }
                if (helpDlg) helpDlg.close();
            });
        }
    };
}());
