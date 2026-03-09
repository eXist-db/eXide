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

eXide.namespace("eXide.edit.Directory");

/**
 * XQuery directory view - Sublime style
 *
 */
eXide.edit.Directory = (function () {

	Constr = function() {
		this.currentDoc = null;
        this.__activated = false;

		init();
		initContextMenu();
		initDragDrop();

		var filterEl = document.getElementById("directory-filter");
		if (filterEl) {
			filterEl.addEventListener("keyup", function() {
				var regex = new RegExp(this.value, "i");
				var items = document.querySelectorAll("#directory li");
				for (var i = 0; i < items.length; i++) {
					var li = items[i];
					if (li.id === "tree-root") continue;
					var span = li.querySelector("span");
					if (span) {
						li.style.display = regex.test(span.textContent) ? "" : "none";
					}
				}
			});
		}
	};

	function fileIcon(d) {
		var mime = d.mime || "";
		if (mime) {
			if (mime === "application/pdf") return "fa-file-pdf-o";
			if (/^image\//.test(mime)) return "fa-file-image-o";
			if (/xml|html/.test(mime)) return "fa-file-code-o";
			if (/^text\/|javascript|json|css/.test(mime)) return "fa-file-text-o";
			if (/zip|compress|archive|xar|jar/.test(mime)) return "fa-file-archive-o";
		}
		// Fallback to extension
		var name = d.name || "";
		if (/\.(xml|xq|xquery|xql|xqm|xconf|xhtml|html|htm|svg|xsl|xslt|odd|rng|sch|wsdl)$/i.test(name)) return "fa-file-code-o";
		if (/\.(css|less|scss|js|json|md|txt|csv|properties)$/i.test(name)) return "fa-file-text-o";
		if (/\.(png|jpe?g|gif|ico|webp|bmp|tiff?)$/i.test(name)) return "fa-file-image-o";
		if (/\.pdf$/i.test(name)) return "fa-file-pdf-o";
		if (/\.(zip|tar|gz|xar|jar|war|ear)$/i.test(name)) return "fa-file-archive-o";
		return "fa-file-o";
	}

	function setClass(d) {
		if (d.isCollection) return 'fa fa-folder' + (d.isOpen ? "-open" : "");
		return 'fa ' + fileIcon(d);
	}

	function build(data) {
		var sel = this instanceof d3.selection ? this : d3.select(this),
			editor = eXide.app.getEditor();
		if(sel.empty()) {return}
		var fn = function(d) {
			sel.selectAll('ul, span, i').remove()

			var li = sel.datum(d)
						.attr('class', function(d) {return (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : "")})
						.attr("data-key", function(d){return d.key})
						.style('cursor','pointer')
						.on('click', click)
						.on('dblclick', dblClick)
						.on('contextmenu', onContextMenu)

			li
				.append('i')
				.attr('class', setClass)
			li
				.append('span')
				.text(function(d){return d.name})

			if(d.children && d.children.length){
				sel
					.append('ul')
					.selectAll('li')
					.data(d.children)
					.enter()
					.append('li')
					.each(build)
			}

		};

		if(data) {
			var d = data.length ? data[0]: data
			if(!d.isCollection) {
				d.isResourceOpen = !!editor.getDocument(d.key)
			}
			return fn(d)
		}
		d3.json("modules/collections.xq?root=" + encodeURIComponent(sel.datum().key || "/db") + "&view=r", function(error, data){
			if(error)	{
				return
			}
			var d = sel.datum()
			d.isOpen = true;
			d.isLoaded = true;
			d.children = data.items.filter(function(i){return i.name != ".."})
			fn(d)
		} )
	};

	function init() {
		var root = {key:'/db',isCollection: true, isOpen:false, name:'db', isLoaded: false};
		build.call(d3.select("#tree-root"), [root]);
		// Auto-expand the db root
		var rootEl = document.getElementById("tree-root");
		if (rootEl) {
			toggleFolder.call(rootEl, root);
		}
	};

	function toggleFolder(d) {
		d.isOpen = !d.isOpen;
		var sel = d3.select(this)
		sel.select("i.fa").attr('class', setClass)
		if(d.isOpen) {
		   return build.call(this)
		}
		sel.selectAll('ul').remove()
	};


	function loadFolder(d) {
		build.call(this)
	};

	function loadResource(d) {
		eXide.app.$doOpenDocument({name :d.name, path: d.key, writable:d.writable});
	};

	function dblClick(d) {
		d3.event.stopPropagation()
		if(!d.isCollection && d.isResourceOpen) {
			loadResource(d)
			eXide.app.closeDocument()
		}
	};

	function click(d) {
		d3.event.stopPropagation()
		if(d.isCollection) {
			if(!d.isOpen) {eXide.app.syncManager(d.key)}
			if(d.isLoaded) {
				return toggleFolder.call(this,d)
			}

			loadFolder.call(this,d)
		}
		else {
			loadResource(d)
		}
	};

	// ── Context menu ─────────────────────────────────────────────────────

	var ctxMenu = null;
	var ctxNode = null;  // the d3 datum of the right-clicked node
	var ctxEl = null;    // the DOM <li> element of the right-clicked node

	function initContextMenu() {
		ctxMenu = document.getElementById("directory-context-menu");
		if (!ctxMenu) return;

		// Delegate clicks on menu items
		ctxMenu.addEventListener("click", function(e) {
			var item = e.target.closest(".ctx-item");
			if (!item || item.classList.contains("disabled")) return;
			var action = item.dataset.action;
			hideContextMenu();
			if (ctxNode) {
				handleAction(action, ctxNode, ctxEl);
			}
		});

		// Hide on click outside or Escape
		document.addEventListener("click", function() { hideContextMenu(); });
		document.addEventListener("keydown", function(e) {
			if (e.key === "Escape") hideContextMenu();
		});
	}

	function onContextMenu(d) {
		d3.event.preventDefault();
		d3.event.stopPropagation();
		if (!ctxMenu) return;

		ctxNode = d;
		ctxEl = this;

		// Highlight the target node
		document.querySelectorAll(".tree li.ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
		ctxEl.classList.add("ctx-highlight");

		// Enable/disable items based on context
		var isCollection = d.isCollection;
		var isRoot = d.key === "/db";
		ctxMenu.querySelector('[data-action="new-collection"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="new-resource"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="upload"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="rename"]').classList.toggle("disabled", isRoot);
		ctxMenu.querySelector('[data-action="delete"]').classList.toggle("disabled", isRoot);
		ctxMenu.querySelector('[data-action="reload"]').classList.toggle("disabled", !isCollection);
		ctxMenu.querySelector('[data-action="properties"]').classList.toggle("disabled", isRoot);

		// Position the menu
		var x = d3.event.clientX;
		var y = d3.event.clientY;
		ctxMenu.style.left = x + "px";
		ctxMenu.style.top = y + "px";
		ctxMenu.classList.add("visible");

		// Adjust if menu overflows viewport
		var rect = ctxMenu.getBoundingClientRect();
		if (rect.right > window.innerWidth) {
			ctxMenu.style.left = (x - rect.width) + "px";
		}
		if (rect.bottom > window.innerHeight) {
			ctxMenu.style.top = (y - rect.height) + "px";
		}
	}

	function hideContextMenu() {
		if (ctxMenu) ctxMenu.classList.remove("visible");
		document.querySelectorAll(".tree li.ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
	}

	function handleAction(action, d, el) {
		switch (action) {
			case "new-collection": createCollection(d, el); break;
			case "new-resource": createResource(d); break;
			case "upload": uploadToCollection(d, el); break;
			case "download": downloadItem(d); break;
			case "rename": renameItem(d, el); break;
			case "delete": deleteItem(d, el); break;
			case "copy-path": copyPath(d); break;
			case "properties": showProperties(d); break;
			case "reload": reloadNode(d, el); break;
		}
	}

	// ── Helper: fetch JSON from collections.xq ──────────────────────────

	function collectionAction(params) {
		var parts = [];
		Object.keys(params).forEach(function(key) {
			var val = params[key];
			if (Array.isArray(val)) {
				val.forEach(function(v) {
					parts.push(encodeURIComponent(key + "[]") + "=" + encodeURIComponent(v));
				});
			} else {
				parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
			}
		});
		return fetch("modules/collections.xq?" + parts.join("&"))
			.then(function(r) { return r.json(); });
	}

	// ── Actions ──────────────────────────────────────────────────────────

	function createCollection(d, el) {
		if (!eXide.app.$checkLogin()) return;
		eXide.util.Dialog.input("Create Collection",
			'<label for="dir-new-collection">Name: </label>' +
			'<input type="text" name="collection" id="dir-new-collection"/>',
			function() {
				var name = document.getElementById("dir-new-collection").value;
				if (!name) return;
				collectionAction({ create: name, collection: d.key }).then(function(data) {
					if (data.status === "fail") {
						eXide.util.Dialog.warning("Create Collection Error", data.message);
					} else {
						reloadNode(d, el);
						eXide.app.syncManager(d.key);
					}
				});
			}
		);
	}

	function createResource(d) {
		eXide.app.newDocumentFromTemplate();
	}

	function uploadToCollection(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.addEventListener("change", function() {
			var files = Array.from(input.files);
			if (files.length === 0) return;
			uploadFiles(files, d.key).then(function() {
				reloadNode(d, el);
				eXide.app.syncManager(d.key);
			});
		});
		input.click();
	}

	function uploadFiles(files, collection) {
		var promises = files.map(function(file) {
			var formData = new FormData();
			formData.append("file[]", file);
			formData.append("path", file.webkitRelativePath || file.name);
			formData.append("collection", collection);
			return fetch("modules/upload.xq", { method: "POST", body: formData })
				.then(function(r) { return r.json(); });
		});
		return Promise.all(promises);
	}

	function downloadItem(d) {
		eXide.app.download(d.key);
	}

	function renameItem(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var sel = d3.select(el);
		var spanEl = sel.select("span").node();
		if (!spanEl) return;

		var oldName = d.name;
		spanEl.style.display = "none";

		var input = document.createElement("input");
		input.type = "text";
		input.className = "inline-edit";
		input.value = oldName;
		el.appendChild(input);
		input.focus();
		input.select();

		function finish(save) {
			var newName = input.value.trim();
			input.remove();
			spanEl.style.display = "";
			if (save && newName && newName !== oldName) {
				var parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
				collectionAction({ rename: oldName, target: newName, root: parentKey }).then(function(data) {
					if (data.status === "fail") {
						eXide.util.Dialog.warning("Rename Error", data.message);
					} else {
						// Reload the parent
						var parentSel = d3.select("[data-key='" + parentKey + "']");
						if (!parentSel.empty()) {
							build.call(parentSel);
						}
						eXide.app.syncManager(parentKey);
					}
				});
			}
		}

		input.addEventListener("keydown", function(e) {
			if (e.key === "Enter") { e.preventDefault(); finish(true); }
			if (e.key === "Escape") { e.preventDefault(); finish(false); }
		});
		input.addEventListener("blur", function() { finish(true); });
	}

	function deleteItem(d, el) {
		if (!eXide.app.$checkLogin()) return;
		var label = d.isCollection ? "collection" : "resource";
		eXide.util.Dialog.input("Confirm Deletion",
			"Are you sure you want to delete " + label + " <strong>" + d.name + "</strong>?",
			function() {
				collectionAction({ remove: d.key }).then(function(data) {
					if (data.status === "fail") {
						eXide.util.Dialog.warning("Delete Error", data.message);
					} else {
						// Reload the parent collection
						var parentKey = d.key.substring(0, d.key.lastIndexOf("/"));
						var parentSel = d3.select("[data-key='" + parentKey + "']");
						if (!parentSel.empty()) {
							build.call(parentSel);
						}
						eXide.app.syncManager(parentKey);
					}
				});
			}
		);
	}

	function copyPath(d) {
		if (navigator.clipboard) {
			navigator.clipboard.writeText(d.key);
		}
	}

	function showProperties(d) {
		var contentEl = document.getElementById("resource-properties-content");
		if (!contentEl) return;
		var params = new URLSearchParams();
		params.append("properties[]", d.key);
		fetch("modules/collections.xq", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString()
		})
		.then(function(r) { return r.text(); })
		.then(function(html) {
			contentEl.innerHTML = html;
		});

		var dialog = document.getElementById("resource-properties-dialog");
		if (dialog && dialog._eXideDialog) {
			dialog._eXideDialog.open();
		} else if (typeof eXide.util.DialogManager !== "undefined") {
			// Create the dialog if it hasn't been initialized yet
			var dlg = eXide.util.DialogManager.create(dialog, {
				title: "Properties",
				modal: true,
				width: 500,
				buttons: {
					"Apply": function() {
						applyProperties(d, dialog, this);
					},
					"Close": function() { this.close(); }
				}
			});
			dlg.open();
		}
	}

	function applyProperties(d, dialog, dlg) {
		var form = dialog.querySelector("form");
		if (!form) return;
		var formData = new FormData(form);
		var params = new URLSearchParams(formData);
		params.append("modify[]", d.key);
		fetch("modules/collections.xq", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString()
		})
		.then(function(r) { return r.json(); })
		.then(function(data) {
			if (data.status === "fail") {
				eXide.util.Dialog.warning("Properties Error", data.message);
			} else {
				dlg.close();
			}
		});
	}

	function reloadNode(d, el) {
		if (!d.isCollection) return;
		d.isLoaded = false;
		d.isOpen = true;
		build.call(el);
	}

	// ── Drag & drop upload ───────────────────────────────────────────────

	function initDragDrop() {
		var directoryBody = document.getElementById("directory-body");
		if (!directoryBody) return;

		directoryBody.addEventListener("dragover", function(e) {
			e.preventDefault();
			e.stopPropagation();
			var target = findDropTarget(e.target);
			clearDropHighlight();
			if (target) target.classList.add("ctx-highlight");
			e.dataTransfer.dropEffect = "copy";
		});

		directoryBody.addEventListener("dragleave", function(e) {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();
		});

		directoryBody.addEventListener("drop", function(e) {
			e.preventDefault();
			e.stopPropagation();
			clearDropHighlight();

			var target = findDropTarget(e.target);
			if (!target) return;

			var sel = d3.select(target);
			var d = sel.datum();
			if (!d || !d.isCollection) return;

			if (!eXide.app.$checkLogin()) return;

			var files = Array.from(e.dataTransfer.files);
			if (files.length === 0) return;

			uploadFiles(files, d.key).then(function() {
				reloadNode(d, target);
				eXide.app.syncManager(d.key);
			});
		});
	}

	function findDropTarget(el) {
		// Walk up to the nearest collection <li>
		while (el && el.id !== "directory-body") {
			if (el.tagName === "LI" && el.classList.contains("collection")) {
				return el;
			}
			el = el.parentElement;
		}
		return null;
	}

	function clearDropHighlight() {
		document.querySelectorAll(".tree li.ctx-highlight").forEach(function(el) {
			el.classList.remove("ctx-highlight");
		});
	}

	// ── Prototype ────────────────────────────────────────────────────────

	Constr.prototype = {
		toggle : function(state) {
			if(state || state === false) {this.__activated = !!state}
			else {this.__activated = !this.__activated};
			d3.select("#directory-body")
				.style("position", this.__activated ? "relative" : "absolute")
				.style("visibility", this.__activated ? "visible" : "hidden")
		},

		clearDirectory: function() {
			var el = document.getElementById("directory");
			if (el) el.innerHTML = "";
		},
		reload : function (key) {
			var sel = d3.select("[data-key='"+ key +"']")
			if(sel.empty()) {return}
			build.call(sel)
		},
		toggleEdit : function(key, state) {

			var sel = d3.select("[data-key='"+ key +"']")
			if(sel.empty()) {return}
			var d = sel.datum()
			if (!d) {return}
			d.isResourceOpen = state || !d.isResourceOpen
			sel.attr("class", (d.isCollection ? "collection" : "resource") + (d.isResourceOpen ? " open" : ""))
		}

	};

	return Constr;
}());
