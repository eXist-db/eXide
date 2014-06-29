eXide.namespace("eXide.util.DnD");

/**
 * Drag and drop of files.
 */
eXide.util.DnD = (function(util) {
    
    var Constr = function(container) {
        var self = this;
        container = $(container);
        container.on("dragenter", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            container.addClass("dropping");
        });
        container.on("dragover", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
        });
        container.on("dragleave", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            
            container.removeClass("dropping");
        });
        container.on("drop", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            
            container.removeClass("dropping");
            
            if (ev.originalEvent.dataTransfer && ev.originalEvent.dataTransfer.files) {
                self.$triggerEvent("drop", [ev.originalEvent.dataTransfer.files]);
            }
        });
    };
    
    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);
    
    return Constr;
}());