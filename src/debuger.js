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
eXide.namespace("eXide.edit.XQueryDebuger");

/**
 * XQuery specific debuger methods.
 */
eXide.XQueryDebuger = (function () {
    
	Constr = function(editor_, doc_) {
		this.doc = doc_;
        this.count = 0;
        this.session = "";
        this.existURL = "xmldb:exist://" + document.location.hostname + ":" + document.location.port;
		this.editor = editor_;
        // pre-compile regexp needed by this class
		
	}

    Constr.prototype.init = function() {
        this.count++;
        $.log("init " + this.existURL + this.doc.getPath() + " times " + this.count);
        this.runCommand({action: "init"})
    };

    Constr.prototype.stepOver = function() {
        this.runCommand({action: "step"});
    };

    Constr.prototype.stepInto = function() {
        this.runCommand({action: "step-into"});
    };

    Constr.prototype.stepOut = function() {
        this.runCommand({action: "step-out"});
    };
	
	Constr.prototype.runCommand = function(params){
		var $this = this;
        params.session = this.session;
        params.resource = this.existURL + this.doc.getPath();
		$.ajax({
			type: "POST",
			url: "modules/debuger.xql",
			data: params,
			dataType: "json",
			success: function (data) {
                $.log("response: %o", data);
                $this.session = data.session;
                var line = data.stack[0].lineno;
                $this.editor.gotoLine(line);
                if (data.context && data.context.properties) {
                    $.each(data.context.properties, function(i, property) {
                        var line = $this.getVariable(property);
                        $(line).appendTo($('div#debuger.content tbody#variables'));
                    });
                }
                eXide.util.message("Good response. Session: " + $this.session);
			},
			error: function (xhr, status) {
                eXide.util.error(xhr.responseText, "Server Error in session " + status);
			}
		});
	}

    Constr.prototype.getVariable = function(property) {
        var tmpl = $('<tr>' +
            '<td class="name"></td>' +
            '<td class="type"></td>' +
            '<td class="value"></td>' +
        '</tr>');
        tmpl.children(".name").append(property.name);
        tmpl.children(".type").append(property.type);
        if (property.type === "node"){
            tmpl.children(".value").append($('<div id="valueHighLight">' + property.value + '</div>'));
            //TODOneed to be prettify
        } else
            tmpl.children(".value").append(property.value);
        return tmpl;
    }

    function getStack(data){
        var $data = data.children("response[command=stack_get]");

    }
	
	return Constr;
}());