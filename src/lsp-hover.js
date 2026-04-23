/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2013 Wolfgang Meier
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

/**
 * LSP hover tooltip for XQuery mode.
 *
 * Uses CM6's hoverTooltip to show function signatures and variable info
 * when the user hovers over symbols. Fetches data from the server-side
 * lsp:hover() function via /api/query/hover.
 */
eXide.namespace("eXide.edit.LspHover");

eXide.edit.LspHover = (function () {

    var hoverTooltip = CM6.hoverTooltip;

    function lspHoverSource(view, pos, side) {
        // Only hover in XQuery mode
        var doc = eXide.app && eXide.app.getEditor && eXide.app.getEditor().getActiveDocument();
        if (!doc || doc.getSyntax() !== "xquery") {
            return null;
        }

        var line = view.state.doc.lineAt(pos);
        var lineNumber = line.number - 1;  // 0-based for LSP
        var column = pos - line.from;      // 0-based column

        var code = view.state.doc.toString();
        var basePath = "xmldb:exist://" + (doc.getBasePath ? doc.getBasePath() : "/db");

        // Use WebSocket if available, otherwise HTTP
        var dataPromise;
        if (typeof eXide.ws !== "undefined" && eXide.ws.isConnected()) {
            dataPromise = new Promise(function (resolve) {
                eXide.ws.send("textDocument/hover", {
                    textDocument: { uri: doc.getPath() || "untitled" },
                    position: { line: lineNumber, character: column },
                    // eXist-specific: send full query for stateless hover
                    query: code, base: basePath
                }, function (result, err) {
                    resolve(err ? null : result);
                });
            });
        } else {
            dataPromise = fetch("api/query/hover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: code, line: lineNumber, column: column, base: basePath
                })
            })
            .then(function (response) {
                if (!response.ok) return null;
                return response.json();
            });
        }

        return dataPromise
        .then(function (data) {
            if (!data || !data.contents) {
                // Fallback: look up local function signature from AST
                return localHoverFallback(view, pos, line, column);
            }

            // Find the word boundaries at the hover position for highlighting
            var wordStart = pos;
            var wordEnd = pos;
            var text = line.text;
            var col = column;

            while (col > 0 && /[\w:\-$]/.test(text[col - 1])) {
                col--;
                wordStart--;
            }
            col = column;
            while (col < text.length && /[\w:\-]/.test(text[col])) {
                col++;
                wordEnd++;
            }

            return {
                pos: wordStart,
                end: wordEnd,
                above: true,
                create: function () {
                    var dom = document.createElement("div");
                    dom.className = "cm-lsp-hover";

                    var sig = document.createElement("code");
                    sig.className = "cm-lsp-hover-signature";
                    sig.textContent = data.contents.split("\n\n")[0];
                    dom.appendChild(sig);

                    // Documentation (after the signature)
                    var parts = data.contents.split("\n\n");
                    if (parts.length > 1) {
                        var desc = document.createElement("p");
                        desc.className = "cm-lsp-hover-description";
                        desc.textContent = parts.slice(1).join("\n\n");
                        dom.appendChild(desc);
                    }

                    return { dom: dom };
                }
            };
        })
        .catch(function () {
            return null;
        });
    }

    /**
     * Client-side hover fallback: look up local function/variable from AST
     * when the server's lsp:hover() returns nothing.
     */
    function localHoverFallback(view, pos, line, column) {
        var doc = eXide.app.getEditor().getActiveDocument();
        if (!doc || !doc.ast) return null;

        var lead = { line: line.number - 1, col: column };
        var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, lead);
        if (!astNode) return null;

        // Check if we're on a FunctionCall
        var fcall = eXide.edit.XQueryUtils.findAncestor(astNode, "FunctionCall");
        var funcName = null;
        var arity = 0;
        var signature = null;
        if (fcall) {
            var nameNode = eXide.edit.XQueryUtils.findChild(fcall, "EQName");
            if (nameNode) {
                funcName = eXide.edit.XQueryUtils.getValue(nameNode);
                arity = fcall.arity || 0;
                // Search outline for matching function
                for (var i = 0; i < doc.functions.length; i++) {
                    var f = doc.functions[i];
                    if (f.type === "function" && f.name === funcName) {
                        signature = f.signature || funcName + "#" + arity;
                        break;
                    }
                }
            }
        }

        // Check if we're on a VarRef
        if (!funcName && !signature) {
            var varRef = eXide.edit.XQueryUtils.findAncestor(astNode, ["VarRef", "VarName"]);
            if (varRef) {
                var varEQName = eXide.edit.XQueryUtils.findChild(
                    varRef.name === "VarRef" ? varRef : varRef, "EQName"
                );
                if (varEQName) {
                    signature = "$" + eXide.edit.XQueryUtils.getValue(varEQName);
                }
            }
        }

        if (!funcName && !signature) return null;

        // Build word boundaries for tooltip positioning
        var wordStart = pos;
        var wordEnd = pos;
        var text = line.text;
        var col = column;
        while (col > 0 && /[\w:\-$]/.test(text[col - 1])) { col--; wordStart--; }
        col = column;
        while (col < text.length && /[\w:\-]/.test(text[col])) { col++; wordEnd++; }

        // For prefixed function calls, fetch full docs from the server
        if (funcName && funcName.indexOf(":") !== -1) {
            return fetch("api/editor/completions?" + new URLSearchParams({
                prefix: funcName,
                signature: funcName + "#" + arity
            }))
            .then(function (r) { return r.json(); })
            .then(function (items) {
                var match = null;
                if (items && items.length > 0) {
                    // Prefer exact arity match
                    for (var j = 0; j < items.length; j++) {
                        if (items[j].name === funcName + "#" + arity) {
                            match = items[j];
                            break;
                        }
                    }
                    if (!match) match = items[0];
                }
                if (!match) return null;

                return {
                    pos: wordStart,
                    end: wordEnd,
                    above: true,
                    create: function () {
                        var dom = document.createElement("div");
                        dom.className = "cm-lsp-hover";
                        var sig = document.createElement("code");
                        sig.className = "cm-lsp-hover-signature";
                        sig.textContent = match.text || funcName;
                        dom.appendChild(sig);
                        if (match.description) {
                            var desc = document.createElement("p");
                            desc.className = "cm-lsp-hover-description";
                            desc.textContent = match.description;
                            dom.appendChild(desc);
                        }
                        return { dom: dom };
                    }
                };
            })
            .catch(function () { return null; });
        }

        return {
            pos: wordStart,
            end: wordEnd,
            above: true,
            create: function () {
                var dom = document.createElement("div");
                dom.className = "cm-lsp-hover";
                var sig = document.createElement("code");
                sig.className = "cm-lsp-hover-signature";
                sig.textContent = signature || funcName;
                dom.appendChild(sig);
                return { dom: dom };
            }
        };
    }

    function extension() {
        return hoverTooltip(lspHoverSource, { hoverTime: 300 }).extension;
    }

    return {
        extension: extension
    };
}());
