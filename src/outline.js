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

eXide.namespace("eXide.edit.Outline");

/**
 * XQuery function outline view. Available functions and variables are
 * kept in the document instance. Templates are loaded once and kept in
 * this class.
 * 
 */
eXide.edit.Outline = (function () {
	
	Constr = function() {
		this.currentDoc = null;
        this.__activated = false;
        
        var self = this;
        $("#outline-filter").keyup(function() {
            self.filter(this.value);
        });
	};
	
	Constr.prototype = {
		
		toggle : function(state) {
			if(state || state === false) {this.__activated = !!state}
			else {this.__activated = !this.__activated};
// 			d3.select("#outline-body").style("display", this.__activated ? "block" : "none")
			d3.select("#outline-body").style("position", this.__activated ? "relative" : "absolute")
		},
		
		getTemplates: function (prefix) {
			var re = new RegExp("^" + prefix);
			var matches = [];
			for (var i = 0; i < this.templates.length; i++) {
				if (this.templates[i].name.match(re)) {
					matches.push(this.templates[i]);
				}
			}
			return matches;
		},
		
		gotoDefinition: function(doc, name) {
		    var type = "function"
            if (name.indexOf("$") === 0) {
		        name = name.substring(1);
		        type = "variable";
		        
		    }
			$.each(doc.functions, function (i, func) {
				if (name == func.name && type == func.type) {
					eXide.app.locate(func.type, func.source == '' ? null : func.source, name);
					return false;
				}
			});
		},
		
        findDefinition: function(doc, name) {
            for (var i = 0; i < doc.functions.length; i++) {
                var func = doc.functions[i];
    			if (name == func.name) {
					return func;
				}
			}
            return null;
        },
        
		updateOutline: function(doc) {
            var self = this;
			self.currentDoc = doc;
			doc.functions = [];
            
            var helper = doc.getModeHelper();
            if (helper != null) {
                helper.createOutline(doc, function() {
                    self.$outlineUpdate(doc);
                });
            }
		},
		
		clearOutline: function() {
			$("#outline").empty();
		},
		
        filter: function(str) {
            var regex = new RegExp(str, "i");
            $("#outline li a").each(function() {
                var item = $(this);
                if (!regex.test(item.text())) {
                    item.hide();
                } else {
                    item.show();
                }
            });
        },
        
        $outlineUpdate: function (doc) {
            if (this.currentDoc != doc)
                return;
            
            eXide.app.resize();
            // use d3s for smooth transitions
            var outline = d3.select("#outline");

            var sel = outline.selectAll("li")
                .data(doc.functions, function(d) {
                    return d.sort;
                });

            function stringCompare(a, b) {
                a = a.toLowerCase();
                b = b.toLowerCase();
                return a > b ? 1 : a == b ? 0 : -1;
            }   

            var li = sel.enter()
                .append("li")
                    .attr("class", function(d) {
                        return d.type == eXide.edit.Document.TYPE_FUNCTION
                            ? "ace_support.ace_function"
                            : "ace_variable";
                    })
                    .append("a")
                        .style("opacity", 0)
                        .attr("title", function(d) {
                            if (d.signature) { return d.signature }
                            return null;
                        })
                        .attr("href", function(d) {
                            return  "#" + (d.source ? d.source : "");
                        })
                        .attr("class",function(d) {
                            var cl =  d.type == eXide.edit.Document.TYPE_FUNCTION ?  "t.function" : "t_variable";
                            return cl + " " + (d.visibility === "private" ? "private" : "public" );
                        })
                       .text(function(d) {
                            if (d.type == eXide.edit.Document.TYPE_VARIABLE) {
                                return "$" + d.name;
                            } else {
                                return d.name;
                            }    
                       })

                       .on("click", function(d) {
                            var path = this.hash.substring(1);
                            if(d.row) {
                                eXide.app.locate("function", path == '' ? null: path, parseInt(d.row));
                            } else if(d.type == eXide.edit.Document.TYPE_FUNCTION) {
                                eXide.app.locate("function", path == '' ? null: path, d.name);
                            } else {
                                eXide.app.locate("variable", path == '' ? null: path,d.name);
                            }
                       })
                       .transition()
                            .duration(800)
                            .style("opacity",1);

            sel.exit()
                .transition()
                    .duration(400)
                    .style("opacity",0)
                    .remove();
            sel.sort(function (a, b) { return a == null || b == null ? -1  : stringCompare(a.sort, b.sort); });
        }
	};
	
	return Constr;
}());
