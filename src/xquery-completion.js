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

import { namespace } from "./namespace.js";
import { editorUtils } from "./editor-utils.js";
import { Snippets } from "./snippets.js";
import { util } from "./util.js";
import { InScopeVariables, XQueryUtils } from "./xquery-utils.js";

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
export const CompletionSource = (function () {

    const RE_FUNC_NAME = /^[\$\w:\-_\.]+/;

    // Reference to the eXide Editor instance, set during init
    let _editor = null;

    function init(editor) {
        _editor = editor;
    }

    /**
     * CM6 completion source function. Called by CM6 when completion is
     * triggered (Ctrl+Space or typing).
     */
    function completionSource(context) {
        if (!_editor || !_editor.activeDoc) return null;

        const doc = _editor.activeDoc;
        const helper = doc.getModeHelper();
        const syntax = doc.getSyntax();

        if (syntax === "xquery" && helper && helper.parseXQuery) {
            return xqueryCompletion(context, doc, helper);
        }
        // Delegate to CM6's native completion sources for supported modes
        if (syntax === "html" && CM6.htmlCompletionSource) {
            return CM6.htmlCompletionSource(context);
        }
        if ((syntax === "css" || syntax === "less") && CM6.cssCompletionSource) {
            return CM6.cssCompletionSource(context);
        }
        if ((syntax === "javascript" || syntax === "json") && CM6.localCompletionSource) {
            return CM6.localCompletionSource(context);
        }
        // Other modes: template snippets only
        return templateCompletion(context, doc, helper);
    }

    // -------------------------------------------------------------------
    // XQuery completion
    // -------------------------------------------------------------------

    function xqueryCompletion(context, doc, helper) {
        helper.parseXQuery(doc);

        const state = context.state;
        const pos = context.pos;
        const lead = editorUtils.offsetToRowCol(state, pos);
        let token = "";
        let mode = "templates";
        let from = pos, to = pos;
        let astNode = null;

        if (state.selection.main.empty) {
            astNode = XQueryUtils.findNode(doc.ast, { line: lead.row, col: lead.column });
            if (!astNode) {
                // No AST node: scan preceding text
                mode = "functions";
                const lineNum = lead.row + 1;
                const line = (lineNum >= 1 && lineNum <= state.doc.lines) ? state.doc.line(lineNum).text : "";
                let start = lead.column - 1;
                const end = lead.column;
                while (start >= 0) {
                    const ch = line.substring(start, end);
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
                const parent = astNode.getParent;
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
                    const importStmt = XQueryUtils.findAncestor(astNode, "Import");
                    const nsDeclStmt = XQueryUtils.findAncestor(astNode, "NamespaceDecl");
                    if (importStmt) {
                        mode = "modules";
                        if (astNode.name === "NCName") {
                            token = astNode.value;
                        } else if (astNode.name === "URILiteral") {
                            const prefix = XQueryUtils.findSibling(astNode, "NCName");
                            if (prefix) token = XQueryUtils.getValue(prefix);
                        }
                        from = editorUtils.rowColToOffset(state, importStmt.pos.sl, importStmt.pos.sc);
                        let endCol = importStmt.pos.ec;
                        const separator = XQueryUtils.findNext(importStmt, "Separator");
                        if (separator) endCol = separator.pos.ec;
                        to = editorUtils.rowColToOffset(state, importStmt.pos.sl, endCol);
                    } else if (nsDeclStmt) {
                        mode = "namespaces";
                        if (astNode.name === "NCName") {
                            token = astNode.value;
                        } else if (astNode.name === "URILiteral") {
                            const nsPrefix = XQueryUtils.findSibling(astNode, "NCName");
                            if (nsPrefix) token = XQueryUtils.getValue(nsPrefix);
                        }
                        from = editorUtils.rowColToOffset(state, nsDeclStmt.pos.sl, nsDeclStmt.pos.sc);
                        let nsEndCol = nsDeclStmt.pos.ec;
                        const nsSep = XQueryUtils.findNext(nsDeclStmt, "Separator");
                        if (nsSep) nsEndCol = nsSep.pos.ec;
                        to = editorUtils.rowColToOffset(state, nsDeclStmt.pos.sl, nsEndCol);
                    } else if (astNode.name === "EQName") {
                        mode = "functions";
                        token = astNode.value;
                        // Use cursor-relative scan for from/to instead of AST position,
                        // which can be unreliable for incomplete expressions
                        const lineNum2 = lead.row + 1;
                        const line2 = (lineNum2 >= 1 && lineNum2 <= state.doc.lines) ? state.doc.line(lineNum2).text : "";
                        let start2 = lead.column - 1;
                        while (start2 >= 0 && /[\w:\-_\.]/.test(line2.charAt(start2))) start2--;
                        start2++;
                        from = editorUtils.rowColToOffset(state, lead.row, start2);
                        to = editorUtils.rowColToOffset(state, lead.row, lead.column);
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
        const code = doc.getText();
        const basePath = "xmldb:exist://" + doc.getBasePath();

        // When prefix has no ":", also search default function namespace (fn:)
        const prefixes = [prefix];
        if (prefix && prefix.indexOf(":") === -1) {
            prefixes.push("fn:" + prefix);
        }

        return Promise.all(prefixes.map(function (p) {
            return fetch("api/query/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: code, prefix: p, base: basePath })
            }).then(function (response) { return response.json(); });
        }))
            .then(function (results) {
                let serverFuncs = [];
                for (let r = 0; r < results.length; r++) {
                    if (Array.isArray(results[r])) {
                        serverFuncs = serverFuncs.concat(results[r]);
                    }
                }
                const options = [];

                // Server functions (from /api/query/completions via lang:completions())
                // Includes both built-in/imported functions AND user-defined local functions
                if (serverFuncs) {
                    // Determine if we need to add a namespace prefix to server results.
                    // The server returns unprefixed names; if the user typed "fn:conc"
                    // we need to prefix the label, snippet, and filterText with "fn:".
                    let nsPart = "";
                    if (prefix.indexOf(":") !== -1) {
                        nsPart = prefix.substring(0, prefix.indexOf(":") + 1);
                    }
                    for (let i = 0; i < serverFuncs.length; i++) {
                        const f = serverFuncs[i];
                        // Only add nsPart when the server result doesn't already
                        // start with it (e.g. fn: fallback for unprefixed input)
                        const needsPrefix = nsPart && f.text && !f.text.startsWith(nsPart);
                        const label = needsPrefix ? nsPart + f.text : f.text;
                        const snip = f.snippet && needsPrefix ? nsPart + f.snippet : f.snippet;
                        const opt = makeFunctionOption(
                            label, snip, null, f.description, null, null);
                        const funcName = f.text ? f.text.replace(/\(.*$/, "") : "";
                        opt.filterText = needsPrefix ? nsPart + funcName : funcName;
                        options.push(opt);
                    }
                }

                // Template snippets
                const templates = Snippets.getTemplates(doc, prefix);
                for (let j = 0; j < templates.length; j++) {
                    options.push({
                        label: "[S] " + templates[j].name,
                        type: "text",
                        boost: -10,
                        apply: makeSnippetApply(templates[j].template, from, to)
                    });
                }

                if (options.length === 0) return null;
                return { from: from, to: to, options: options, filter: false };
            })
            .catch(function () { return null; });
    }

    function makeFunctionOption(signature, snippet, helpHtml, description, args, path) {
        const option = {
            label: signature,
            type: "function",
            apply: function (view, completion, from, to) {
                // Use the snippet template if available, otherwise parse from signature
                const template = snippet || util.parseSignature(signature);
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
        const div = document.createElement("div");
        div.className = "cm-completion-info-funcdoc";

        if (description || (args && args.length > 0)) {
            if (description) {
                const p = document.createElement("p");
                p.textContent = description;
                div.appendChild(p);
            }
            if (args && args.length > 0) {
                const dl = document.createElement("dl");
                for (let i = 0; i < args.length; i++) {
                    const dt = document.createElement("dt");
                    dt.textContent = "$" + args[i].name + " as " + args[i].type;
                    dl.appendChild(dt);
                    if (args[i].description) {
                        const dd = document.createElement("dd");
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
            const src = document.createElement("div");
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
        const options = [];
        const prefixRegex = prefix ? new RegExp("^\\$?" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : null;

        // In-scope variables from AST visitor
        if (astNode) {
            const visitor = new InScopeVariables(doc.ast, astNode);
            const variables = visitor.getStack();
            if (variables) {
                for (let i = 0; i < variables.length; i++) {
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
        for (let j = 0; j < doc.functions.length; j++) {
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
                const options = [];
                for (let i = 0; i < data.length; i++) {
                    let template;
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
                const options = [];
                for (const key in data) {
                    if (!key || key === prefix) {
                        const template = "declare namespace " + key + "=\"" + data[key] + "\";";
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
        const templates = Snippets.getTemplates(doc, prefix);
        if (templates.length === 0) return null;
        const options = [];
        for (let i = 0; i < templates.length; i++) {
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

        const state = context.state;
        const pos = context.pos;
        const lead = editorUtils.offsetToRowCol(state, pos);
        let from = pos, to = pos;

        if (state.selection.main.empty) {
            const lineNum = lead.row + 1;
            const line = (lineNum >= 1 && lineNum <= state.doc.lines) ? state.doc.line(lineNum).text : "";
            let start = lead.column - 1;
            const end = lead.column;
            while (start >= 0) {
                const ch = line.substring(start, end);
                if (ch.match(/^\$[\w:\-_\.]+$/)) break;
                if (!ch.match(/^[\w:\-_\.]+$/)) { start++; break; }
                start--;
            }
            if (start < 0) start = 0;
            const token = line.substring(start, end);
            from = editorUtils.rowColToOffset(state, lead.row, start);
            to = editorUtils.rowColToOffset(state, lead.row, end);

            const templates = Snippets.getTemplates(doc, token);
            if (templates.length === 0) return null;
            const options = [];
            for (let i = 0; i < templates.length; i++) {
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

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").CompletionSource = CompletionSource;
