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

/**
 * CM6 autocompletion source for eXide.
 *
 * Replaces eXide.util.Popup-based autocomplete with CM6's native
 * autocompletion extension. Handles:
 *   - XQuery: functions, variables, templates, namespaces, module imports
 *   - Other modes: template snippets
 *
 * Context detection reuses XQueryModeHelper's AST analysis patterns.
 * Server-side data from /api/editor/completions (functions) and
 * /api/editor/modules (module imports).
 */
eXide.namespace("eXide.edit.CompletionSource");

eXide.edit.CompletionSource = (function () {

    var RE_FUNC_NAME = /^[\$\w:\-_\.]+/;

    // Reference to the eXide Editor instance, set during init
    var _editor = null;

    function init(editor) {
        _editor = editor;
    }

    /**
     * CM6 completion source function. Called by CM6 when completion is
     * triggered (Ctrl+Space or typing).
     */
    function completionSource(context) {
        if (!_editor || !_editor.activeDoc) return null;

        var doc = _editor.activeDoc;
        var helper = doc.getModeHelper();
        var syntax = doc.getSyntax();

        if (syntax === "xquery" && helper && helper.parseXQuery) {
            return xqueryCompletion(context, doc, helper);
        }
        // Other modes: template snippets only
        return templateCompletion(context, doc, helper);
    }

    // -------------------------------------------------------------------
    // XQuery completion
    // -------------------------------------------------------------------

    function xqueryCompletion(context, doc, helper) {
        helper.parseXQuery(doc);

        var state = context.state;
        var pos = context.pos;
        var lead = editorUtils.offsetToRowCol(state, pos);
        var token = "";
        var mode = "templates";
        var from = pos, to = pos;

        if (state.selection.main.empty) {
            var astNode = eXide.edit.XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
            if (!astNode) {
                // No AST node: scan preceding text
                mode = "functions";
                var lineNum = lead.row + 1;
                var line = (lineNum >= 1 && lineNum <= state.doc.lines) ? state.doc.line(lineNum).text : "";
                var start = lead.column - 1;
                var end = lead.column;
                while (start >= 0) {
                    var ch = line.substring(start, end);
                    if (ch.match(/^\$[\w:\-_\.]+$/)) break;
                    if (!ch.match(/^[\w:\-_\.]+$/)) { start++; break; }
                    start--;
                }
                if (start < 0) start = 0;
                token = line.substring(start, end);
                from = editorUtils.rowColToOffset(state, lead.row, start);
                to = editorUtils.rowColToOffset(state, lead.row, end);

                if (token === "" && !context.explicit) return null;

                if (token.substring(0, 1) === "$") {
                    mode = "variables";
                    token = token.substring(1);
                    // Keep from at the $ character
                }
            } else {
                var parent = astNode.getParent;
                if (parent.name === "VarRef" || parent.name === "VarName") {
                    mode = "variables";
                    from = editorUtils.rowColToOffset(state, astNode.pos.sl,
                        astNode.name === "EQName" ? astNode.pos.sc - 1 : astNode.pos.sc);
                    to = editorUtils.rowColToOffset(state, astNode.pos.sl, astNode.pos.ec);
                    token = astNode.name === "EQName" ? astNode.value : "";
                    // Pass the VarRef ancestor to the InScopeVariables visitor
                    // (it matches on VarRef/VarName nodes, not EQName leaves)
                    astNode = parent.name === "VarName" && parent.getParent &&
                        parent.getParent.name === "VarRef" ? parent.getParent : parent;
                } else {
                    var importStmt = eXide.edit.XQueryUtils.findAncestor(astNode, "Import");
                    var nsDeclStmt = eXide.edit.XQueryUtils.findAncestor(astNode, "NamespaceDecl");
                    if (importStmt) {
                        mode = "modules";
                        if (astNode.name === "NCName") {
                            token = astNode.value;
                        } else if (astNode.name === "URILiteral") {
                            var prefix = eXide.edit.XQueryUtils.findSibling(astNode, "NCName");
                            if (prefix) token = eXide.edit.XQueryUtils.getValue(prefix);
                        }
                        from = editorUtils.rowColToOffset(state, importStmt.pos.sl, importStmt.pos.sc);
                        var endCol = importStmt.pos.ec;
                        var separator = eXide.edit.XQueryUtils.findNext(importStmt, "Separator");
                        if (separator) endCol = separator.pos.ec;
                        to = editorUtils.rowColToOffset(state, importStmt.pos.sl, endCol);
                    } else if (nsDeclStmt) {
                        mode = "namespaces";
                        if (astNode.name === "NCName") {
                            token = astNode.value;
                        } else if (astNode.name === "URILiteral") {
                            var nsPrefix = eXide.edit.XQueryUtils.findSibling(astNode, "NCName");
                            if (nsPrefix) token = eXide.edit.XQueryUtils.getValue(nsPrefix);
                        }
                        from = editorUtils.rowColToOffset(state, nsDeclStmt.pos.sl, nsDeclStmt.pos.sc);
                        var nsEndCol = nsDeclStmt.pos.ec;
                        var nsSep = eXide.edit.XQueryUtils.findNext(nsDeclStmt, "Separator");
                        if (nsSep) nsEndCol = nsSep.pos.ec;
                        to = editorUtils.rowColToOffset(state, nsDeclStmt.pos.sl, nsEndCol);
                    } else if (astNode.name === "EQName") {
                        mode = "functions";
                        token = astNode.value;
                        from = editorUtils.rowColToOffset(state, astNode.pos.sl, astNode.pos.sc);
                        to = editorUtils.rowColToOffset(state, astNode.pos.sl, astNode.pos.ec);
                    } else {
                        if (!context.explicit) return null;
                    }
                }
            }
        } else {
            mode = "templates";
        }

        if (!context.explicit && mode === "templates") return null;

        // Dispatch to appropriate completion fetcher
        if (mode === "functions") {
            return fetchFunctionCompletions(doc, helper, token, from, to);
        } else if (mode === "variables") {
            return getVariableCompletions(doc, helper, token, from, to, astNode);
        } else if (mode === "modules") {
            return fetchModuleCompletions(doc, token, from, to);
        } else if (mode === "namespaces") {
            return fetchNamespaceCompletions(doc, token, from, to);
        } else {
            return getTemplateCompletions(doc, helper, token, from, to);
        }
    }

    // -------------------------------------------------------------------
    // Function completions (async — server fetch)
    // -------------------------------------------------------------------

    function fetchFunctionCompletions(doc, helper, prefix, from, to) {
        var params = new URLSearchParams({ prefix: prefix });

        // Add module import params for imported function lookup
        var code = doc.getText();
        var imports = helper.$parseImports(code);
        if (imports) {
            var basePath = "xmldb:exist://" + doc.getBasePath();
            params.set("base", basePath);
            for (var i = 0; i < imports.length; i++) {
                var matches = helper.moduleRe.exec(imports[i]);
                if (matches != null && matches.length === 4) {
                    params.append("mprefix", matches[1]);
                    params.append("uri", matches[2]);
                    params.append("source", matches[3]);
                }
            }
        }

        return fetch("api/editor/completions?" + params.toString())
            .then(function (response) { return response.json(); })
            .then(function (serverFuncs) {
                var options = [];
                var regex = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

                // Local functions from AST
                doc.functions.forEach(function (func) {
                    if (func.type !== "variable" && func.name && func.name.match(regex)) {
                        options.push(makeFunctionOption(func.signature || func.name,
                            func.template || null, func.help || null, null, null,
                            func.source || doc.getPath()));
                    }
                });

                // Server functions (from /api/editor/completions)
                if (serverFuncs) {
                    for (var i = 0; i < serverFuncs.length; i++) {
                        var f = serverFuncs[i];
                        options.push(makeFunctionOption(
                            f.text, f.snippet, null,
                            f.description, f.arguments,
                            f.path));
                    }
                }

                // Template snippets
                var templates = eXide.util.Snippets.getTemplates(doc, prefix);
                for (var j = 0; j < templates.length; j++) {
                    options.push({
                        label: "[S] " + templates[j].name,
                        type: "text",
                        boost: -10,
                        apply: makeSnippetApply(templates[j].template, from, to)
                    });
                }

                if (options.length === 0) return null;
                return { from: from, to: to, options: options, filter: true, validFor: /^[\w:.\-$]*$/ };
            })
            .catch(function () { return null; });
    }

    function makeFunctionOption(signature, snippet, helpHtml, description, args, path) {
        var option = {
            label: signature,
            type: "function",
            apply: function (view, completion, from, to) {
                // Use the snippet template if available, otherwise parse from signature
                var template = snippet || eXide.util.parseSignature(signature);
                view.dispatch({ changes: { from: from, to: to } });
                editorUtils.insertSnippet(view, template);
            }
        };

        // info panel — shown when the user highlights this completion
        option.info = function () {
            return buildInfoDOM(signature, description, args, helpHtml, path);
        };

        return option;
    }

    /**
     * Build the info panel DOM for a function completion.
     * Renders structured data from completions API (description + per-param details)
     * or falls back to legacy HTML help.
     */
    function buildInfoDOM(signature, description, args, helpHtml, path) {
        var div = document.createElement("div");
        div.className = "cm-completion-info-funcdoc";

        if (description || (args && args.length > 0)) {
            if (description) {
                var p = document.createElement("p");
                p.textContent = description;
                div.appendChild(p);
            }
            if (args && args.length > 0) {
                var dl = document.createElement("dl");
                for (var i = 0; i < args.length; i++) {
                    var dt = document.createElement("dt");
                    dt.textContent = "$" + args[i].name + " as " + args[i].type;
                    dl.appendChild(dt);
                    if (args[i].description) {
                        var dd = document.createElement("dd");
                        dd.textContent = args[i].description;
                        dl.appendChild(dd);
                    }
                }
                div.appendChild(dl);
            }
        } else if (helpHtml) {
            div.innerHTML = helpHtml;
        }

        if (path) {
            var src = document.createElement("div");
            src.className = "cm-completion-info-source";
            src.textContent = path;
            div.appendChild(src);
        }

        return div;
    }

    // -------------------------------------------------------------------
    // Variable completions (sync — from AST)
    // -------------------------------------------------------------------

    function getVariableCompletions(doc, helper, prefix, from, to, astNode) {
        var options = [];
        var prefixRegex = prefix ? new RegExp("^\\$?" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : null;

        // In-scope variables from AST visitor
        if (astNode) {
            var visitor = new eXide.edit.InScopeVariables(doc.ast, astNode);
            var variables = visitor.getStack();
            if (variables) {
                for (var i = 0; i < variables.length; i++) {
                    if (!prefix || prefixRegex.test(variables[i])) {
                        options.push({
                            label: "$" + variables[i],
                            type: "variable",
                            apply: function (view, completion, f, t) {
                                view.dispatch({
                                    changes: { from: f, to: t, insert: completion.label },
                                    selection: { anchor: f + completion.label.length }
                                });
                            }
                        });
                    }
                }
            }
        }

        // Global variables from doc.functions
        for (var j = 0; j < doc.functions.length; j++) {
            if (doc.functions[j].type === "variable" && (!prefix || prefixRegex.test(doc.functions[j].name))) {
                options.push({
                    label: "$" + doc.functions[j].name,
                    type: "variable"
                });
            }
        }

        if (options.length === 0) return null;
        return { from: from, to: to, options: options, filter: true, validFor: /^[\w:.\-$]*$/ };
    }

    // -------------------------------------------------------------------
    // Module import completions (async — server fetch)
    // -------------------------------------------------------------------

    function fetchModuleCompletions(doc, prefix, from, to) {
        return fetch("api/editor/modules?" + new URLSearchParams({ prefix: prefix }))
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data) return null;
                var options = [];
                for (var i = 0; i < data.length; i++) {
                    var template;
                    if (data[i].at) {
                        template = "import module namespace " + data[i].prefix + "=\"" + data[i].uri +
                            "\" at \"" + data[i].at + "\";";
                    } else {
                        template = "import module namespace " + data[i].prefix + "=\"" + data[i].uri + "\";";
                    }
                    options.push({
                        label: data[i].prefix + " — " + data[i].uri,
                        detail: data[i].at || "",
                        type: "keyword",
                        apply: makeReplaceApply(template, from, to)
                    });
                }
                if (options.length === 0) return null;
                // Module completions replace the entire import statement — don't filter
                return { from: from, to: to, options: options, filter: false };
            })
            .catch(function () { return null; });
    }

    // -------------------------------------------------------------------
    // Namespace completions (async — fetch JSON)
    // -------------------------------------------------------------------

    function fetchNamespaceCompletions(doc, prefix, from, to) {
        return fetch("templates/namespaces.json")
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data) return null;
                var options = [];
                for (var key in data) {
                    if (!key || key === prefix) {
                        var template = "declare namespace " + key + "=\"" + data[key] + "\";";
                        options.push({
                            label: key + " — " + data[key],
                            type: "keyword",
                            apply: makeReplaceApply(template, from, to)
                        });
                    }
                }
                if (options.length === 0) return null;
                return { from: from, to: to, options: options, filter: false };
            })
            .catch(function () { return null; });
    }

    // -------------------------------------------------------------------
    // Template/snippet completions (sync)
    // -------------------------------------------------------------------

    function getTemplateCompletions(doc, helper, prefix, from, to) {
        var templates = eXide.util.Snippets.getTemplates(doc, prefix);
        if (templates.length === 0) return null;
        var options = [];
        for (var i = 0; i < templates.length; i++) {
            options.push({
                label: "[S] " + templates[i].name,
                type: "text",
                apply: makeSnippetApply(templates[i].template, from, to)
            });
        }
        return { from: from, to: to, options: options, filter: true, validFor: /^[\w:.\-$]*$/ };
    }

    // -------------------------------------------------------------------
    // Non-XQuery completion (template snippets from base ModeHelper)
    // -------------------------------------------------------------------

    function templateCompletion(context, doc, helper) {
        if (!context.explicit) return null;

        var state = context.state;
        var pos = context.pos;
        var lead = editorUtils.offsetToRowCol(state, pos);
        var from = pos, to = pos;

        if (state.selection.main.empty) {
            var lineNum = lead.row + 1;
            var line = (lineNum >= 1 && lineNum <= state.doc.lines) ? state.doc.line(lineNum).text : "";
            var start = lead.column - 1;
            var end = lead.column;
            while (start >= 0) {
                var ch = line.substring(start, end);
                if (ch.match(/^\$[\w:\-_\.]+$/)) break;
                if (!ch.match(/^[\w:\-_\.]+$/)) { start++; break; }
                start--;
            }
            if (start < 0) start = 0;
            var token = line.substring(start, end);
            from = editorUtils.rowColToOffset(state, lead.row, start);
            to = editorUtils.rowColToOffset(state, lead.row, end);

            var templates = eXide.util.Snippets.getTemplates(doc, token);
            if (templates.length === 0) return null;
            var options = [];
            for (var i = 0; i < templates.length; i++) {
                options.push({
                    label: "[S] " + templates[i].name,
                    type: "text",
                    apply: makeSnippetApply(templates[i].template, from, to)
                });
            }
            return { from: from, to: to, options: options, filter: true, validFor: /^[\w:.\-$]*$/ };
        }

        return null;
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    /**
     * Create an apply function that replaces from→to with a snippet template.
     */
    function makeSnippetApply(template, origFrom, origTo) {
        return function (view, completion, from, to) {
            // CM6 passes the matched range; use it for replacement
            view.dispatch({ changes: { from: from, to: to } });
            editorUtils.insertSnippet(view, template);
        };
    }

    /**
     * Create an apply function that replaces a fixed range with literal text
     * (for module imports and namespace declarations that replace entire statements).
     */
    function makeReplaceApply(text, fixedFrom, fixedTo) {
        return function (view) {
            view.dispatch({
                changes: { from: fixedFrom, to: fixedTo, insert: text },
                selection: { anchor: fixedFrom + text.length }
            });
        };
    }

    return {
        init: init,
        completionSource: completionSource
    };
}());
