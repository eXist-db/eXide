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

        // Wrap content in a <dialog> element
        var dialog = document.createElement("dialog");
        dialog.className = "eXide-dialog";
        if (options.width) dialog.style.width = options.width + "px";
        if (options.height) {
            dialog.style.height = options.height + "px";
            dialog.style.display = "flex";
            dialog.style.flexDirection = "column";
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
        closeBtn.textContent = "\u00d7";
        closeBtn.type = "button";
        titleBar.appendChild(closeBtn);
        dialog.appendChild(titleBar);

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
                if (options.modal !== false) {
                    dialog.showModal();
                } else {
                    dialog.show();
                }
            },
            close: function() {
                if (dialog.open) dialog.close();
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

        // ESC key closes (native dialog handles this for modal, but not for non-modal)
        dialog.addEventListener("cancel", function(e) {
            e.preventDefault();
            controller.close();
        });

        return controller;
    }

    return {
        create: create
    };
}());
