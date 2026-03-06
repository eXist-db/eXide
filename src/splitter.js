eXide.namespace("eXide.app.FlexboxSplitter");

eXide.app.FlexboxSplitter = (function () {

    Constr = function(layout, resizable, region, min, preferred) {
        var self = this;
        self.resizable = typeof resizable === "string" ? document.querySelector(resizable) : resizable;
        self.isHorizontal = region == "west" || region == "east";
        var splitter = self.resizable.querySelector(".resize-handle");
        var container = self.resizable.closest(".layout");

        self.prevSize = preferred;
        var prevSize = preferred;
        var hasMoved = false;
        var onMouseMove = null;
        var onMouseUp = null;

        splitter.addEventListener("mousedown", function(e) {
            e.preventDefault();
            var pos = (self.isHorizontal ? e.pageX : e.pageY);
            hasMoved = false;
            onMouseMove = function(e) {
                var current = (self.isHorizontal ? e.pageX : e.pageY);
                var diff = (pos - current);
                hasMoved = diff !== 0;
                pos = current;
                if (self.isHorizontal) {
                    var w = self.resizable.offsetWidth;
                    var nw = region == "west" ? w - diff : w + diff;
                    if (nw >= min) {
                        self.resizable.style.width = nw + "px";
                    }
                } else {
                    var h = self.resizable.offsetHeight;
                    if (h - (1 - diff) >= min) {
                        self.resizable.style.height = (h - (1 - diff)) + "px";
                    }
                }
                layout.resize();
            };
            container.addEventListener("mousemove", onMouseMove);
            onMouseUp = function() {
                container.removeEventListener("mousemove", onMouseMove);
                if (!hasMoved) {
                    // toggle panel
                    var size = region == "west" || region == "east" ? self.resizable.offsetWidth : self.resizable.offsetHeight;
                    if (size == 10) {
                        if (region == "west" || region == "east") {
                            self.resizable.style.width = prevSize + "px";
                        } else {
                            self.resizable.style.height = prevSize + "px";
                        }
                        splitter.classList.remove("minimized");
                    } else {
                        prevSize = size;
                        if (region == "west" || region == "east") {
                            self.resizable.style.width = "10px";
                        } else {
                            self.resizable.style.height = "10px";
                        }
                        splitter.classList.add("minimized");
                    }
                }
                document.removeEventListener("mouseup", onMouseUp);
            };
            document.addEventListener("mouseup", onMouseUp);
        });
    };

    Constr.prototype.getSize = function() {
        if (this.resizable.style.display === "none" || !this.resizable.offsetParent) {
            return 0;
        }
        if (this.isHorizontal) {
            return this.resizable.offsetWidth;
        } else {
            return this.resizable.offsetHeight;
        }
    };

    Constr.prototype.setSize = function(size) {
        if (size === 0) {
            this.hide();
            return;
        }
        if (this.isHorizontal) {
            this.resizable.style.width = size + "px";
        } else {
            this.resizable.style.height = size + "px";
        }
        if (size === 10) {
            var splitter = this.resizable.querySelector(".resize-handle");
            splitter.classList.add("minimized");
        }
    };

    Constr.prototype.hide = function() {
        this.resizable.style.display = "none";
    };

    Constr.prototype.show = function() {
        if (this.resizable.style.display === "none" || !this.resizable.offsetParent) {
            this.resizable.style.display = "";
        }
        this.setSize(this.prevSize);
    };

    return Constr;
}());

eXide.namespace("eXide.app.Layout");

eXide.app.Layout = (function () {

    var Constr = function(editor) {
        this.editor = editor;
        this.regions = {
            "west": new eXide.app.FlexboxSplitter(this, ".panel-west", "west", 75, 175),
            "south": new eXide.app.FlexboxSplitter(this, ".panel-south", "south", 75, 200),
            "east": new eXide.app.FlexboxSplitter(this, ".panel-east", "east", 75, 75)
        };
    };

    Constr.prototype.resize = function() {
        eXide.app.resize(true);
    };

    Constr.prototype.hide = function(region) {
        this.regions[region].hide();
    };

    Constr.prototype.show = function(region) {
        this.regions[region].show();
    };

    Constr.prototype.saveState = function() {
        localStorage["eXide.layout.south"] = this.regions.south.getSize();
        localStorage["eXide.layout.west"] = this.regions.west.getSize();
        localStorage["eXide.layout.east"] = this.regions.east.getSize();
    };

    Constr.prototype.restoreState = function() {
        for (var region in this.regions) {
            var size = localStorage["eXide.layout." + region];
            if (size) {
                this.regions[region].setSize(parseInt(size));
            }
        }
    };

    return Constr;
}());
