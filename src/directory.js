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

eXide.namespace("eXide.edit.Directory");

/**
 * XQuery directory view - Sublime style
 * 
 */
eXide.edit.Directory = (function () {
	
	
	Constr = function() {
		this.currentDoc = null;
        this.__activated = false; 
        
		init();
	};
	
	function setFolderClass(d) {
		return 'fa ' + (d.isCollection ? ('fa-folder' + (d.isOpen ? "-open" : "")): "") 
	}
	
	function build(data) {
		var sel = d3.select(this);
		var fn = function(d) {
			sel.selectAll('ul, span, i').remove()
				
			var li = sel.datum(d)
						.attr('class', function(d) {return d.isCollection ? "collection" : "resource"})
						.style('cursor','pointer')
						.on('click', click)
				
			li
				.append('i')
				.attr('class', setFolderClass)
			li
				.append('span')
				.text(function(d){return d.name})
			
			if(d.children && d.children.length){
				sel
					.append('ul')
					.selectAll('li')
					.data(d.children)
					.enter()
					.append('li')
					.each(build)
			}
			
		};

		if(data) {
			return fn(data.length ? data[0]: data)
		}
		d3.json("modules/collections.xql?root=" + (this.__data__.key || "/db") + "&view=r", function(error, data){
			if(error)	{
				return
			}
			var d = sel.datum()
			d.isOpen = true;
			d.isLoaded = true;
			d.children = data.items.filter(function(i){return i.name != ".."})
			fn(d)
		} )
	};
	
	function init() {
		build.call(d3.select("#tree-root").node(), [{key:'/db',isCollection: true, isOpen:false, name:'db', isLoaded: false}])
	};
	
	function toggleFolder(d) {
		d.isOpen = !d.isOpen;
		var sel = d3.select(this)
		sel.select("i.fa").attr('class', setFolderClass)
		if(d.isOpen) {
		   return build.call(this)
		}
		sel.selectAll('ul').remove()
	};
	
	
	function loadFolder(d) {
		build.call(this)
	};
	
	function loadResource(d) {
		eXide.app.$doOpenDocument({name :d.name, path: d.key, writable:d.writable});
	};
	
	function click(d) {
		d3.event.stopPropagation()
		if(d.isCollection) {
			if(d.isLoaded) {
				return toggleFolder.call(this,d)
			}
			eXide.app.syncManager(d.key)
			loadFolder.call(this,d)
		}
		else {
			loadResource(d)
		}
	};
	
	Constr.prototype = {
		toggle : function(state) {
			if(state || state === false) {this.__activated = !!state}
			else {this.__activated = !this.__activated};
// 			d3.select(this.__rootSel).style("display", this.__activated ?  "block" : "none")
			d3.select("#directory-body").style("position", this.__activated ? "relative" : "absolute")
		},
		
		clearDirectory: function() {
			$("#directory").empty();
		},
		
//         filter: function(str) {
//             var regex = new RegExp(str, "i");
//             $("#directory li a").each(function() {
//                 var item = $(this);
//                 if (!regex.test(item.text())) {
//                     item.hide();
//                 } else {
//                     item.show();
//                 }
//             });
//         }
	};
	
	return Constr;
}());
