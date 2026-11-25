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
 *
 * Order matters: the bar is right-aligned and the LAST button is the primary
 * action (highlighted, and focused on open). List the safe choice (Cancel/Close)
 * first and the action last. Instead of a function, a button may be given as
 * { click: fn, destructive: true } (red primary; Cancel gets focus instead) or
 * { click: fn, separate: true } (pushed to the far left, away from the others).
 */

import { namespace } from "./namespace.js";

export const DialogManager = (function() {

    // Stack of open non-modal dialog controllers (most recent on top)
    const openStack = [];

    // Single document-level Escape handler for all non-modal dialogs, installed
    // with the first dialog (not on import). Skip if a modal <dialog> (e.g.
    // QuickPicker, confirm) is open on top — those handle Escape themselves via
    // the native cancel event.
    let escapeHandlerInstalled = false;
    function installEscapeHandler() {
        if (escapeHandlerInstalled) return;
        escapeHandlerInstalled = true;
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && openStack.length > 0) {
                const topModal = document.querySelector("dialog[open]");
                if (topModal) return; // let the modal handle it
                e.preventDefault();
                openStack[openStack.length - 1].close();
            }
        });
    }

    function create(contentEl, options) {
        installEscapeHandler();
        options = options || {};
        const el = typeof contentEl === "string" ? document.querySelector(contentEl) : contentEl;
        if (!el) {
            console.warn("DialogManager.create: element not found", contentEl);
            return { dialog: document.createElement("dialog"), content: document.createElement("div"), open(){}, close(){}, setTitle(){}, setButtons(){} };
        }

        const isModal = options.modal !== false;
        // Use <dialog> for modal, <div> for non-modal (avoids top-layer stacking issues)
        const dialog = document.createElement(isModal ? "dialog" : "div");
        dialog.className = "eXide-dialog";
        if (options.width) dialog.style.width = `${options.width}px`;
        if (options.height) {
            dialog.style.height = `${options.height}px`;
            dialog.style.flexDirection = "column";
        }
        if (isModal) {
            // Don't set inline display on <dialog> — browser UA stylesheet handles it
            // via dialog:not([open]) { display: none }
        } else {
            dialog.style.display = "none";
        }

        // Title bar
        const titleBar = document.createElement("div");
        titleBar.className = "eXide-dialog-titlebar";
        const titleSpan = document.createElement("span");
        titleSpan.className = "eXide-dialog-title";
        titleSpan.textContent = options.title || "";
        titleBar.appendChild(titleSpan);
        const closeBtn = document.createElement("button");
        closeBtn.className = "eXide-dialog-close";
        closeBtn.textContent = "\u2715";
        closeBtn.type = "button";
        titleBar.appendChild(closeBtn);
        dialog.appendChild(titleBar);

        // Drag state (declared here so open() can reset it)
        let dragResolved = false;

        // Drag support via title bar
        if (options.draggable !== false) {
            titleBar.style.cursor = "move";
            let dragState = null;
            titleBar.addEventListener("mousedown", (e) => {
                if (e.target === closeBtn) return;
                e.preventDefault();
                // On first drag, resolve CSS centering to fixed pixel position.
                // Modal <dialog> uses UA inset:0/margin:auto in the top layer;
                // non-modal <div> uses top:50%/left:50%/transform.
                if (!dragResolved) {
                    const rect = dialog.getBoundingClientRect();
                    if (isModal) {
                        // Top-layer: position relative to viewport
                        dialog.style.inset = "auto";
                        dialog.style.margin = "0";
                        dialog.style.left = `${rect.left}px`;
                        dialog.style.top = `${rect.top}px`;
                    } else {
                        const parentRect = (dialog.offsetParent || document.body).getBoundingClientRect();
                        dialog.style.transform = "none";
                        dialog.style.left = `${rect.left - parentRect.left}px`;
                        dialog.style.top = `${rect.top - parentRect.top}px`;
                    }
                    dragResolved = true;
                }
                const left = parseInt(dialog.style.left, 10) || 0;
                const top = parseInt(dialog.style.top, 10) || 0;
                dragState = { startX: e.clientX, startY: e.clientY, origLeft: left, origTop: top };
                function onMove(e) {
                    if (!dragState) return;
                    dialog.style.left = `${dragState.origLeft + e.clientX - dragState.startX}px`;
                    dialog.style.top = `${dragState.origTop + e.clientY - dragState.startY}px`;
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
        const content = document.createElement("div");
        content.className = "eXide-dialog-content";
        if (options.height) content.style.flex = "1";
        if (el.parentNode) {
            el.parentNode.insertBefore(dialog, el);
        }
        content.appendChild(el);
        el.style.display = "";
        dialog.appendChild(content);

        // Button bar
        const buttonBar = document.createElement("div");
        buttonBar.className = "eXide-dialog-buttons";
        dialog.appendChild(buttonBar);

        // Append to specified container or body
        const appendTo = options.appendTo ? document.querySelector(options.appendTo) : document.body;
        appendTo.appendChild(dialog);

        const controller = {
            dialog,
            content: el,
            open() {
                // The same content element may be wrapped by more than one dialog
                // (e.g. resource properties, from both the DB manager and the
                // sidebar tree); take it back if another wrapper holds it.
                if (el.parentNode !== content) content.appendChild(el);
                // Reset drag position so dialog re-centers each time
                if (dragResolved) {
                    dialog.style.left = "";
                    dialog.style.top = "";
                    if (isModal) {
                        dialog.style.inset = "";
                        dialog.style.margin = "";
                    } else {
                        dialog.style.transform = "";
                    }
                    dragResolved = false;
                }
                if (isModal) {
                    dialog.showModal();
                    if (options.height) dialog.style.display = "flex";
                    // Focus the primary action (the last button) so Enter does what the
                    // highlighted button says. A destructive primary is not focused:
                    // focus falls back to the first button (the safe choice) instead.
                    const buttons = buttonBar.querySelectorAll("button");
                    let primaryBtn = buttons[buttons.length - 1];
                    if (primaryBtn && primaryBtn.classList.contains("destructive")) {
                        primaryBtn = buttons[0];
                    }
                    if (primaryBtn) primaryBtn.focus();
                } else {
                    dialog.style.display = "flex";
                    dialog.setAttribute("open", "");
                    openStack.push(controller);
                }
            },
            close() {
                if (isModal) {
                    if (dialog.hasAttribute("open")) dialog.close();
                    dialog.style.display = "";
                } else {
                    dialog.style.display = "none";
                    dialog.removeAttribute("open");
                    const idx = openStack.indexOf(controller);
                    if (idx !== -1) openStack.splice(idx, 1);
                    dialog.dispatchEvent(new Event("close"));
                }
            },
            setTitle(title) {
                titleSpan.textContent = title || "";
            },
            setButtons(buttons) {
                buttonBar.innerHTML = "";
                if (!buttons) return;
                for (const label in buttons) {
                    if (Object.hasOwn(buttons, label)) {
                        (function(spec) {
                            const fn = typeof spec === "function" ? spec : spec.click;
                            const btn = document.createElement("button");
                            btn.type = "button";
                            btn.textContent = label;
                            if (spec.destructive) btn.classList.add("destructive");
                            if (spec.separate) btn.classList.add("separate");
                            btn.addEventListener("click", () => {
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
        closeBtn.addEventListener("click", () => {
            controller.close();
        });

        // ESC key closes
        if (isModal) {
            dialog.addEventListener("cancel", (e) => {
                e.preventDefault();
                controller.close();
            });
        }
        // Non-modal Escape is handled by the shared openStack listener above

        return controller;
    }

    return {
        create
    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.util").DialogManager = DialogManager;
