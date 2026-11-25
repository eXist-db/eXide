/**
 * Drag and drop of files.
 */

import { namespace } from "./namespace.js";
import { Sender } from "./events.js";

export class DnD extends Sender {
    constructor(container) {
        super();
        const self = this;
        const el = typeof container === "string" ? document.querySelector(container) : container;
        el.addEventListener("dragenter", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.add("dropping");
        });
        el.addEventListener("dragover", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
        });
        el.addEventListener("dragleave", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.remove("dropping");
        });
        el.addEventListener("drop", (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.remove("dropping");
            if (ev.dataTransfer && ev.dataTransfer.files) {
                self.$triggerEvent("drop", [ev.dataTransfer.files]);
            }
        });
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.util").DnD = DnD;
