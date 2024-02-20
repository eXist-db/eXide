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
eXide.namespace("eXide.edit.Projects");

eXide.edit.Projects = (function(oop) {
    
    Constr = function() {
        this.projects = {};
    };
    
    Constr.prototype.findProject = function (collection, callback) {
        var project = this.getProjectFor(collection);
        if (project && project !== null) {
            callback(project);
        } else {
            this.getProject(collection, callback);
        }
    };
    
    Constr.prototype.getProject = function (collection, callback) {
        var $this = this;
        $.getJSON("modules/deployment.xq", { info: collection }, function (data) {
            if (!data) {
                if (typeof callback == "function") {
                    callback(null);
                }
            } else {
                var project = $this.projects[data.abbrev];
                if (project) {
                    oop.extend(project, data);
                } else {
                    project = data;
                    $this.projects[data.abbrev] = project;
                }
                if (typeof callback == "function") {
                    callback(project);
                }
            }
        });
    };

    Constr.prototype.getProjectFor = function (collection) {
        var re = new RegExp("^" + collection);
        for (k in this.projects) {
            var project = this.projects[k];
            if (collection.substring(0, project.root.length) === project.root) {
                return project;
            }
        }
        return null;
    };
    
    Constr.prototype.saveState = function () {
        localStorage["eXide.projects"] = JSON.stringify(this.projects);
	};
			
	Constr.prototype.restoreState = function() {
        var $this = this;
        if (localStorage["eXide.projects"]) {
            this.projects = JSON.parse(localStorage["eXide.projects"]);
            if (typeof this.projects != 'object')
                this.projects = {};
        }
        // refresh state to see if app package config has chaged in the db (e.g added Git)
        $.each(this.projects, function(project) {
            if(this.root) {
               $this.getProject(this.root);
            }
        });
        
	};
    
    return Constr;
}(eXide.util.oop));

eXide.namespace("eXide.edit.PackageEditor");

/**
 * Edit deployment descriptors.
 */
