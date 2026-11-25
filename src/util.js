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

import { eXide, namespace } from "./namespace.js";
import { DialogManager } from "./dialog-utils.js";

/**
 * Static utility methods.
 */
export const util = (function () {

	let toastContainer = null;

	function getToastContainer() {
		if (!toastContainer) {
			toastContainer = document.createElement("div");
			toastContainer.className = "eXide-toast-container";
			document.body.appendChild(toastContainer);
		}
		return toastContainer;
	}

	function showToast(message, type, title) {
		const container = getToastContainer();
		const el = document.createElement("div");
		el.className = `eXide-toast eXide-toast-${type || "info"}`;
		if (title) {
			const titleEl = document.createElement("strong");
			titleEl.textContent = title;
			el.appendChild(titleEl);
			el.appendChild(document.createElement("br"));
		}
		el.appendChild(document.createTextNode(message));
		const closer = document.createElement("span");
		closer.className = "eXide-toast-close";
		closer.textContent = "\u00d7";
		closer.addEventListener("click", () => { removeToast(el); });
		el.appendChild(closer);
		container.insertBefore(el, container.firstChild);
		// trigger reflow then animate in
		el.offsetHeight;
		el.classList.add("eXide-toast-show");
		setTimeout(() => { removeToast(el); }, 5000);
	}

	function removeToast(el) {
		if (!el.parentNode) return;
		el.classList.remove("eXide-toast-show");
		el.addEventListener("transitionend", () => {
			if (el.parentNode) el.parentNode.removeChild(el);
		});
	}

	return {

		/**
		 * Check if browser supports HTML5 local storage
		 */
		supportsHtml5Storage () {
			try {
				return 'localStorage' in window && window['localStorage'] !== null;
			} catch {
				return false;
			}
		},

		supportsFullScreen() {
			return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
		},

		requestFullScreen(el) {
			if (document.fullscreenElement || document.webkitFullscreenElement) {
				(document.exitFullscreen || document.webkitExitFullscreen).call(document);
			} else {
				(el.requestFullscreen || el.webkitRequestFullscreen).call(el);
			}
		},

		/**
		 * Normalize a collection path. Remove xmldb: part, resolve ..
		 */
		normalizePath (path) {
            if (!path)
                return path;
            path = path.replace(/^xmldb:exist:\/\//, "");
            const newComponents = [],
                components = path.split("/"),
                length = components.length;
            for (let i = 0 ; i < length; i++) {
                if (components[i] === ".." ) {
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
		parseSignature (signature) {
			const p = signature.indexOf("(");
			if (p > -1) {
				let parsed = signature.substring(0, p + 1);
				signature = signature.substring(p);
				const vars = signature.match(/\$[^\s,)]+/g);
				if (vars) {
					for (let i = 0; i < vars.length; i++) {
						if (i > 0)
							parsed += ", ";
						parsed += `\${${i + 1}:$${vars[i].substring(1)}}`;
					}
				}
				parsed += ")";
				return parsed;
			}
			return signature;
		},

		message(message) {
			showToast(message, "info");
		},

		success(message) {
			showToast(message, "success");
		},

		error(message, title) {
			showToast(message, "error", title);
		}
	};

}());

/**
 * Singleton object: message, confirm and error dialogs.
 * 
 * @param name
 * @param path
 * @param mimeType
 */
export const Dialog = (function () {

	let msgDlg = null;
	let inputDlg = null;
	let callback = null;

	function ensureMessageDialog() {
		if (msgDlg) return;
		const el = document.createElement("div");
		el.id = "eXide-dialog-message";
		el.innerHTML = '<span id="eXide-dialog-message-icon" class="fa fa-4x fa-info-circle"></span>' +
			'<div id="eXide-dialog-message-body"></div>';
		document.body.appendChild(el);
		msgDlg = DialogManager.create(el, {
			modal: true,
			width: 420,
			appendTo: "#layout-container",
			buttons: { "OK"() { this.close(); } }
		});
	}

	function ensureInputDialog() {
		if (inputDlg) return;
		const el = document.createElement("div");
		el.id = "eXide-dialog-input";
		el.innerHTML = '<span class="fa fa-4x fa-info-circle"></span>' +
			'<div id="eXide-dialog-input-body"></div>';
		document.body.appendChild(el);
		inputDlg = DialogManager.create(el, {
			modal: true,
			width: 420
		});
	}

	return {

		message (title, msg) {
			ensureMessageDialog();
			msgDlg.setTitle(title);
			document.getElementById("eXide-dialog-message-body").innerHTML = msg || "";
			const icon = document.getElementById("eXide-dialog-message-icon");
			if (icon) {
				icon.className = "fa fa-4x fa-info-circle";
			}
			msgDlg.open();
		},

		warning (title, msg) {
			ensureMessageDialog();
			msgDlg.setTitle(title);
			document.getElementById("eXide-dialog-message-body").innerHTML = msg || "";
			const icon = document.getElementById("eXide-dialog-message-icon");
			if (icon) {
				icon.className = "fa fa-4x fa-exclamation-triangle";
			}
			msgDlg.open();
		},

		/**
		 * Ask the user to confirm an action (or to enter a value, when msg holds an input).
		 *
		 * @param options.action label of the confirming button -- name the action
		 *   ("Delete", "Reload"), avoid a generic "OK". Defaults to "OK".
		 * @param options.destructive style the action as destructive; Cancel then
		 *   keeps the focus, so Enter does not delete by accident.
		 */
		input (title, msg, okCallback, options) {
			options = options || {};
			ensureInputDialog();
			callback = okCallback;
			const buttons = {
				"Cancel"() { this.close(); }
			};
			buttons[options.action || "OK"] = {
				destructive: !!options.destructive,
				click() {
					this.close();
					if (callback != null) {
						callback.call(null);
					}
				}
			};
			inputDlg.setButtons(buttons);
			inputDlg.setTitle(title);
			document.getElementById("eXide-dialog-input-body").innerHTML = msg || "";
			inputDlg.open();
			const firstInput = document.querySelector("#eXide-dialog-input-body input");
			if (firstInput) {
				firstInput.focus();
				firstInput.addEventListener("keyup", function handler(e) {
					if (e.key === "Enter") {
						firstInput.removeEventListener("keyup", handler);
						inputDlg.close();
						if (callback != null) callback.call(null);
					}
				});
			}
		}
	};
}());

/**
 * Singleton object: maintains a mapping of mime-types
 * to languages for sytnax highlighting.
 * 
 * @param name
 * @param path
 * @param mimeType
 */
export const mimeTypes = (function () {
	
    const TYPES = {
        'xml': [/^text\/xml$/, /^application\/.*\+xml$/, /^application\/xml$/],
        'xquery': [/^application\/xquery$/],
        'css': [/^text\/css$/],
        'html': [/^text\/html$/],
        'javascript': [/^application\/x?-?javascript$/, /^text\/javascript$/],
        'text': [/^text\/text$/],
        'less': [/^application\/less$/],
        'tmsnippet': [/^application\/tmsnippet$/],
        'json': [/^application\/json$/],
        'markdown': [/^text\/markdown$/]
    };

    return {
    
    	getMime (mimeType) {
	    	const p = mimeType.indexOf(";");
	    	if (p > -1)
	    		mimeType = mimeType.substring(0, p);
	    	return mimeType;
	    },
    
		getLangFromMime (mimeType) {
	        for (const lang in TYPES) {
				const info = TYPES[lang];
				for (let i = 0; i < info.length; i++) {
					if (info[i].test(mimeType))
	                    return lang;
	            }
	        }
			// default to xquery
	        return 'xquery';
	    }
    }
}());

// Register on the global `eXide` object (see namespace.js)
eXide.util = Object.assign(util, eXide.util);
namespace("eXide.util").Dialog = Dialog;
namespace("eXide.util").mimeTypes = mimeTypes;
