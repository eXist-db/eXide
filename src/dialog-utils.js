/**
 * Native <dialog> wrapper replacing jQuery UI dialog.
 *
 * Usage:
 *   var dlg = eXide.util.DialogManager.create(contentEl, { title, modal, buttons, width, height });
 *   dlg.open();
 *   dlg.close();
 *   dlg.setTitle(title);
 *   dlg.setButtons(buttons);
 *
 * buttons is an object: { "Label": function() { ... }, ... }
 * The callback receives the dialog controller as `this`.
 */
eXide.namespace("eXide.util.DialogManager");

eXide.util.DialogManager = (function() {

    function create(contentEl, options) {
        options = options || {};
        var el = typeof contentEl === "string" ? document.querySelector(contentEl) : contentEl;
        if (!el) {
            console.warn("DialogManager.create: element not found", contentEl);
            return { dialog: document.createElement("dialog"), content: document.createElement("div"), open: function(){}, close: function(){}, setTitle: function(){}, setButtons: function(){} };
        }

        var isModal = options.modal !== false;
        // Use <dialog> for modal, <div> for non-modal (avoids top-layer stacking issues)
        var dialog = document.createElement(isModal ? "dialog" : "div");
        dialog.className = "eXide-dialog";
        if (options.width) dialog.style.width = options.width + "px";
        if (options.height) {
            dialog.style.height = options.height + "px";
            dialog.style.flexDirection = "column";
        }
        if (isModal) {
            // Don't set inline display on <dialog> — browser UA stylesheet handles it
            // via dialog:not([open]) { display: none }
        } else {
            dialog.style.display = "none";
        }

        // Title bar
        var titleBar = document.createElement("div");
        titleBar.className = "eXide-dialog-titlebar";
        var titleSpan = document.createElement("span");
        titleSpan.className = "eXide-dialog-title";
        titleSpan.textContent = options.title || "";
        titleBar.appendChild(titleSpan);
        var closeBtn = document.createElement("button");
        closeBtn.className = "eXide-dialog-close";
        closeBtn.textContent = "\u2715";
        closeBtn.type = "button";
        titleBar.appendChild(closeBtn);
        dialog.appendChild(titleBar);

        // Drag support via title bar
        if (options.draggable !== false) {
            titleBar.style.cursor = "move";
            var dragState = null;
            titleBar.addEventListener("mousedown", function(e) {
                if (e.target === closeBtn) return;
                e.preventDefault();
                // Remove centering transform on first drag
                if (dialog.style.transform) {
                    var rect = dialog.getBoundingClientRect();
                    dialog.style.transform = "none";
                    dialog.style.left = rect.left + "px";
                    dialog.style.top = rect.top + "px";
                }
                dragState = { startX: e.clientX, startY: e.clientY, origLeft: dialog.offsetLeft, origTop: dialog.offsetTop };
                function onMove(e) {
                    if (!dragState) return;
                    dialog.style.left = (dragState.origLeft + e.clientX - dragState.startX) + "px";
                    dialog.style.top = (dragState.origTop + e.clientY - dragState.startY) + "px";
                }
                function onUp() {
                    dragState = null;
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                }
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
            });
        }

        // Content wrapper
        var content = document.createElement("div");
        content.className = "eXide-dialog-content";
        if (options.height) content.style.flex = "1";
        if (el.parentNode) {
            el.parentNode.insertBefore(dialog, el);
        }
        content.appendChild(el);
        el.style.display = "";
        dialog.appendChild(content);

        // Button bar
        var buttonBar = document.createElement("div");
        buttonBar.className = "eXide-dialog-buttons";
        dialog.appendChild(buttonBar);

        // Append to specified container or body
        var appendTo = options.appendTo ? document.querySelector(options.appendTo) : document.body;
        appendTo.appendChild(dialog);

        var controller = {
            dialog: dialog,
            content: el,
            open: function() {
                if (isModal) {
                    dialog.showModal();
                    if (options.height) dialog.style.display = "flex";
                } else {
                    dialog.style.display = "flex";
                    dialog.setAttribute("open", "");
                }
            },
            close: function() {
                if (isModal) {
                    if (dialog.hasAttribute("open")) dialog.close();
                    dialog.style.display = "";
                } else {
                    dialog.style.display = "none";
                    dialog.removeAttribute("open");
                    dialog.dispatchEvent(new Event("close"));
                }
            },
            setTitle: function(title) {
                titleSpan.textContent = title || "";
            },
            setButtons: function(buttons) {
                buttonBar.innerHTML = "";
                if (!buttons) return;
                for (var label in buttons) {
                    if (buttons.hasOwnProperty(label)) {
                        (function(fn) {
                            var btn = document.createElement("button");
                            btn.type = "button";
                            btn.textContent = label;
                            btn.addEventListener("click", function() {
                                fn.call(controller);
                            });
                            buttonBar.appendChild(btn);
                        })(buttons[label]);
                    }
                }
            }
        };

        // Set initial buttons
        if (options.buttons) {
            controller.setButtons(options.buttons);
        }

        // Close button
        closeBtn.addEventListener("click", function() {
            controller.close();
        });

        // ESC key closes
        if (isModal) {
            dialog.addEventListener("cancel", function(e) {
                e.preventDefault();
                controller.close();
            });
        }
        dialog.addEventListener("keydown", function(e) {
            if (e.key === "Escape" && !isModal) {
                controller.close();
            }
        });

        return controller;
    }

    return {
        create: create
    };
}());
