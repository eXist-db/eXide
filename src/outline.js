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

eXide.namespace("eXide.edit.Outline");

/**
 * Outline view for functions, variables, elements, etc.
 * Supports three display modes: nested/document, flat/document, flat/alpha.
 */
eXide.edit.Outline = (function () {

    // View modes
    var MODE_NESTED_DOC = "nested-doc";
    var MODE_FLAT_DOC   = "flat-doc";
    var MODE_FLAT_ALPHA = "flat-alpha";

    Constr = function() {
        this.currentDoc = null;
        this.__activated = false;
        this._viewMode = MODE_NESTED_DOC;

        var self = this;
        document.getElementById("outline-filter").addEventListener("keyup", function() {
            self.filter(this.value);
        });

        // Toolbar buttons
        var toolbar = document.getElementById("outline-toolbar");
        if (toolbar) {
            toolbar.addEventListener("click", function(e) {
                var btn = e.target.closest("[data-outline-mode]");
                if (!btn) return;
                self._viewMode = btn.getAttribute("data-outline-mode");
                toolbar.querySelectorAll("[data-outline-mode]").forEach(function(b) {
                    b.classList.toggle("active", b === btn);
                });
                if (self.currentDoc) {
                    self.$outlineUpdate(self.currentDoc);
                }
            });
            // Mark initial active
            var initial = toolbar.querySelector('[data-outline-mode="' + this._viewMode + '"]');
            if (initial) initial.classList.add("active");
        }
    };

    function indentPrefix(level) {
        var s = "";
        for (var i = 0; i < level; i++) s += "\u00A0\u00A0";
        return s;
    }

    function docOrderSort(a, b) {
        var ra = a.row !== undefined ? a.row : 999999;
        var rb = b.row !== undefined ? b.row : 999999;
        return ra - rb;
    }

    function alphaSort(a, b) {
        var na = (a.name || "").toLowerCase();
        var nb = (b.name || "").toLowerCase();
        return na > nb ? 1 : na < nb ? -1 : 0;
    }

    Constr.prototype = {

        toggle : function(state) {
            if(state || state === false) {this.__activated = !!state}
            else {this.__activated = !this.__activated};
            var body = document.getElementById("outline-body");
            if (body) {
                body.style.position = this.__activated ? "relative" : "absolute";
                body.style.visibility = this.__activated ? "visible" : "hidden";
            }
            if(this.__activated && this.currentDoc) {
                this.updateOutline(this.currentDoc)
            }
        },

        getTemplates: function (prefix) {
            var re = new RegExp("^" + prefix);
            var matches = [];
            for (var i = 0; i < this.templates.length; i++) {
                if (this.templates[i].name.match(re)) {
                    matches.push(this.templates[i]);
                }
            }
            return matches;
        },

        gotoDefinition: function(doc, name) {
            var type = "function"
            if (name.indexOf("$") === 0) {
                name = name.substring(1);
                type = "variable";
            }
            for (var i = 0; i < doc.functions.length; i++) {
                var func = doc.functions[i];
                if (name == func.name && type == func.type) {
                    eXide.app.locate(func.type, func.source == '' ? null : func.source, name);
                    break;
                }
            }
        },

        findDefinition: function(doc, name) {
            for (var i = 0; i < doc.functions.length; i++) {
                var func = doc.functions[i];
                if (name == func.name) {
                    return func;
                }
            }
            return null;
        },

        updateOutline: function(doc) {
            var self = this;
            self.currentDoc = doc;

            var helper = doc.getModeHelper();
            if (helper != null && this.__activated) {
                doc.functions = [];
                helper.createOutline(doc, function() {
                    self.$outlineUpdate(doc);
                });
            }
        },

        clearOutline: function() {
            var el = document.getElementById("outline");
            if (el) el.innerHTML = "";
        },

        filter: function(str) {
            var regex = new RegExp(str, "i");
            var links = document.querySelectorAll("#outline li a");
            for (var i = 0; i < links.length; i++) {
                var link = links[i];
                link.style.display = regex.test(link.textContent) ? "" : "none";
            }
        },

        $outlineUpdate: function (doc) {
            if (this.currentDoc != doc)
                return;

            var mode = this._viewMode;
            var nested = (mode === MODE_NESTED_DOC);

            // Prepare sorted data
            var items = doc.functions.slice();
            if (mode === MODE_FLAT_ALPHA) {
                items.sort(alphaSort);
            } else {
                items.sort(docOrderSort);
            }

            eXide.app.resize();

            var outline = document.getElementById("outline");
            outline.innerHTML = "";

            items.forEach(function(d) {
                var li = document.createElement("li");
                var cl = d.type == eXide.edit.Document.TYPE_FUNCTION ? "t_function" : "t_variable";
                if (d.visibility === "private") cl += " private";
                else if (d.visibility === "public") cl += " public";
                if (d.outlineClass) cl += " " + d.outlineClass;
                li.className = cl;

                var a = document.createElement("a");
                if (d.signature) a.title = d.signature;
                a.href = "#" + (d.source ? d.source : "");

                var text = d.type == eXide.edit.Document.TYPE_VARIABLE ? "$" + d.name : d.name;
                if (nested && d.indent) {
                    text = indentPrefix(d.indent) + text;
                }
                var nameSpan = document.createElement("span");
                nameSpan.className = "outline-name";
                nameSpan.textContent = text;
                a.appendChild(nameSpan);

                if (d.hint) {
                    var hintSpan = document.createElement("span");
                    hintSpan.className = "outline-hint";
                    hintSpan.textContent = " \u201C" + d.hint + "\u201D";
                    a.appendChild(hintSpan);
                }

                a.addEventListener("click", function(e) {
                    e.preventDefault();
                    var path = this.hash.substring(1);
                    if (d.from !== undefined && d.to !== undefined) {
                        var ed = eXide.app.getEditor();
                        if (ed && ed.editor) {
                            ed.editor.dispatch({
                                selection: { anchor: d.from, head: d.to },
                                scrollIntoView: true
                            });
                            ed.editor.focus();
                        }
                    } else if(d.row !== undefined && d.row !== null) {
                        eXide.app.locate("function", path == '' ? null: path, parseInt(d.row));
                    } else if(d.type == eXide.edit.Document.TYPE_FUNCTION) {
                        eXide.app.locate("function", path == '' ? null: path, d.name);
                    } else {
                        eXide.app.locate("variable", path == '' ? null: path, d.name);
                    }
                });

                a.style.opacity = "0";
                li.appendChild(a);
                outline.appendChild(li);

                // Fade in
                requestAnimationFrame(function() {
                    a.style.transition = "opacity 0.4s";
                    a.style.opacity = "1";
                });
            });
        }
    };

    return Constr;
}());
