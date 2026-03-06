/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2013 Wolfgang Meier
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
window.eXide = window.eXide || {};

/**
 * Namespace function. Required by all other classes.
 */
eXide.namespace = function (ns_string) {
	var parts = ns_string.split('.'),
		parent = eXide,
		i;
	if (parts[0] == "eXide") {
		parts = parts.slice(1);
	}
	
	for (i = 0; i < parts.length; i++) {
		// create a property if it doesn't exist
		if (typeof parent[parts[i]] == "undefined") {
			parent[parts[i]] = {};
		}
		parent = parent[parts[i]];
	}
	return parent;
}

eXide.namespace("eXide.util");

/**
 * Static utility methods.
 */
eXide.util = (function () {

	var toastContainer = null;

	function getToastContainer() {
		if (!toastContainer) {
			toastContainer = document.createElement("div");
			toastContainer.className = "eXide-toast-container";
			document.body.appendChild(toastContainer);
		}
		return toastContainer;
	}

	function showToast(message, type, title) {
		var container = getToastContainer();
		var el = document.createElement("div");
		el.className = "eXide-toast eXide-toast-" + (type || "info");
		if (title) {
			var titleEl = document.createElement("strong");
			titleEl.textContent = title;
			el.appendChild(titleEl);
			el.appendChild(document.createElement("br"));
		}
		el.appendChild(document.createTextNode(message));
		var closer = document.createElement("span");
		closer.className = "eXide-toast-close";
		closer.textContent = "\u00d7";
		closer.addEventListener("click", function() { removeToast(el); });
		el.appendChild(closer);
		container.insertBefore(el, container.firstChild);
		// trigger reflow then animate in
		el.offsetHeight;
		el.classList.add("eXide-toast-show");
		setTimeout(function() { removeToast(el); }, 5000);
	}

	function removeToast(el) {
		if (!el.parentNode) return;
		el.classList.remove("eXide-toast-show");
		el.addEventListener("transitionend", function() {
			if (el.parentNode) el.parentNode.removeChild(el);
		});
	}

	return {

		/**
		 * Check if browser supports HTML5 local storage
		 */
		supportsHtml5Storage: function () {
			try {
				return 'localStorage' in window && window['localStorage'] !== null;
			} catch (e) {
				return false;
			}
		},

		supportsFullScreen: function() {
			return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
		},

		requestFullScreen: function(el) {
			if (document.fullscreenElement || document.webkitFullscreenElement) {
				(document.exitFullscreen || document.webkitExitFullscreen).call(document);
			} else {
				(el.requestFullscreen || el.webkitRequestFullscreen).call(el);
			}
		},

		/**
		 * Normalize a collection path. Remove xmldb: part, resolve ..
		 */
		normalizePath: function (path) {
            if (!path)
                return path;
            path = path.replace(/^xmldb:exist:\/\//, "");
            var newComponents = [],
                components = path.split("/"),
                length = components.length;
            for (var i = 0 ; i < length; i++) {
                if (components[i] == ".." ) {
                    //i--;
                    newComponents.pop();
                } else {
                    newComponents.push(components[i]);
                }
            }
            return newComponents.join('/');
		},

		/**
		 * Parse a function signature and transform it into function call.
		 * Removes type declarations.
		 */
		parseSignature: function (signature) {
			var p = signature.indexOf("(");
			if (p > -1) {
				var parsed = signature.substring(0, p + 1);
				signature = signature.substring(p);
				var vars = signature.match(/\$[^\s,\)]+/g);
				if (vars) {
					for (var i = 0; i < vars.length; i++) {
						if (i > 0)
							parsed += ", ";
						parsed += "${" + (i + 1) + ":\\$" + vars[i].substring(1) + "}";
					}
				}
				parsed += ")";
				return parsed;
			}
			return signature;
		},

		message: function(message) {
			showToast(message, "info");
		},

		success: function(message) {
			showToast(message, "success");
		},

		error: function(message, title) {
			showToast(message, "error", title);
		}
	};

}());

eXide.namespace("eXide.util.Dialog");

/**
 * Singleton object: message, confirm and error dialogs.
 * 
 * @param name
 * @param path
 * @param mimeType
 */
