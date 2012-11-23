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
    
	Constr = function(doc_) {
		this.doc = doc_;
        this.count = 0;
        this.session = "";
        this.existURL = "xmldb:exist://" + document.location.hostname + ":" + document.location.port;
//		this.editor = this.parent.editor;
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

    Constr.prototype.stepInto = function() {
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
			dataType: "xml",
			success: function (data) {
                var root = data.documentElement;
                if (root.nodeName == "dbgr"){
                    $this.session = $(root).attr("session");
                    $('div#debuger.content tbody#variables tr').remove();
                    getVariables($(data)).forEach(function(line){
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

    function getVariables(data){
        var res = [];
        data.find('response[command=context_get]')
            .children('property').each(function(){
                var tmpl = $('<tr>' +
                    '<td class="name"></td>' +
                    '<td class="type"></td>' +
                    '<td class="value"></td>' +
                '</tr>');
                tmpl.children(".name").append($(this).attr('name'));
                tmpl.children(".type").append($(this).attr('type'));
                if ($(this).attr('type') === "node"){
                    tmpl.children(".value").append($('<div id="valueHighLight">' + $(this).text() + '</div>'));
                    //TODOneed to be prettify
                } else
                    tmpl.children(".value").append($(this).text());
                res.push(tmpl);
            });
        return res;
    }

    function getStack(data){
        var $data = data.children("response[command=stack_get]");

    }
	
	return Constr;
}());