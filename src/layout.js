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

        function onMouseUp() {
            container.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
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

        toggle.addEventListener("click", function(e) {
            // toggle panel
            var size = self.isHorizontal ? self.el.offsetWidth : self.el.offsetHeight;
            if (size == 10) {
                if (self.isHorizontal) {
                    self.el.style.width = self.prevSize + "px";
                    self.el.style.minWidth = self.prevSize + "px";
                } else {
                    self.el.style.height = self.prevSize + "px";
                }
                splitter.classList.remove("minimized");
                splitter.classList.add("resize-handle");
                Array.prototype.forEach.call(self.el.children, function(child) {
                    if (!child.classList.contains("minimized")) child.style.display = "";
                });
            } else {
                self.prevSize = size;
                if (self.isHorizontal) {
                    self.el.style.width = "10px";
                    self.el.style.minWidth = "10px";
                } else {
                    self.el.style.height = "10px";
                }
                splitter.classList.add("minimized");
                splitter.classList.remove("resize-handle");
                Array.prototype.forEach.call(self.el.children, function(child) {
                    if (!child.classList.contains("minimized")) child.style.display = "none";
                });
            }
            layout.resize();
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
        if (size > this.min && size < this.min) {
            size = this.min;
        }
        if (this.isHorizontal) {
            this.el.style.width = size + "px";
            this.el.style.minWidth = size + "px";
        } else {
            this.el.style.height = size + "px";
        }

        if (size === 10) {
            var splitter = this.el.querySelector(".resize-handle");
            if (splitter) {
                splitter.classList.add("minimized");
            }
            Array.prototype.forEach.call(this.el.children, function(child) {
                if (!child.classList.contains("minimized")) child.style.display = "none";
            });
            var minimized = this.el.querySelector(".minimized");
            if (minimized) {
                minimized.classList.remove("resize-handle");
            }
        } else {
            this.prevSize = size;
            Array.prototype.forEach.call(this.el.children, function(child) {
                if (!child.classList.contains("minimized")) child.style.display = "";
            });
            var minimized = this.el.querySelector(".minimized");
            if (minimized) {
                minimized.classList.add("resize-handle");
                minimized.classList.remove("minimized");
            }
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
            this.setSize(this.prevSize);
        } else if (resize && this.getSize() == 10) {
            this.setSize(this.prevSize);
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
                if (size != null) {
                    var parsed = parseInt(size);
                    if (!isNaN(parsed)) {
                        this.regions[region].setSize(parsed);
                    }
                }
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
