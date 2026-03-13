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

        return fetch("api/query/hover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: code,
                line: lineNumber,
                column: column,
                base: basePath
            })
        })
        .then(function (response) { return response.json(); })
        .then(function (data) {
            if (!data || !data.contents) {
                return null;
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

    function extension() {
        return hoverTooltip(lspHoverSource, { hoverTime: 300 }).extension;
    }

    return {
        extension: extension
    };
}());
