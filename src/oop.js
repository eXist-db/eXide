/*
 *  eXide - web-based XQuery IDE
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
 * Static utility method for class inheritance.
 */
export const oop = (function() {
	const F = function() {};
	return {
		inherit: function(C, P) {
			F.prototype = P.prototype;
			C.prototype = new F();
			C.super_ = P.prototype;
			C.prototype.constructor = C;
		}
	};
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.util").oop = oop;
