eXide.namespace("eXide.app.FlexboxSplitter");

eXide.app.FlexboxSplitter = (function () {

    const Constr = function(layout, resizable, region, min, preferred) {
        const self = this;
        self.el = document.querySelector(resizable);
        self.isHorizontal = region === "west" || region === "east";
        self.min = min;
        const splitter = self.el.querySelector(".resize-handle");
        const toggle = splitter.querySelector("span");
        const container = self.el.closest(".layout");

        self.prevSize = preferred;
        let hasMoved = false;
        let pos;

        function onMouseMove(e) {
            const current = (self.isHorizontal ? e.pageX : e.pageY);
            const diff = (pos - current);
            hasMoved = hasMoved || diff !== 0;
            pos = current;
            if (hasMoved) {
                if (self.isHorizontal) {
                    const w = self.el.offsetWidth;
                    const d = region === "west" ? -diff : diff;
                    if ((w < min && d > 0) || w + d >= min) {
                        self.el.style.width = (w + d) + "px";
                        self.el.style.minWidth = (w + d) + "px";
                    }
                } else {
                    const h = self.el.offsetHeight;
                    if ((h < min && diff > 0) || h + diff >= min) {
                        self.el.style.height = (h + diff) + "px";
                    }
                }
                layout.resize();
            }
        }

        function togglePanel() {
            const isMinimized = splitter.classList.contains("minimized");
            if (isMinimized) {
                const size = self.prevSize > self.min ? self.prevSize : self.min;
                self.setSize(size);
            } else {
                self.prevSize = self.isHorizontal ? self.el.offsetWidth : self.el.offsetHeight;
                self.setSize(10);
            }
            layout.resize();
        }

        function onMouseUp() {
            document.removeEventListener("mousemove", onMouseMove);
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
            document.addEventListener("mousemove", onMouseMove);
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
        const splitter = this.el.querySelector(".resize-handle") ||
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
            const size = this.prevSize > this.min ? this.prevSize : this.min;
            this.setSize(size);
        } else if (resize && this.el.querySelector(".minimized")) {
            const size = this.prevSize > this.min ? this.prevSize : this.min;
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

    const PANEL_DEFAULTS = {
        "west": { size: 200, preferred: 200 },
        "south": { size: 10, preferred: 200 },
        "east": { size: 0, preferred: 220 }
    };

    const Constr = function(editor) {
        this.editor = editor;
        this.regions = {
            "west": new eXide.app.FlexboxSplitter(this, ".panel-west", "west", 100, 200),
            "south": new eXide.app.FlexboxSplitter(this, ".panel-south", "south", 100, 200),
            "east": new eXide.app.FlexboxSplitter(this, ".panel-east", "east", 180, 220)
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
            for (const region in this.regions) {
                const size = localStorage["eXide.layout." + region];
                if (size != null) {
                    const parsed = parseInt(size);
                    if (!isNaN(parsed)) {
                        this.regions[region].setSize(parsed);
                    }
                }
            }
        }
    };

    Constr.prototype.reset = function() {
        for (const region in this.regions) {
            const settings = PANEL_DEFAULTS[region];
            this.regions[region].setSize(settings.size, settings.preferred);
        }
        eXide.app.afterResize();
    };

    return Constr;
}());
