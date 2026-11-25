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

import { namespace } from "./namespace.js";

/**
 * Interface for sending events, registering listeners.
 */
export class Sender {
    addEventListener(name, obj, callback) {
        if (typeof obj === "function") {
            callback = obj;
            obj = null;
        }
        this.events = this.events || {};
		let event = this.events[name];
        if (!event) {
            event = new Array();
            this.events[name] = event;
        }
		event.push({
			obj,
			callback
		});
	}

    $triggerEvent(name, args) {
        this.events = this.events || {};
		const event = this.events[name];
		if (event) {
			for (let i = 0; i < event.length; i++) {
				event[i].callback.apply(event[i].obj, args);
			}
		}
	}

    removeEventListener(name, obj, callback) {
	if (typeof obj === "function") {
            callback = obj;
            obj = null;
        }
	const events = this.events || {};
	const event = events[name];
	if (event) {
		let i = 0;
		for (; i < event.length; i++) {
			if(event[i].obj===obj && event[i].callback===callback) break;
		}
		if(i<event.length) this.events[name].splice(i,1);
	}
}
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.events").Sender = Sender;
