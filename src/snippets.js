/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2013 Wolfgang Meier
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

eXide.namespace("eXide.util.Snippets");

/**
 * Manage and load text snippets for the different modes.
 */
eXide.util.Snippets = (function () {
    
    var SnippetManager = require("ace/snippets").snippetManager;
    
    var snippetsForMode = {};
    
    function load(mode) {
        if (snippetsForMode[mode]) {
            return;
        }
        snippetsForMode[mode] = [];
        $.ajax({
            url: "templates/" + mode + ".snippets", 
            dataType: "text",
            success: function(data) {
                var snippets = SnippetManager.parseSnippetFile(data);
                SnippetManager.register(snippets, mode);
                snippetsForMode[mode] = snippets;
            }
        });
    }
    
    function reload(mode, data) {
        var snippets = SnippetManager.parseSnippetFile(data);
        $.log("Replacing snippets %o for mode %s", snippets, mode);
        SnippetManager.register(snippets, mode);
        snippetsForMode[mode] = snippets;
    }
    
    function getTemplates(doc, prefix) {
        var snippets = snippetsForMode[doc.getSyntax()];
        var templates = [];
        for (var i = 0; i < snippets.length; i++) {
            if (!prefix || snippets[i].name.indexOf(prefix) == 0) {
                templates.push({
                    TYPE: eXide.edit.Document.TYPE_TEMPLATE,
                    name: snippets[i].name,
                    template: snippets[i].content
                });
            }
        }
        return templates;
    }
    
    return {
        init: load,
        getTemplates: getTemplates,
        reload: reload
    };
}());