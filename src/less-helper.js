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
    
    var TokenIterator = require("ace/token_iterator").TokenIterator;
    
	Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
        this.addCommand("locate", this.locate);
	};
	
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);

    Constr.prototype.documentSaved = function(doc) {
        var $this = this;
        var code = doc.getText();
        var path = doc.getExternalLink().replace(/^(.*\/)[^\/]*$/, "$1");
        var parser = new(less.Parser)({
            paths: [path],
            optimization: 3,
            filename: doc.getExternalLink()
        });
        parser.parse(code, function (err, tree) {
            if (err) {
                eXide.util.error("Error: " + err.message);
                return;
            }
            $this.saveCSS(doc, tree.toCSS());
        });
    };
    
    Constr.prototype.saveCSS = function(doc, css) {
        var cssPath = doc.getPath().replace(/\.less$/, ".css");
        eXide.util.message("Compiling less file to " + cssPath);
		$.ajax({
            url: "store/" + cssPath,
			type: "PUT",
			data: css,
			dataType: "json",
            contentType: "text/css",
			success: function (data) {
			    if (data.status == "error") {
					eXide.util.error(data.message);
				} else {
					eXide.util.message(cssPath + " stored.");
				}
			},
			error: function (xhr, status) {
				eXide.util.error(xhr.responseText);
			}
		});
    };
    
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
        if (onComplete)
            onComplete(doc);
    }
    
	return Constr;
}());
