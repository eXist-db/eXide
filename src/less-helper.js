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
eXide.namespace("eXide.edit.LessModeHelper");

/**
 * Less specific helper methods.
 */
eXide.edit.LessModeHelper = (function () {

    function saveCSS (path, css) {
        fetch("store/" + path, {
            method: "PUT",
            headers: { "Content-Type": "text/css" },
            body: css
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.status == "error") {
                return eXide.util.error(data.message);
            }
            eXide.util.message(path + " stored.");
        })
        .catch(function(err) {
            eXide.util.error(String(err));
        });
    }

    var Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
        this.addCommand("format", this.format);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.documentSaved = function(doc) {
        var path = doc.getExternalLink();
        var code = doc.getText();

        if (/\/_.+\.less$/.test(path)) {
          return eXide.util.error("CSS not compiled for include : " + path);
        }

        var options = {
            filename: path
        };

        var header = "/**\n" +
                      " * THIS IS A GENERATED FILE\n" +
                      " * to make changes edit\n" +
                      " * " + path + "\n" +
                      " */\n\n";

        var handler = function (err, output) {
            if (err) {
                return eXide.util.error("Error: " + err.message);
            }
            eXide.util.message("Compiled less file: " + path);
            var cssPath = doc.getPath().replace(/\.less$/, ".css");
            saveCSS(cssPath, header + output.css);
        };
        less.render(code, options, handler);
    };

    Constr.prototype.saveCSS = saveCSS;

    Constr.prototype.createOutline = function(doc, onComplete) {
        var tree = CM6.syntaxTree(this.editor.state);
        var state = this.editor.state;
        tree.iterate({
            enter: function(node) {
                if (node.name === "RuleSet") {
                    var blockStart = node.to;
                    var child = node.node.firstChild;
                    while (child) {
                        if (child.name === "Block") { blockStart = child.from; break; }
                        child = child.nextSibling;
                    }
                    var selector = state.sliceDoc(node.from, blockStart).trim();
                    if (selector) {
                        var line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: eXide.edit.Document.TYPE_FUNCTION,
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
                    var text = state.sliceDoc(node.from, node.to);
                    var braceIdx = text.indexOf("{");
                    if (braceIdx >= 0) text = text.substring(0, braceIdx).trim();
                    if (text.length > 60) text = text.substring(0, 60) + "…";
                    var line = state.doc.lineAt(node.from);
                    doc.functions.push({
                        type: eXide.edit.Document.TYPE_FUNCTION,
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
