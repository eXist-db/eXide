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

eXide.namespace("eXide.events.Sender");

/**
 * Interface for sending events, registering listeners.
 */
eXide.events.Sender = (function() {

    Constr = function() {
    };
    
    Constr.prototype = {
        
        addEventListener: function (name, obj, callback) {
            if (typeof obj == "function") {
                callback = obj;
                obj = null;
            }
            this.events = this.events || {};
    		var event = this.events[name];
            if (!event) {
                event = new Array();
                this.events[name] = event;
            }
			event.push({
				obj: obj,
				callback: callback
			});
		},
        
		$triggerEvent: function (name, args) {
            this.events = this.events || {};
			var event = this.events[name];
			if (event) {
				for (var i = 0; i < event.length; i++) {
					event[i].callback.apply(event[i].obj, args);
				}
			}
		},
	removeEventListener:function(name, obj, callback){
		if (typeof obj == "function") {
	            callback = obj;
	            obj = null;
	        }
		var events = this.events || {};
		var event = events[name];
		if (event) {
			var i = 0;
			for (; i < event.length; i++) {
				if(event[i].obj===obj && event[i].callback===callback) break;
			}
			if(i<event.length) this.events[name].splice(i,1);
		}
	}
    };
    
    return Constr;
}());
