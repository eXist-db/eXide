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

import { namespace } from "./namespace.js";
import { Document } from "./document.js";
import { ModeHelper } from "./mode-helper.js";
import { util } from "./util.js";
import { oop } from "./oop.js";

/**
 * Less specific helper methods.
 */
export const LessModeHelper = (function () {

    function saveCSS (path, css) {
        fetch("store/" + path, {
            method: "PUT",
            headers: { "Content-Type": "text/css" },
            body: css
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status === "error") {
                return util.error(data.message);
            }
            util.message(path + " stored.");
        })
        .catch(function(err) {
            util.error(String(err));
        });
    }

    const Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
        this.addCommand("format", this.format);
        this.addCommand("gotoSymbol", this.gotoSymbol);
    };

    oop.inherit(Constr, ModeHelper);

    Constr.prototype.documentSaved = function(doc) {
        const path = doc.getExternalLink();
        const code = doc.getText();

        if (/\/_.+\.less$/.test(path)) {
          return util.error("CSS not compiled for include : " + path);
        }

        const options = {
            filename: path
        };

        const header = "/**\n" +
                      " * THIS IS A GENERATED FILE\n" +
                      " * to make changes edit\n" +
                      " * " + path + "\n" +
                      " */\n\n";

        const handler = function (err, output) {
            if (err) {
                return util.error("Error: " + err.message);
            }
            util.message("Compiled less file: " + path);
            const cssPath = doc.getPath().replace(/\.less$/, ".css");
            saveCSS(cssPath, header + output.css);
        };
        less.render(code, options, handler);
    };

    Constr.prototype.saveCSS = saveCSS;

    Constr.prototype.createOutline = function(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        tree.iterate({
            enter: function(node) {
                if (node.name === "RuleSet") {
                    let blockStart = node.to;
                    let child = node.node.firstChild;
                    while (child) {
                        if (child.name === "Block") { blockStart = child.from; break; }
                        child = child.nextSibling;
                    }
                    const selector = state.sliceDoc(node.from, blockStart).trim();
                    if (selector) {
                        const line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: Document.TYPE_FUNCTION,
                            name: selector,
                            source: doc.getPath(),
                            signature: selector,
                            sort: selector,
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    return false;
                }
                if (node.name === "MediaStatement" || node.name === "KeyframesStatement") {
                    let text = state.sliceDoc(node.from, node.to);
                    const braceIdx = text.indexOf("{");
                    if (braceIdx >= 0) text = text.substring(0, braceIdx).trim();
                    if (text.length > 60) text = text.substring(0, 60) + "…";
                    const line = state.doc.lineAt(node.from);
                    doc.functions.push({
                        type: Document.TYPE_FUNCTION,
                        name: text,
                        source: doc.getPath(),
                        signature: text,
                        sort: text,
                        row: line.number - 1,
                        from: node.from,
                        to: node.to
                    });
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    }

    return Constr;
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").LessModeHelper = LessModeHelper;