eXide.edit.PackageEditor = (function () {
    
	Constr = function (projects) {
		var $this = this;
        this.projects = projects;
        this.currentProject = null;
		
		this.runDialog = $("#dialog-run-app");
		this.runDialog.dialog({
		    appendTo: "#layout-container",
			modal: false,
			autoOpen: false,
			width: 300,
			height: 240,
			buttons: {
			    "Done": function () { $(this).dialog("close"); }
			}
		});
		this.runDialog.find("input[name='live-reload']").click(function(ev) {
		    $this.currentProject.liveReload = $(this).is(":checked");
		    $("#menu-deploy-live span").attr("class", $this.currentProject.liveReload ? "fa fa-check-square-o" : "fa fa-square-o");
		});
		
		this.syncDialog = $("#synchronize-dialog");
		this.syncDialog.dialog({
            appendTo: "#layout-container",
			title: "Synchronize to Directory",
			modal: false,
			autoOpen: false,
			width: 500,
			height: 440,
			buttons: {
                "Apply": function() {
                    var dir = $this.syncDialog.find("input[name=\"dir\"]").val();
                    if (dir && dir.length > 0) {
                        $this.currentProject.dir = dir;
                    }
                    $this.currentProject.autoSync = $this.syncDialog.find("input[name=\"auto\"]").is(':checked');
                    $(this).dialog("close");
                },
                "Synchronize": function () {
					var dir = $this.syncDialog.find("input[name=\"dir\"]").val();
					if (!dir || dir.length == 0) {
						$("#synchronize-report").text("No output directory specified!");
						return;
					}
                    $this.currentProject.dir = dir;
                    
                    var params = {
                        start: $this.syncDialog.find("input[name=\"start\"]").val(),
                        dir: dir,
                        auto: $this.syncDialog.find("input[name=\"auto\"]").val(),
                        collection: $this.syncDialog.find("input[name=\"collection\"]").val(),
                        indent: $("#indent-on-download-package").is(":checked"),
                        "expand-xincludes": $("#expand-xincludes-on-download-package").is(":checked"),
                        "omit-xml-declarationaration": $("#omit-xml-declaration-on-download-package").is(":checked")
                    };
					$("#synchronize-report").text("Synchronization in progress ...");
					$("#synchronize-report").load("modules/synchronize.xq", params);
				},
				"Close": function () { $(this).dialog("close"); }
			}
		});
        
        this.gitCheckoutDialog = $("#dialog-git-checkout");
		this.gitCheckoutDialog.dialog({
            appendTo: "#layout-container",
			title: "Git Checkout",
			modal: false,
			autoOpen: false,
			width: 500,
			height: 240, 
			buttons: {
                "Switch Branch": function() {
                    var branch = $("[name='git-checkout']", $this.gitCheckoutDialog.find("form")).val();
                    eXide.app.git.command($this.currentProject, 'checkout', branch, function(data){
                         $("#toolbar-current-branch").text(branch);
                         $("#menu-git-active").text(branch);
                    });
                    $(this).dialog("close");
                },
                "Cancel": function () { $(this).dialog("close"); }
			}
		}); 
        
        this.gitCommitDialog = $("#dialog-git-commit");
		this.gitCommitDialog.dialog({
            appendTo: "#layout-container",
			title: "Synchonize and Commit",
			modal: false,
			autoOpen: false,
			width: 500,
			height: 360,
			buttons: {
                "Sync and Commit": function() {
                    var form = $this.gitCommitDialog.find("form"),
                        title = $("[name='git-commit-title']", form).val(),
                        desc = $("[name='git-commit-desc']", form).val(),
                        option =  title + '\n\n' + desc ,
                        start = $("[name='start']", form).val(),
                        statusAnchor = "#git-commit-status";
                        
                    if (!title || title.length == 0) {
						$(statusAnchor).text("title for commit message is required");
						return;
					}
                    
                    var params = {
                        collection: $this.currentProject.root, 
                        start: start,
                        indent: $("#indent-on-download-package").is(":checked"),
                        "expand-xincludes": $("#expand-xincludes-on-download-package").is(":checked"),
                        "omit-xml-declaration": $("#omit-xml-declaration-on-download-package").is(":checked")
                    };
                    $(statusAnchor).text("Synchronization in progress ...");
					$(statusAnchor).load(
                        "modules/synchronize.xq", 
                        params,
                        function(responseText, status){if(status == 'success') {eXide.app.git.command($this.currentProject, 'commit', option);}}
                        );
                    
                    $(this).dialog("close");
                },
                "Cancel": function () { $(this).dialog("close"); }
			}
		});
        
	};
	
    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    Constr.prototype.download = function (collection) {
        var indentOnDownloadPackage = $("#indent-on-download-package").is(":checked");
        var expandXIncludesOnDownloadPackage = $("#expand-xincludes-on-download-package").is(":checked");
        var omitXMLDeclatarionOnDownloadPackage = $("#omit-xml-declaration-on-download-package").is(":checked");
        window.location.href = "modules/deployment.xq?download=true&collection=" + encodeURIComponent(collection) + "&indent=" + indentOnDownloadPackage + "&expand-xincludes=" + expandXIncludesOnDownloadPackage + "&omit-xml-decl=" + omitXMLDeclatarionOnDownloadPackage;
    };
    
	/**
	 * Synchronize current application package to file system directory.
	 */
	Constr.prototype.synchronize = function (collection) {
		var $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
			if (!eXide.app.login.isAdmin) {
				eXide.util.error("You need to be logged in as an admin user with dba role " +
						"to use this feature.");
				return;
			}
            $("#synchronize-report").empty();
            $this.currentProject = project;
            $this.syncDialog.find(".project-name").text(project.abbrev);
			$this.syncDialog.find("input[name=\"start\"]").val(project.deployed);
            if (project.dir) {
                $this.syncDialog.find("input[name=\"dir\"]").val(project.dir);
            } else {
                $this.syncDialog.find("input[name=\"dir\"]").val("");
            }
            $this.syncDialog.find("input[name=\"collection\"]").val(project.root);
            $this.syncDialog.find("input[name=\"auto\"]").attr("checked", project.autoSync);
			$this.syncDialog.dialog("open");
        });
	};
	
     Constr.prototype.autoSync = function (collection) {
         var project = this.projects.getProjectFor(collection);
         if (project && project.autoSync) {
             var params = {
                 collection: project.root,
                 start: project.deployed,
                 dir: project.dir,
                 indent: $("#indent-on-download-package").is(":checked"),
                 "expand-xincludes": $("#expand-xincludes-on-download-package").is(":checked"),
                 "omit-xml-declaration": $("#omit-xml-declaration-on-download-package").is(":checked")
             };
             $.ajax({
                url: "modules/synchronize.xq",
                type: "GET",
                data: params,
                success: function(data) {
                    eXide.util.message("Synchronized directory");
                }
             });
         }
     };
     
	Constr.prototype.runApp = function (collection, firstLoad) {
		var $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
                eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
            
            $this.runDialog.find("input[name='live-reload']").prop("checked", project.liveReload);
            
            $this.currentProject = project;
            var url = project.url.replace(/\/{2,}/, "/");
            var link = eXide.configuration.context + url + "/";

			var a = $this.runDialog.find("a");
			a.attr("href", link).attr("target", project.abbrev).text(link);
			
			if (firstLoad) {
			    $this.runDialog.find(".first-load").show();
			    $this.runDialog.find(".second-load").hide();
			} else {
			    $this.runDialog.find(".first-load").show();
			    $this.runDialog.find(".second-load").hide();
			}
            $this.runDialog.dialog("open");
        });
	};
    
    Constr.prototype.saveState = function () {
        this.projects.saveState();
    };
    
    Constr.prototype.restoreState = function () {
        this.projects.restoreState();
    };

    /**
	 * Git Checkout.
	 */
	Constr.prototype.gitCheckout = function (collection) {
		var $this = this;
        $this.projects.findProject(collection, function (project) {
            if (!project) {
               eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
			if (!eXide.app.login.isAdmin) {
				eXide.util.error("You need to be logged in as an admin user with dba role " +
						"to use this feature.");
				return;
			}
            $this.currentProject = project;
            
            var options = d3.select("#git-checkout-select").selectAll("option")
                .data(project.gitBranch)
                .attr('value', function(d){return d})
                .text(String);
                
                options.enter()
                    .append('option')
                    .attr('value', function(d){return d})
                    .text(String);
                
                options.exit().remove();
                
            $this.gitCheckoutDialog.dialog("open");
        })
	}
    /**
	 * Git Commit.
	 */
	Constr.prototype.gitCommit = function (collection) {
		var $this = this;
         $this.projects.findProject(collection, function (project) {
            if (!project) {
               eXide.util.error("Application not found: The document currently opened in the editor " +
                    "should belong to an application package.");
                return;
            }
			if (!eXide.app.login.isAdmin) {
				eXide.util.error("You need to be logged in as an admin user with dba role " +
						"to use this feature.");
				return;
			}
            $this.currentProject = project;
            $this.gitCommitDialog.dialog("open");
         })
	}

    
	return Constr;
}());