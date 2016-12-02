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
 * XML specific helper methods.
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

    var TokenIterator = require("ace/token_iterator").TokenIterator;

    var Constr = function(editor) {
        this.parent = editor;
        this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
    };

    eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.documentSaved = function(doc) {
        var path = doc.getExternalLink();
        var code = doc.getText();

        if (/\/_.+\.less$/.test(path)) {
          // TODO get main file from code
          return eXide.util.error("CSS not compiled for include : " + path);
        }

        var options = {
            filename: path
            // TODO sourcemaps
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
        var iterator = new TokenIterator(doc.getSession(), 0, 0);
        var next = iterator.stepForward();
        while (next != null) {
            if (next.type == "paren.lparen" && next.value == "{") {
                var selector = [];
                var row = iterator.getCurrentTokenRow();
                var backIter = new TokenIterator(doc.getSession(), row, iterator.getCurrentTokenColumn());
                var prev;
                while ((prev = backIter.stepBackward()) != null) {
                    if (backIter.getCurrentTokenRow() < row)
                        break;
                    selector.push(prev.value);
                }
                var selectorStr = selector.reverse().join("");
                doc.functions.push({
                    type: eXide.edit.Document.TYPE_FUNCTION,
                    name: selectorStr,
                    source: doc.getPath(),
                    signature: selectorStr,
                    sort: selectorStr,
                    row: iterator.getCurrentTokenRow(),
                    column: iterator.getCurrentTokenColumn()
                });
                lastVar = "";
            }
            next = iterator.stepForward();
        }
        if (onComplete) {
            onComplete(doc);
        }
    }

    return Constr;
}());
