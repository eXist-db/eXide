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
        console.log("init " + this.existURL + this.doc.getPath() + " times " + this.count);
        this.runCommand({action: "init"})
    };

    Constr.prototype.stepOver = function() {
        this.runCommand({action: "step"});
    };

    Constr.prototype.stepInto = function() {
        this.runCommand({action: "step-into"});
    };

	Constr.prototype.runCommand = function(params){
		var $this = this;
        params.session = this.session;
        params.resource = this.existURL + this.doc.getPath();
        var formData = new URLSearchParams(params);
        fetch("modules/debuger.xq", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
        })
        .then(function(response) { return response.json(); })
        .then(function(data) {
            console.log("response: %o", data);
            $this.session = data.session;
            var line = data.stack[0].lineno;
            editorUtils.gotoLine($this.editor, line);
            if (data.context && data.context.properties) {
                var tbody = document.querySelector("div#debuger.content tbody#variables");
                data.context.properties.forEach(function(property) {
                    var tr = $this.getVariable(property);
                    if (tbody) tbody.appendChild(tr);
                });
            }
            eXide.util.message("Good response. Session: " + $this.session);
        })
        .catch(function(err) {
            eXide.util.error(String(err), "Server Error");
        });
	}

    Constr.prototype.getVariable = function(property) {
        var tr = document.createElement("tr");
        var tdName = document.createElement("td");
        tdName.className = "name";
        tdName.textContent = property.name;
        tr.appendChild(tdName);
        var tdType = document.createElement("td");
        tdType.className = "type";
        tdType.textContent = property.type;
        tr.appendChild(tdType);
        var tdValue = document.createElement("td");
        tdValue.className = "value";
        if (property.type === "node") {
            var div = document.createElement("div");
            div.id = "valueHighLight";
            div.innerHTML = property.value;
            tdValue.appendChild(div);
        } else {
            tdValue.textContent = property.value;
        }
        tr.appendChild(tdValue);
        return tr;
    }
	
	return Constr;
}());