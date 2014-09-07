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
var eXide = eXide || {};

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

	var stack_bottomright = {"dir1": "up", "dir2": "left", "firstpos1": 15, "firstpos2": 15};
	
    var selection = null;
    
    $(document).ready(function() {
    	$.pnotify.defaults.history = false;
        $.pnotify.defaults.styling = "jqueryui";
    });
    
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
			if (document["cancelFullScreen"] || document["webkitCancelFullScreen"] || document["mozCancelFullScreen"]) {
				return true;
			}
			return false;
		},

		requestFullScreen: function(el) {
			var state = document["fullScreen"] || document["webkitIsFullScreen"] || document["mozFullScreen"];
			if (state) {
				var func = document["cancelFullScreen"] || document["webkitCancelFullScreen"] || document["mozCancelFullScreen"];
				func.call(document);
			} else {
				var func = (el["requestFullScreen"])
	            || (el["webkitRequestFullScreen"])
	            || (el["mozRequestFullScreen"]);
	            if (func) {
	            	func.call(el, true);
	            }
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
		
		/**
		 * Display a message using pnotify.
		 */
		message: function(message) {
			$.pnotify({
				text: message,
				shadow: true,
				hide: true,
				closer: true,
				opacity: .65,
				addclass: "stack-bottomright custom",
				stack: stack_bottomright
			});
		},
		
        success: function(message) {
    		$.pnotify({
				text: message,
				shadow: true,
                type: "success",
				hide: true,
				closer: true,
				opacity: .65,
				addclass: "stack-bottomright custom",
				stack: stack_bottomright
			});
		},
        
		error: function(message, title) {
			var opts = {
				text: message,
				type: 'error',
				shadow: true,
				hide: true,
				addclass: "stack-bottomright custom",
				stack: stack_bottomright
			};
			if (title) {
				opts.title = title;
			}
			$.pnotify(opts);
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
	
	var messageDialog;
	var warnIcon = "resources/images/error.png";
	var infoIcon = "resources/images/information.png";
	
	var callback = null;
	
	$(document).ready(function() {
		$(document.body).append(
				"<div id=\"eXide-dialog-message\">" +
				"	<span id=\"eXide-dialog-message-icon\" class=\"fa fa-4x fa-info-circle\"></span>" +
				"	<div id=\"eXide-dialog-message-body\"></div>" +
				"</div>"
		);
		messageDialog = $("#eXide-dialog-message");
		
		messageDialog.dialog({
			appendTo: "#layout-container",
			modal: true,
			autoOpen: false,
			buttons: {
				"OK": function () { $(this).dialog("close"); }
			}
		});
		
		$(document.body).append(
				"<div id=\"eXide-dialog-input\">" +
				"	<span id=\"eXide-dialog-message-icon\" class=\"fa fa-4x fa-info-circle\"></span>" +
				"	<div id=\"eXide-dialog-input-body\"></div>" +
				"</div>"
		);
		inputDialog = $("#eXide-dialog-input");
		
		inputDialog.dialog({
			modal: true,
			autoOpen: false,
			buttons: {
				"OK": function () { 
					$(this).dialog("close");
					if (callback != null) {
						callback.apply($("eXide-dialog-input-body"), []);
					}
				},
				"Cancel": function () {
					$(this).dialog("close"); 
				}
			}
		});
	});
	
	return {
		
		message: function (title, msg) {
		    if (msg == null) {
			msg = "";
		    }
			messageDialog.dialog("option", "title", title);
			$("#eXide-dialog-message-body").html(msg);
			$("#eXide-dialog-message-icon").attr("src", infoIcon);
			messageDialog.dialog("open");
		},
		
		warning: function (title, msg) {
		    if (msg == null) {
		    	msg = "";
		    }
			messageDialog.dialog("option", "title", title);
			$("#eXide-dialog-message-body").html(msg);
			$("#eXide-dialog-message-icon").attr("src", warnIcon);
			messageDialog.dialog("open");
		},
		
		input: function (title, msg, okCallback) {
			callback = okCallback;
			inputDialog.dialog("option", "title", title);
			$("#eXide-dialog-input-body").html(msg);
			inputDialog.dialog("open");
		}
	}
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
        'xml': ['text/xml', 'application/xml', 'application/xhtml+xml', 'application/atom+xml'],
        'xquery': ['application/xquery'],
        'css': ['text/css'],
        'html': ['text/html'],
        'javascript': ['application/x-javascript'],
        'text': ['text/text'],
        'less': ['application/less'],
        'tmsnippet': ['application/tmsnippet'],
        'json': ['application/json'],
        'markdown': ['text/x-markdown']
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

/* Debug and logging functions */
(function($) {
    $.log = function() {
//    	if (typeof console == "undefined" || typeof console.log == "undefined") {
//    		console.log( Array.prototype.slice.call(arguments) );
        if(window.console && window.console.log) {
//            console.log.apply(window.console,arguments)
            
            var log = Function.prototype.bind.call(console.log, console);
            log.apply(console, arguments);
        }
    };
    $.fn.log = function() {
        $.log(this);
        return this;
    }
})(jQuery);
