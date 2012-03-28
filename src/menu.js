eXide.namespace("eXide.util.Menubar");

/**
 * Static class for the main application. Controls the GUI.
 */
eXide.util.Menubar = (function() {
    
    Constr = function (container) {
        this.container = container;
        
        // Display sub menu on click
		$("ul li", this.container).click(function () {
            var $this = this;
            $("ul", this).css({visibility: "visible", display: "none"}).show(400);
            $(this).mouseleave(function() {
                $("ul", $this).css({visibility: "hidden"});
            });
		});
    };
    
    Constr.prototype.click = function(selector, callback) {
        var $this = this;
        $(selector).click(function(ev) {
            ev.preventDefault();
            callback();
            $("ul", $this).css({visibility: "hidden"});
        });
    };
    
    return Constr;
}());