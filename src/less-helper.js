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
        $.ajax({
            url: "store/" + path,
            type: "PUT",
            data: css,
            dataType: "json",
            contentType: "text/css",
            success: function (data) {
                if (data.status == "error") {
                    return eXide.util.error(data.message);
                }
                eXide.util.message(path + " stored.");
            },
            error: function (xhr, status) {
                eXide.util.error(xhr.responseText);
            }
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
        // Use regex to find selectors instead of TokenIterator
        var lines = doc.getText().split("\n");
        var selectorParts = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var braceIdx = line.indexOf("{");
            if (braceIdx >= 0) {
                var part = line.substring(0, braceIdx).trim();
                if (part) selectorParts.push(part);
                var selector = selectorParts.join(" ").trim();
                if (selector) {
                    doc.functions.push({
                        type: eXide.edit.Document.TYPE_FUNCTION,
                        name: selector,
                        source: doc.getPath(),
                        signature: selector,
                        sort: selector,
                        row: i,
                        column: braceIdx
                    });
                }
                selectorParts = [];
            } else if (line.indexOf("}") >= 0) {
                selectorParts = [];
            } else {
                var trimmed = line.trim();
                if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
                    selectorParts.push(trimmed);
                }
            }
        }
        if (onComplete) {
            onComplete(doc);
        }
    }

    return Constr;
}());
