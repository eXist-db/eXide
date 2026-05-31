eXide.namespace("eXide.util.DnD");

/**
 * Drag and drop of files.
 */
eXide.util.DnD = (function(util) {

    var Constr = function(container) {
        var self = this;
        var el = typeof container === "string" ? document.querySelector(container) : container;
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
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    return Constr;
}());
