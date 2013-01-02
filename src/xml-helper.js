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
	
	Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
		
		this.addCommand("closeTag", this.closeTag);
        this.addCommand("suggest", this.suggest);
	}
	
	eXide.util.oop.inherit(Constr, eXide.edit.ModeHelper);
	
	Constr.prototype.closeTag = function (doc, text, row) {
		var basePath = "xmldb:exist://" + doc.getBasePath();
		var $this = this;
		$.ajax({
			type: "POST",
			url: "modules/validate-xml.xql",
			data: { xml: text, validate: "no" },
			dataType: "json",
			success: function (data) {
				if (data.status && data.status == "invalid") {
					var line = parseInt(data.message.line) - 1;
                    $.log("Message: %s", line);
					if (line <= row) {
						var tag = /element type \"([^\"]+)\"/.exec(data.message["#text"]);
						if (tag.length > 0) {
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
			type: "POST",
			url: "modules/validate-xml.xql",
			data: { xml: code },
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
	}
    
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
                "apply it to collection " + collection + " now?", function() {
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
    }
    
	return Constr;
}());