eXide.util.Dialog = (function () {

	var msgDlg = null;
	var inputDlg = null;
	var callback = null;

	function ensureMessageDialog() {
		if (msgDlg) return;
		var el = document.createElement("div");
		el.id = "eXide-dialog-message";
		el.innerHTML = '<span id="eXide-dialog-message-icon" class="fa fa-4x fa-info-circle"></span>' +
			'<div id="eXide-dialog-message-body"></div>';
		document.body.appendChild(el);
		msgDlg = eXide.util.DialogManager.create(el, {
			modal: true,
			appendTo: "#layout-container",
			buttons: { "OK": function() { this.close(); } }
		});
	}

	function ensureInputDialog() {
		if (inputDlg) return;
		var el = document.createElement("div");
		el.id = "eXide-dialog-input";
		el.innerHTML = '<span class="fa fa-4x fa-info-circle"></span>' +
			'<div id="eXide-dialog-input-body"></div>';
		document.body.appendChild(el);
		inputDlg = eXide.util.DialogManager.create(el, {
			modal: true,
			buttons: {
				"OK": function() {
					this.close();
					if (callback != null) {
						callback.call(null);
					}
				},
				"Cancel": function() { this.close(); }
			}
		});
	}

	return {

		message: function (title, msg) {
			ensureMessageDialog();
			msgDlg.setTitle(title);
			document.getElementById("eXide-dialog-message-body").innerHTML = msg || "";
			var icon = document.getElementById("eXide-dialog-message-icon");
			if (icon) {
				icon.className = "fa fa-4x fa-info-circle";
			}
			msgDlg.open();
		},

		warning: function (title, msg) {
			ensureMessageDialog();
			msgDlg.setTitle(title);
			document.getElementById("eXide-dialog-message-body").innerHTML = msg || "";
			var icon = document.getElementById("eXide-dialog-message-icon");
			if (icon) {
				icon.className = "fa fa-4x fa-exclamation-triangle";
			}
			msgDlg.open();
		},

		input: function (title, msg, okCallback) {
			ensureInputDialog();
			callback = okCallback;
			inputDlg.setTitle(title);
			document.getElementById("eXide-dialog-input-body").innerHTML = msg || "";
			inputDlg.open();
		}
	};
}());

eXide.namespace("eXide.util.mimeTypes");

/**
 * Singleton object: maintains a mapping of mime-types
 * to languages for sytnax highlighting.
 * 
 * @param name
 * @param path
 * @param mimeType
 */
eXide.util.mimeTypes = (function () {
	
    var TYPES = {
        'xml': ['text/xml', 'application/xml', 'application/xhtml+xml', 'application/atom+xml', 'application/xslt+xml'],
        'xquery': ['application/xquery'],
        'css': ['text/css'],
        'html': ['text/html'],
        'javascript': ['application/javascript'],
        'text': ['text/text'],
        'less': ['application/less'],
        'tmsnippet': ['application/tmsnippet'],
        'json': ['application/json'],
        'markdown': ['text/markdown']
    };

    return {
    
    	getMime: function (mimeType) {
	    	var p = mimeType.indexOf(";");
	    	if (p > -1)
	    		mimeType = mimeType.substring(0, p);
	    	return mimeType;
	    },
    
	    getLangFromMime: function(mimeType) {
	        for (var lang in TYPES) {
	            var syn = TYPES[lang];
	            for (var i = 0; i < syn.length; i++) {
	                if (mimeType == syn[i])
	                    return lang;
	            }
	        }
	        return 'xquery';
	    },

	    getMimeFromLang: function (lang) {
	        var types = TYPES[lang];
	        if (types)
	            return types[0];
	        else
	            return 'application/xquery';
	    }
    }
}());

eXide.namespace("eXide.util.oop");

/**
 * Static utility method for class inheritance.
 * 
 * @param name
 * @param path
 * @param mimeType
 */
eXide.util.oop.inherit = (function() {
	
	var F = function() {};
	return function(C, P) {
		F.prototype = P.prototype;
		C.prototype = new F();
		C.super_ = P.prototype;
		C.prototype.constructor = C;
	}
}());

eXide.util.oop.extend = (function() {
  return function(destination, source) {
      for (var k in source) {
        if (source.hasOwnProperty(k)) {
          destination[k] = source[k];
        }
      }
  }
}());

