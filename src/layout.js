eXide.namespace("eXide.app.FlexboxSplitter");

eXide.app.FlexboxSplitter = (function () {

    Constr = function(layout, resizable, region, min, preferred) {
        var self = this;
        self.el = document.querySelector(resizable);
        self.isHorizontal = region == "west" || region == "east";
        self.min = min;
        var splitter = self.el.querySelector(".resize-handle");
        var toggle = splitter.querySelector("span");
        var container = self.el.closest(".layout");

        self.prevSize = preferred;
        var hasMoved = false;

        function onMouseMove(e) {
            var current = (self.isHorizontal ? e.pageX : e.pageY);
            var diff = (pos - current);
            hasMoved = diff !== 0;
            pos = current;
            if (hasMoved) {
                if (self.isHorizontal) {
                    var w = self.el.offsetWidth;
                    var d = region == "west" ? -diff : diff;
                    if ((w < min && d > 0) || w + d >= min) {
                        self.el.style.width = (w + d) + "px";
                        self.el.style.minWidth = (w + d) + "px";
                    }
                } else {
                    var h = self.el.offsetHeight;
                    if (h - (1 - diff) >= min) {
                        self.el.style.height = (h - (1 - diff)) + "px";
                    }
                }
                layout.resize();
            }
        }

        var pos;

        function togglePanel() {
            var isMinimized = splitter.classList.contains("minimized");
            if (isMinimized) {
                var size = self.prevSize > self.min ? self.prevSize : self.min;
                self.setSize(size);
            } else {
                self.prevSize = self.isHorizontal ? self.el.offsetWidth : self.el.offsetHeight;
                self.setSize(10);
            }
            layout.resize();
        }

        function onMouseUp() {
            container.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            if (!hasMoved) {
                togglePanel();
            }
            self.$triggerEvent("afterResize");
        }

        splitter.addEventListener("mousedown", function(e) {
            e.preventDefault();
            pos = (self.isHorizontal ? e.pageX : e.pageY);
            hasMoved = false;
            self.$triggerEvent("beforeResize");
            container.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
    };

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    function isHidden(el) {
        return el.style.display === "none" || el.offsetParent === null;
    }

    Constr.prototype.getSize = function() {
        if (isHidden(this.el)) {
            return 0;
        }
        return this.isHorizontal ? this.el.offsetWidth : this.el.offsetHeight;
    };

    Constr.prototype.setSize = function(size, preferred) {
        if (preferred) {
            this.prevSize = preferred;
        }
        if (size === 0) {
            this.hide();
            return;
        }
        if (this.isHorizontal) {
            this.el.style.width = size + "px";
            this.el.style.minWidth = size + "px";
        } else {
            this.el.style.height = size + "px";
        }

        // Find the splitter element (may have either class)
        var splitter = this.el.querySelector(".resize-handle") ||
                       this.el.querySelector(".minimized");

        if (size <= 10) {
            if (splitter) {
                splitter.classList.add("minimized");
                splitter.classList.remove("resize-handle");
            }
            Array.prototype.forEach.call(this.el.children, function(child) {
                if (!child.classList.contains("minimized")) child.style.display = "none";
            });
        } else {
            this.prevSize = size;
            if (splitter) {
                splitter.classList.add("resize-handle");
                splitter.classList.remove("minimized");
            }
            Array.prototype.forEach.call(this.el.children, function(child) {
                child.style.display = "";
            });
        }
        if (isHidden(this.el)) {
            this.el.style.display = "";
        }
    };

    Constr.prototype.hide = function() {
        this.prevSize = this.isHorizontal ? this.el.offsetWidth : this.el.offsetHeight;
        this.el.style.display = "none";
    };

    Constr.prototype.show = function(resize) {
        if (isHidden(this.el)) {
            this.el.style.display = "";
            var size = this.prevSize > this.min ? this.prevSize : this.min;
            this.setSize(size);
        } else if (resize && this.el.querySelector(".minimized")) {
            var size = this.prevSize > this.min ? this.prevSize : this.min;
            this.setSize(size);
        }
    };

    Constr.prototype.toggle = function() {
        if (isHidden(this.el)) {
            this.show();
        } else {
            this.hide();
        }
    };

    return Constr;
}());

eXide.namespace("eXide.app.Layout");

eXide.app.Layout = (function () {

    var PANEL_DEFAULTS = {
        "west": { size: 200, preferred: 200 },
        "south": { size: 10, preferred: 200 },
        "east": { size: 0, preferred: 380 }
    };

    var Constr = function(editor) {
        this.editor = editor;
        this.regions = {
            "west": new eXide.app.FlexboxSplitter(this, ".panel-west", "west", 100, 200),
            "south": new eXide.app.FlexboxSplitter(this, ".panel-south", "south", 100, 200),
            "east": new eXide.app.FlexboxSplitter(this, ".panel-east", "east", 360, 380)
        };
        this.regions["east"].addEventListener("beforeResize", eXide.app.beforeResize);
        this.regions["east"].addEventListener("afterResize", eXide.app.afterResize);
    };

    Constr.prototype.resize = function() {
        eXide.app.resize(true);
    };

    Constr.prototype.hide = function(region) {
        this.regions[region].hide();
    };

    Constr.prototype.show = function(region, resize) {
        this.regions[region].show(resize);
    };

    Constr.prototype.toggle = function(region) {
        this.regions[region].toggle();
    };

    Constr.prototype.saveState = function() {
        localStorage["eXide.layout.south"] = this.regions.south.getSize();
        localStorage["eXide.layout.west"] = this.regions.west.getSize();
        localStorage["eXide.layout.east"] = this.regions.east.getSize();
    };

    Constr.prototype.restoreState = function(sameVersion) {
        if (!sameVersion) {
            this.reset();
        } else {
            for (var region in this.regions) {
                var size = localStorage["eXide.layout." + region];
                this.regions[region].setSize(parseInt(size));
            }
        }
    };

    Constr.prototype.reset = function() {
        for (var region in this.regions) {
            var settings = PANEL_DEFAULTS[region];
            this.regions[region].setSize(settings.size, settings.preferred);
        }
        eXide.app.afterResize();
    };

    return Constr;
}());
