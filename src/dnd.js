/**
 * Drag and drop of files.
 */

import { namespace } from "./namespace.js";
import { Sender } from "./events.js";
import { oop } from "./oop.js";

export const DnD = (function(util) {

    const Constr = function(container) {
        const self = this;
        const el = typeof container === "string" ? document.querySelector(container) : container;
        el.addEventListener("dragenter", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.add("dropping");
        });
        el.addEventListener("dragover", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
        });
        el.addEventListener("dragleave", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.remove("dropping");
        });
        el.addEventListener("drop", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            el.classList.remove("dropping");
            if (ev.dataTransfer && ev.dataTransfer.files) {
                self.$triggerEvent("drop", [ev.dataTransfer.files]);
            }
        });
    };

    // Extend eXide.events.Sender for event support
    oop.inherit(Constr, Sender);

    return Constr;
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.util").DnD = DnD;
