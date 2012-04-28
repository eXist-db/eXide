/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2011 Wolfgang Meier
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
eXide.namespace("eXide.util.Menubar");

/**
 * Implements the main menubar behaviour
 */
eXide.util.Menubar = (function() {
    
    Constr = function (container) {
        var $this = this;
        this.container = container;
        
        var menuVisible = false;
        
        // Display sub menu on click
		$("ul li", this.container).click(function (ev) {
            ev.stopPropagation();
            var $this = this;
            $("ul", this).css({display: "block"});
            menuVisible = true;
		});
        $("body").click(function () {
            if (menuVisible) {
                $("ul li ul", $this.container).css({display: "none"});
            }
        });
    };
    
    Constr.prototype.click = function(selector, callback) {
        var $this = this;
        $(selector).click(function(ev) {
            ev.preventDefault();
            $("ul li ul", $this.container).css({display: "none"});
            menuVisible = false;
            callback();
        });
    };
    
    return Constr;
}());