/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2011-2025 The eXist-db Authors
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 */

eXide.namespace("eXide.app.Monitor");

eXide.app.Monitor = (function () {

    var JMX_NS = "http://exist-db.org/jmx";
    var CATEGORIES = "c=instances&c=processes&c=memory";

    function jmx2js(node) {
        if (!node) return null;
        if (!(node.firstChild || node.attributes.length > 0)) return null;
        var parent = {};
        if (node.nodeType === Node.ELEMENT_NODE) {
            for (var i = 0; i < node.attributes.length; i++) {
                parent[node.attributes[i].localName] = node.attributes[i].nodeValue;
            }
        }
        var child = node.firstChild;
        while (child) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                if (child.localName === "row") {
                    if (!(parent instanceof Array)) parent = [];
                    parent.push(jmx2js(child));
                } else {
                    var existing = parent[child.localName];
                    if (existing) {
                        if (!(existing instanceof Array)) {
                            parent[child.localName] = [existing];
                            existing = parent[child.localName];
                        }
                        existing.push(jmx2js(child));
                    } else {
                        parent[child.localName] = jmx2js(child);
                    }
                }
            } else if (node.childNodes.length === 1) {
                return child.nodeValue;
            }
            child = child.nextSibling;
        }
        return parent;
    }

    function formatUptime(ms) {
        var uptime = parseInt(ms);
        var cd = 24 * 60 * 60 * 1000;
        var ch = 60 * 60 * 1000;
        var d = Math.floor(uptime / cd);
        var h = Math.floor((uptime - d * cd) / ch);
        var m = Math.round((uptime - d * cd - h * ch) / 60000);
        var hh = ("0" + h).slice(-2);
        var mm = ("0" + m).slice(-2);
        return d > 0 ? d + "d " + hh + "h" : hh + "h" + mm + "m";
    }

    function formatMB(bytes) {
        return Math.round(parseInt(bytes) / 1024 / 1024);
    }

    function escapeHtml(str) {
        var d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    function formatSource(sourceKey, sourceType) {
        if (!sourceKey) return "";
        // String-based queries (e.g. from eXide's execute endpoint) have sourceType "String"
        // and a hash like "String/1234567890". Show a short label instead.
        if (sourceType === "String" || /^String\//.test(sourceKey)) return "(eval)";
        return sourceKey;
    }

    function renderSourceCell(sourceKey, sourceType) {
        var src = formatSource(sourceKey, sourceType);
        if (!src) return '<td class="mon-source"></td>';
        // Database paths become clickable links that open in eXide
        if (/^\/db\//.test(src)) {
            return '<td class="mon-source"><a href="#" class="mon-open" data-path="' +
                escapeHtml(src) + '" title="' + escapeHtml(src) + '">' + escapeHtml(src) + '</a></td>';
        }
        return '<td class="mon-source" title="' + escapeHtml(sourceKey || "") + '">' + escapeHtml(src) + '</td>';
    }

    Constr = function () {
        this.token = null;
        this.polling = false;
        this.pollInterval = 2000;
        this.timer = null;
        this.panel = document.getElementById("monitor-panel");
    };

    Constr.prototype.init = function () {
        var self = this;

        // interval selector
        var intervalSelect = document.getElementById("monitor-interval");
        if (intervalSelect) {
            intervalSelect.addEventListener("change", function () {
                self.pollInterval = parseInt(this.value);
            });
        }

        // open db paths in eXide
        if (this.panel) {
            this.panel.addEventListener("click", function (e) {
                var link = e.target.closest(".mon-open");
                if (link) {
                    e.preventDefault();
                    var path = link.getAttribute("data-path");
                    if (path) {
                        eXide.app.openDocument({ path: path });
                    }
                }
            });
        }
    };

    Constr.prototype.start = function () {
        if (this.polling) return;
        this.polling = true;
        this.fetchToken();
    };

    Constr.prototype.stop = function () {
        this.polling = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    };

    Constr.prototype.fetchToken = function () {
        var self = this;
        fetch("api/admin/status")
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.jmxToken) {
                    self.token = data.jmxToken;
                    self.poll();
                } else {
                    self.showError("Could not obtain JMX token. DBA login required.");
                }
            })
            .catch(function (err) {
                console.error("Monitor: fetchToken failed", err);
                self.showError("Failed to connect to monitor endpoint.");
            });
    };

    Constr.prototype.poll = function () {
        var self = this;
        if (!self.polling) return;

        var context = eXide.configuration.context || "";
        var url = context + "/status?" + CATEGORIES + "&token=" + self.token;
        fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error("Status " + r.status);
                return r.text();
            })
            .then(function (text) {
                var parser = new DOMParser();
                var xml = parser.parseFromString(text, "text/xml");
                var data = jmx2js(xml.documentElement);
                if (data) self.update(data);
                if (self.polling) {
                    self.timer = setTimeout(function () { self.poll(); }, self.pollInterval);
                }
            })
            .catch(function (err) {
                console.error("Monitor: poll failed", err);
                if (self.polling) {
                    self.timer = setTimeout(function () { self.poll(); }, 5000);
                }
            });
    };

    Constr.prototype.update = function (data) {
        // Memory
        var mem = data.MemoryImpl && data.MemoryImpl.HeapMemoryUsage;
        if (mem) {
            var used = formatMB(mem.used);
            var committed = formatMB(mem.committed);
            var max = formatMB(mem.max);
            var usedPct = Math.round((parseInt(mem.used) / parseInt(mem.max)) * 100);
            var committedPct = Math.round((parseInt(mem.committed) / parseInt(mem.max)) * 100);

            var memNums = document.getElementById("mon-mem-nums");
            if (memNums) memNums.textContent = used + " / " + max + " MB";

            var memUsed = document.getElementById("mon-mem-used");
            if (memUsed) memUsed.style.width = usedPct + "%";

            var memCommitted = document.getElementById("mon-mem-committed");
            if (memCommitted) memCommitted.style.width = committedPct + "%";
        }

        // Running queries
        var proc = data.ProcessReport;
        var running = [];
        if (proc && proc.RunningQueries) {
            running = proc.RunningQueries instanceof Array ? proc.RunningQueries : [proc.RunningQueries];
        }
        var runBody = document.getElementById("mon-running-body");
        if (runBody) {
            // Unwrap row key/value structure from jmx2js
            var unwrapped = running.map(function(q) { return q.value || q; });
            var filtered = unwrapped.filter(function(q) { return q.caller !== "true"; });
            if (filtered.length === 0) {
                runBody.innerHTML = '<tr><td colspan="3" class="mon-empty">none</td></tr>';
            } else {
                runBody.innerHTML = filtered.map(function (q) {
                    var elapsed = q.elapsed ? (parseInt(q.elapsed) / 1000).toFixed(1) + "s" : "";
                    return '<tr class="mon-running">' +
                        '<td><button class="mon-kill" data-id="' + escapeHtml(q.id) + '" title="Kill query">x</button></td>' +
                        '<td>' + escapeHtml(elapsed) + '</td>' +
                        renderSourceCell(q.sourceKey, q.sourceType) +
                        '</tr>';
                }).join("");
            }

            var runCount = document.getElementById("mon-running-count");
            if (runCount) runCount.textContent = filtered.length;
        }

        // Recent queries
        var recent = [];
        if (proc && proc.RecentQueryHistory) {
            recent = proc.RecentQueryHistory instanceof Array ? proc.RecentQueryHistory : [proc.RecentQueryHistory];
        }
        var recentBody = document.getElementById("mon-recent-body");
        if (recentBody) {
            // Unwrap row key/value structure from jmx2js
            recent = recent.map(function(q) { return q.value || q; });
            if (recent.length === 0) {
                recentBody.innerHTML = '<tr><td colspan="2" class="mon-empty">none</td></tr>';
            } else {
                recentBody.innerHTML = recent.map(function (q) {
                    var ms = parseInt(q.mostRecentExecutionDuration || 0);
                    var color = ms > 100 ? "#c0392b" : "#27ae60";
                    return '<tr>' +
                        '<td style="color:' + color + ';font-weight:700">' + ms + '</td>' +
                        renderSourceCell(q.sourceKey, q.sourceType) +
                        '</tr>';
                }).join("");
            }
        }

        // DB brokers and uptime
        var db = data.Database;
        if (db) {
            var dbChip = document.getElementById("mon-chip-db");
            if (dbChip) dbChip.innerHTML = "DB <b>" + (db.ActiveBrokers || "?") + "/" + (db.MaxBrokers || "?") + "</b>";

            var upChip = document.getElementById("mon-chip-uptime");
            if (upChip && db.Uptime) upChip.innerHTML = "Up <b>" + formatUptime(db.Uptime) + "</b>";
        }

        // Waiting threads count
        var waitCount = 0;
        if (data.LockTable && data.LockTable.Attempting) {
            var att = data.LockTable.Attempting;
            waitCount = att instanceof Array ? att.length : (att ? 1 : 0);
        }
        var waitChip = document.getElementById("mon-chip-wait");
        if (waitChip) waitChip.innerHTML = "Wait <b>" + waitCount + "</b>";
    };

    Constr.prototype.killQuery = function (id) {
        fetch("api/admin/queries/" + encodeURIComponent(id), { method: "DELETE" });
    };

    Constr.prototype.showError = function (msg) {
        var body = document.querySelector("#monitor-content .mon-body");
        if (body) body.innerHTML = '<div class="mon-error">' + escapeHtml(msg) + '</div>';
    };

    Constr.prototype.showMessage = function (msg) {
        var body = document.querySelector("#monitor-content .mon-body");
        if (body) body.innerHTML = '<div class="mon-message">' + escapeHtml(msg) + '</div>';
    };

    return Constr;
}());
