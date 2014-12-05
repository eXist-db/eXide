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
eXide.namespace("eXide.edit.XMLModeHelper");

/**
 * XML specific helper methods.
 */
eXide.edit.XMLModeHelper = (function () {
    
    var TokenIterator = require("ace/token_iterator").TokenIterator;
    var Range = require("ace/range").Range;
    
	Constr = function(editor, menubar) {
        var self = this;
		this.parent = editor;
		this.editor = this.parent.editor;
		
        this.menu = $("#menu-xml").hide();
        menubar.click("#menu-xml-rename", function() {
            self.rename(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-select-element", function() {
            self.selectElement(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-remove-tag", function() {
            self.deleteTags(editor.getActiveDocument());
        });
		this.addCommand("closeTag", this.closeTag);
		this.addCommand("removeTags", this.deleteTags);
        this.addCommand("suggest", this.suggest);
        this.addCommand("rename", this.rename);
        this.addCommand("expandSelection", this.selectElement);
	}
	
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
    
    Constr.prototype.activate = function(doc) {
        this.menu.show();
		this.editor.setOption("enableEmmet", this.parent.enableEmmet);
// 		var syntax = doc.getSyntax();
//         if ( syntax === "html" && this.parent.enableEmmet || syntax === 'xml') {
//             this.editor.setOption("enableEmmet", true);
//         } else {
//             this.editor.setOption("enableEmmet", false);
//         }
    };
    
    Constr.prototype.deactivate = function(doc) {
        this.menu.hide();
        this.editor.setOption("enableEmmet", false);
    };
    
	Constr.prototype.closeTag = function (doc, text, row) {
		var basePath = "xmldb:exist://" + doc.getBasePath();
		var $this = this;
		$.ajax({
			type: "PUT",
			url: "check/",
			data: text,
			contentType: "application/octet-stream",
			dataType: "json",
			success: function (data) {
				if (data.status && data.status == "invalid") {
					var line = parseInt(data.message.line) - 1;
					if (line <= row) {
						var tag = /element type \"([^\"]+)\"/.exec(data.message["#text"]);
						if (tag && tag.length > 0) {
							$this.editor.insert(tag[1] + ">");
						}
					}
				}
			},
			error: function (xhr, status) {
			}
		});
	}
	
	Constr.prototype.validate = function(doc, code, onComplete) {
		var $this = this;
		$.ajax({
			type: "PUT",
			url: "modules/validate-xml.xql",
			data: code,
			contentType: "application/octet-stream",
			dataType: "json",
			success: function (data) {
				$this.compileError(data, doc);
				onComplete.call(this, true);
			},
			error: function (xhr, status) {
				onComplete.call(this, true);
				$.log("Compile error: %s - %s", status, xhr.responseText);
			}
		});
	}
	
	Constr.prototype.compileError = function(data, doc) {
		$.log("Validation returned %o", data);
		if (data.status && data.status == "invalid") {
            var messages;
            if (data.message instanceof Array)
                messages = data.message;
            else
                messages = [ data.message ];
            var annotations = [];
            for (var i = 0; i < messages.length; i++) {    
    			annotations.push({
    				row: parseInt(messages[i].line) - 1,
    				text: messages[i]["#text"],
    				type: "error"
    			});
            }
			this.parent.updateStatus(messages[0]["#text"], doc.getPath() + "#" + messages[0].line);
			doc.getSession().setAnnotations(annotations);
		} else {
			this.parent.clearErrors();
			this.parent.updateStatus("");
		}
	};
    
    Constr.prototype.suggest = function(doc, text, row, column) {
        $.log("Getting suggestions for %s", text);
        $.ajax({
    		type: "POST",
			url: "modules/validate-xml.xql",
			data: { 
                xml: text,
                row: row,
                column: column
            },
			dataType: "json",
			success: function (data) {
				$this.compileError(data, doc);
				onComplete.call(this, true);
			},
			error: function (xhr, status) {
				onComplete.call(this, true);
				$.log("Compile error: %s - %s", status, xhr.responseText);
			}
		});
    }
	
    Constr.prototype.documentSaved = function(doc) {
        if (/.*\.xconf$/.test(doc.getName())) {
            var collection = doc.getBasePath();
            eXide.util.Dialog.input("Apply Configuration?", "You have saved a collection configuration file. Would you like to " +
                "apply it to collection " + collection.replace(/^\/db\/system\/config/, "") + " now?", function() {
                    eXide.util.message("Apply configuration and reindex...");
                    $.ajax({
                        type: "POST",
                        url: "modules/apply-config.xql",
                        data: {
                            collection: doc.getBasePath(),
                            config: doc.getName()
                        },
                        dataType: "json",
                        success: function(data) {
                            if (data.error) {
                                eXide.util.error("Failed to apply configuration: " + data.error);
                            } else {
                                eXide.util.success("Configuration applied.");
                            }
                        },
                        error: function(xhr, status) {
                            eXide.util.error("Failed to apply configuration: " + xhr.responseText);
                        }
                    });
            });
        }
    };
    
    Constr.prototype.selectElement = function(doc) {
        var tags = this.findStartEndTags(doc, false);
        if (!tags.start) {
            return;
        }
        // expand end tag
        var iterator = new TokenIterator(doc.getSession(), tags.end.row, tags.end.column);
        var token = iterator.stepForward();
        while(token) {
            if (token.value === ">") {
                tags.end.row = iterator.getCurrentTokenRow();
                tags.end.column = iterator.getCurrentTokenColumn() + 1;
                break;
            }
            token = iterator.stepForward();
        }
        // expand start tag
        iterator = new TokenIterator(doc.getSession(), tags.start.row, tags.start.column);
        token = iterator.getCurrentToken();
        while(token) {
            if (token.value === "<") {
                tags.start.row = iterator.getCurrentTokenRow();
                tags.start.column = iterator.getCurrentTokenColumn();
                break;
            }
            token = iterator.stepBackward();
        }
        
        var sel = this.editor.getSelection();
        var range = new Range(tags.start.row, tags.start.column, tags.end.row, tags.end.column);
        sel.setSelectionRange(range);
    };
    
    Constr.prototype.rename = function(doc) {
        var tags = this.findStartEndTags(doc, true);
        if (!tags.start) {
            return;
        }
        
        var sel = this.editor.getSelection();
        var range = new Range(tags.start.row, tags.start.column, tags.start.row, tags.start.column + tags.start.name.length);
        range.cursor = range.end;
        sel.setSelectionRange(range);
        sel.toOrientedRange();
        if (tags.end) {
            range = new Range(tags.end.row, tags.end.column, tags.end.row, tags.end.column + tags.end.name.length);
            range.cursor = range.end;
            sel.addRange(range);
        }
        this.editor.focus();
    };
    
    Constr.prototype.deleteTags = function(doc) {
        var tags = this.findStartEndTags(doc, false);
        if (!tags.start) {
            return;
        }
        
        var range = this.selectTag(doc, tags.end);
        doc.getSession().remove(range);
        
        range = this.selectTag(doc, tags.start);
        doc.getSession().remove(range);
    };
    
    Constr.prototype.findStartEndTags = function(doc) {
        function matches(iterator, position) {
            var column = iterator.getCurrentTokenColumn();
            return (iterator.getCurrentTokenRow() == position.row && position.column >= column &&
                position.column <= column + iterator.getCurrentToken().value.length);
        }
        
        var sel   = this.editor.getSelection();
        var selRange = sel.getRange();
        var position = selRange.start;
        
        var iterator = new TokenIterator(doc.getSession(), 0, 0);
        var stack = [];
        var inClosingTag = false;
        var token = iterator.stepForward();
        var startTag, endTag;
        while(token) {
            if (/^(meta.tag.name|.*.tag-name.xml)/.test(token.type)) {
                if (!inClosingTag) {
                    var tag = {
                        name: token.value,
                        length: token.value.length,
                        row: iterator.getCurrentTokenRow(),
                        column: iterator.getCurrentTokenColumn(),
                        stack: stack.length
                    };
                    stack.push(tag);
                    if (matches(iterator, position)) {
                        startTag = tag;
                    }
                } else {
                    var last = stack.pop();
                    if (startTag == last || (startTag && startTag.stack == stack.length) || matches(iterator, position)) {
                        startTag = last;
                        endTag = {
                            name: token.value,
                            row: iterator.getCurrentTokenRow(),
                            column: iterator.getCurrentTokenColumn()
                        };
                        break;
                    }
                }
                inClosingTag = false;
            } else if (token.value === "</") {
                inClosingTag = true;
            } else if (token.value === "/>") {
                stack.pop();
            } else if (matches(iterator, position)) {
                startTag = stack[stack.length - 1];
            }
            token = iterator.stepForward();
        }
        return {
            start: startTag,
            end: endTag
        };
    };
    
    Constr.prototype.selectTag = function(doc, tag) {
        var range = new Range(tag.row, tag.column, tag.row, tag.column);
        // expand end
        var iterator = new TokenIterator(doc.getSession(), tag.row, tag.column);
        var token = iterator.stepForward();
        while(token) {
            if (token.value === ">") {
                range.end.row = iterator.getCurrentTokenRow();
                range.end.column = iterator.getCurrentTokenColumn() + 1;
                break;
            }
            token = iterator.stepForward();
        }
        // expand start
        iterator = new TokenIterator(doc.getSession(), tag.row, tag.column);
        token = iterator.getCurrentToken();
        while(token) {
            if (token.value === "<" || token.value === "</") {
                range.start.row = iterator.getCurrentTokenRow();
                range.start.column = iterator.getCurrentTokenColumn();
                break;
            }
            token = iterator.stepBackward();
        }
        return range;
    };
    
	return Constr;
}());
