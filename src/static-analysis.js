/**
 * Static analysis for XQuery ASTs.
 *
 * Replaces xqlint's Translator — produces the same { markers: [] } result
 * containing namespace, variable-scoping, and function-declaration diagnostics.
 *
 * Exported as `staticAnalysis`.
 */

import { namespace } from "./namespace.js";
export const staticAnalysis = (function () {

    // ---- Marker constructors (same shape as xqlint Errors.js) ----

    const ERROR = "error";
    const WARNING = "warning";
    const LANG = "xquery";

    // Registered module prefixes fetched from the server at startup
    let registeredModulePrefixes = {};

    function warningMarker(pos, msg) {
        return { pos, lang: LANG, type: WARNING, level: WARNING, message: msg };
    }
    function unusedVarMarker(pos, name) {
        return {
            pos, lang: LANG, type: WARNING, level: WARNING,
            message: `$${name}: unused variable.`,
            hasResolution: true
        };
    }
    function XPST0008(pos, varname) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            message: `[XPST0008] "${varname}": undeclared variable.`
        };
    }
    function XQST0033(pos, prefix, ns) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            message: `[XQST0033] "${prefix}": namespace prefix already bound to "${ns}".`
        };
    }
    function XPST0081(pos, prefix, localName) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            prefix, localName,
            message: `[XPST0081] "${prefix}": can not expand namespace prefix to URI.`
        };
    }
    function XQST0039(pos, varname) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            message: `[XQST0039] "${varname}": duplicate parameter name.`
        };
    }
    function XQST0049(pos, varname) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            message: `[XQST0049] "${varname}": duplicate variable declaration.`
        };
    }
    function XQST0034(pos, functionName) {
        return {
            pos, lang: LANG, type: ERROR, level: ERROR,
            message: `[XQST0034] "${functionName}": duplicate function declaration.`
        };
    }

    // ---- Helpers ----

    function getNodeValue(node) {
        if (node.value !== undefined) return node.value;
        let v = "";
        for (let i = 0; i < node.children.length; i++) {
            v += getNodeValue(node.children[i]);
        }
        return v;
    }

    // ---- Main analysis ----

    function analyze(ast) {
        const markers = [];

        // -- Namespace tracking --
        const namespaces = {
            // W3C standard prefixes (always known)
            "local": "http://www.w3.org/2005/xquery-local-functions",
            "xs": "http://www.w3.org/2001/XMLSchema",
            "fn": "http://www.w3.org/2005/xpath-functions",
            "math": "http://www.w3.org/2005/xpath-functions/math",
            "map": "http://www.w3.org/2005/xpath-functions/map",
            "array": "http://www.w3.org/2005/xpath-functions/array",
            "err": "http://www.w3.org/2005/xqt-error",
            "output": "http://www.w3.org/2010/xslt-xquery-serialization"
        };
        // Merge server-registered module prefixes (fetched at startup)
        for (const p in registeredModulePrefixes) {
            if (!namespaces[p]) {
                namespaces[p] = registeredModulePrefixes[p];
            }
        }
        const declaredNS = {
            "jn": { ns: "http://www.jsoniq.org/functions", pos: { sl: 0, sc: 0, el: 0, ec: 0 }, type: "module", auto: true },
            "fn": { ns: "http://www.w3.org/2005/xpath-functions", pos: { sl: 0, sc: 0, el: 0, ec: 0 }, type: "module", auto: true }
        };
        const referencedPrefixes = {};

        // -- Variable scoping (simple scope stack, no StaticContext class) --
        function makeScope(pos, parent) {
            return { pos: { sl: pos.sl, sc: pos.sc, el: pos.el, ec: pos.ec },
                     parent, children: [], varDecls: {}, varRefs: {} };
        }

        const rootSctx = makeScope(ast.pos, undefined);
        let sctx = rootSctx;

        function pushSctx(pos) {
            const child = makeScope(pos, sctx);
            sctx.children.push(child);
            sctx = child;
        }

        function popSctx(pos) {
            if (pos !== undefined) {
                sctx.pos.el = pos.el;
                sctx.pos.ec = pos.ec;
            }
            const varDecls = sctx.varDecls;
            const varRefs = sctx.varRefs;

            // Unused variable warnings
            for (const name in varDecls) {
                if (varRefs[name] === undefined && varDecls[name].kind !== "VarDecl") {
                    markers.push(unusedVarMarker(varDecls[name].pos, name));
                }
            }

            // Undeclared variable references
            for (const name in varRefs) {
                if (varDecls[name] === undefined) {
                    if (sctx.parent.parent === undefined) {
                        // At top-level: emit error
                        const refs = varRefs[name];
                        for (let j = 0; j < refs.length; j++) {
                            markers.push(XPST0008(refs[j].pos, name));
                        }
                    } else {
                        // Nested: bubble up
                        if (sctx.parent.varRefs[name] === undefined) {
                            sctx.parent.varRefs[name] = [];
                        }
                        sctx.parent.varRefs[name] = sctx.parent.varRefs[name].concat(varRefs[name]);
                    }
                }
            }

            sctx = sctx.parent;
        }

        // -- Function tracking --
        const declaredFunctions = {};
        const declaredVariables = {};

        // -- FLWOR clause counting --
        const clauseCount = [];
        const statementCount = [];

        // -- Function declaration state --
        let fnParams = [];
        let isExternal = false;
        let decl = {};

        // -- FunctionCall state --
        let arity = 0;

        // ---- VarHandler (for bindings) ----
        function VarHandler(node) {
            this.ExprSingle = this.VarValue = this.VarDefaultValue = function () {
                return true;
            };

            this.VarName = this.EQName = function (varName) {
                const value = getNodeValue(varName);
                if (value.substring(0, 2) !== "Q{") {
                    if (sctx.varDecls[value] === undefined) {
                        sctx.varDecls[value] = { pos: varName.pos, kind: node.name };
                    } else if (node.name === "Param") {
                        markers.push(XQST0039(node.pos, value));
                    } else {
                        markers.push(XQST0049(node.pos, value));
                    }
                }
            };
        }

        // ---- Visitor ----
        const visitor = {};

        visitor.visit = function (node) {
            const name = node.name;
            let skip = false;
            if (typeof visitor[name] === "function") {
                skip = visitor[name](node) === true;
            }
            if (!skip) {
                visitor.visitChildren(node);
            }
        };

        visitor.visitChildren = function (node, handler) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (handler !== undefined && typeof handler[child.name] === "function") {
                    handler[child.name](child);
                } else {
                    visitor.visit(child);
                }
            }
        };

        visitor.visitExprSingles = function (node) {
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                if (child.name === "ExprSingle" || child.name === "VarValue" || child.name === "VarDefaultValue") {
                    visitor.visit(child);
                }
            }
        };

        // ---- Node handlers ----

        visitor.XQuery = function (node) {
            pushSctx(node.pos);
            visitor.visitChildren(node);
            popSctx(node.pos);

            // Check for unused namespace prefixes
            const dNS = {};
            for (const prefix in declaredNS) {
                const ns = declaredNS[prefix].ns;
                const pos = declaredNS[prefix].pos;
                const type = declaredNS[prefix].type;
                if (referencedPrefixes[prefix] === undefined && declaredNS[prefix].auto === undefined) {
                    const err = warningMarker(pos, `"${prefix}": unused namespace prefix.`);
                    err.prefix = prefix;
                    err.ns = ns;
                    err.nsType = type;
                    markers.push(err);
                }
                if (dNS[ns] === undefined) {
                    dNS[ns] = { prefix, positions: [pos] };
                } else if (type !== "schema") {
                    dNS[ns].positions.push(pos);
                }
            }
            // Warn on duplicate NS URIs
            for (const ns in dNS) {
                const prefix = dNS[ns].prefix;
                const positions = dNS[ns].positions;
                if (positions.length > 1) {
                    for (let i = 1; i < positions.length; i++) {
                        markers.push(warningMarker(positions[i],
                            `"${ns}": is already available with the prefix "${prefix}".`));
                    }
                }
            }
            return true;
        };

        visitor.ModuleDecl = function (node) {
            const Handler = function () {
                let prefix = "";
                this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                this.URILiteral = function (uri) {
                    let ns = getNodeValue(uri);
                    ns = ns.substring(1, ns.length - 1);
                    namespaces[prefix] = ns;
                };
            };
            visitor.visitChildren(node, new Handler());
            return true;
        };

        visitor.ModuleImport = function (node) {
            const handler = new function () {
                let prefix = "";
                let moduleURI = null;
                this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                this.URILiteral = function (uri) {
                    uri = getNodeValue(uri);
                    uri = uri.substring(1, uri.length - 1);
                    if (moduleURI === null) {
                        moduleURI = uri;
                        if (declaredNS[prefix] === undefined) {
                            declaredNS[prefix] = { ns: moduleURI, pos: node.pos, type: "module" };
                            namespaces[prefix] = moduleURI;
                        } else {
                            markers.push(XQST0033(node.pos, prefix, moduleURI));
                        }
                    }
                };
            };
            visitor.visitChildren(node, handler);
            return true;
        };

        visitor.SchemaImport = function (node) {
            const handler = new function () {
                let prefix = "";
                let schemaURI = null;
                this.SchemaPrefix = function (schemaPrefix) {
                    const Handler = function () {
                        this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                    };
                    visitor.visitChildren(schemaPrefix, new Handler());
                };
                this.URILiteral = function (uri) {
                    uri = getNodeValue(uri);
                    uri = uri.substring(1, uri.length - 1);
                    if (schemaURI === null) {
                        schemaURI = uri;
                        if (declaredNS[prefix] === undefined) {
                            declaredNS[prefix] = { ns: schemaURI, pos: node.pos, type: "schema" };
                        } else {
                            markers.push(XQST0033(node.pos, prefix, schemaURI));
                        }
                    }
                };
            };
            visitor.visitChildren(node, handler);
            return true;
        };

        visitor.NamespaceDecl = function (node) {
            const handler = new function () {
                let prefix = "";
                this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                this.URILiteral = function (uri) {
                    let moduleURI = getNodeValue(uri);
                    moduleURI = moduleURI.substring(1, moduleURI.length - 1);
                    if (declaredNS[prefix] === undefined) {
                        declaredNS[prefix] = { ns: moduleURI, pos: node.pos, type: "decl" };
                    } else {
                        markers.push(XQST0033(node.pos, prefix, moduleURI));
                    }
                };
            };
            visitor.visitChildren(node, handler);
            return true;
        };

        // The default element/function namespace is not checked; returning true keeps
        // the visitor out of the declaration's children.
        visitor.DefaultNamespaceDecl = function () {
            return true;
        };

        // -- Statement scoping --
        visitor.StatementsAndOptionalExpr = function (node) {
            pushSctx(node.pos);
            statementCount.push(0);
            visitor.visitChildren(node);
            for (let i = 1; i <= statementCount[statementCount.length - 1]; i++) {
                popSctx(node.pos);
            }
            statementCount.pop();
            popSctx();
            return true;
        };

        visitor.StatementsAndExpr = function (node) {
            pushSctx(node.pos);
            statementCount.push(0);
            visitor.visitChildren(node);
            for (let i = 1; i <= statementCount[statementCount.length - 1]; i++) {
                popSctx(node.pos);
            }
            statementCount.pop();
            popSctx();
            return true;
        };

        visitor.BlockStatement = function (node) {
            pushSctx(node.pos);
            statementCount.push(0);
            visitor.visitChildren(node);
            for (let i = 1; i <= statementCount[statementCount.length - 1]; i++) {
                popSctx(node.pos);
            }
            statementCount.pop();
            popSctx();
            return true;
        };

        // -- FLWOR --
        visitor.FLWORExpr = function (node) {
            pushSctx(node.pos);
            clauseCount.push(0);
            visitor.visitChildren(node);
            for (let i = 1; i <= clauseCount[clauseCount.length - 1]; i++) {
                popSctx(node.pos);
            }
            clauseCount.pop();
            popSctx();
            return true;
        };

        visitor.LetBinding = function (node) {
            visitor.visitExprSingles(node);
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.ForBinding = function (node) {
            visitor.visitExprSingles(node);
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.TumblingWindowClause = function (node) {
            visitor.visitExprSingles(node);
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.WindowVars = function (node) {
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.SlidingWindowClause = function (node) {
            visitor.visitExprSingles(node);
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.PositionalVar = function (node) {
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.CurrentItem = function (node) {
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.PreviousItem = function (node) {
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.NextItem = function (node) {
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        visitor.CountClause = function (node) {
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;
            visitor.visitChildren(node, new VarHandler(node));
            return true;
        };

        let isGroupDecl = false;
        visitor.GroupingSpec = function (node) {
            isGroupDecl = false;
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;

            for (let i = 0; i < node.children.length; i++) {
                if (node.children[i].value === ":=") {
                    isGroupDecl = true;
                }
            }

            return false;
        };

        visitor.GroupingVariable = function (node) {
            if (isGroupDecl) {
                visitor.visitChildren(node, new VarHandler(node));
            } else {
                visitor.VarRef(node);
            }
            return false;
        };

        // -- QuantifiedExpr / TransformExpr --
        visitor.TransformExpr = function (node) {
            pushSctx(node.pos);
            visitor.visitExprSingles(node);
            visitor.visitChildren(node, new VarHandler(node));
            popSctx();
            return true;
        };

        visitor.QuantifiedExpr = function (node) {
            pushSctx(node.pos);
            visitor.visitExprSingles(node);
            visitor.visitChildren(node, new VarHandler(node));
            popSctx();
            return true;
        };

        // -- Param --
        visitor.Param = function (node) {
            if (!isExternal) {
                visitor.visitChildren(node, new VarHandler(node));
            }
            fnParams.push({
                name: `$${getNodeValue(node.children[1])}`
            });
            return true;
        };

        // -- VarDecl / VarDeclStatement --
        visitor.VarDecl = visitor.VarDeclStatement = function (node) {
            const isStmt = (node.name === "VarDeclStatement");
            const varNames = [];

            const VarDeclHandler = function (decls) {
                this.ExprSingle = function () { return true; };
                this.VarName = function (vnode) {
                    const varName = getNodeValue(vnode);
                    varNames.push(varName);
                    if (decls[varName]) {
                        markers.push(XQST0049(vnode.pos, varName));
                    }
                };
                this.TypeDeclaration = function () {};
                this.TOKEN = function (tok) {
                    if (tok.value === "external") {
                        decl.isExternal = true;
                    }
                };
            };

            let decls;
            if (isStmt) {
                visitor.visitExprSingles(node);
                pushSctx(node.pos);
                statementCount[statementCount.length - 1]++;
                decls = sctx.varDecls;
            } else {
                pushSctx(node.pos);
                visitor.visitExprSingles(node);
                popSctx();
                decls = declaredVariables;
            }

            visitor.visitChildren(node, new VarDeclHandler(decls));

            varNames.forEach((curName) => {
                const newDecl = { pos: node.pos, kind: node.name };
                decls[curName] = decls[curName] || newDecl;
                if (!isStmt) {
                    const firstSctx = rootSctx.children[0];
                    if (firstSctx) {
                        firstSctx.varDecls[curName] = firstSctx.varDecls[curName] || newDecl;
                    }
                }
            });

            return true;
        };

        // -- AnnotatedDecl (wraps FunctionDecl and VarDecl) --
        visitor.AnnotatedDecl = function (node) {
            decl = { pos: node.pos, annotations: {} };

            const Handler = function () {
                this.FunctionDecl = function (fnode) {
                    isExternal = fnode.children[fnode.children.length - 1].value &&
                                 fnode.children[fnode.children.length - 1].value === "external";
                    fnParams = [];
                    let eQName = "";
                    pushSctx(fnode.pos);
                    const FnHandler = function () {
                        this.EQName = function (eqnode) {
                            eQName = getNodeValue(eqnode);
                        };
                    };
                    visitor.visitChildren(fnode, new FnHandler());
                    popSctx();

                    const fnArity = fnParams.length;
                    fnode.arity = `${fnArity}`;
                    if (declaredFunctions[eQName] &&
                        declaredFunctions[eQName][fnArity] !== undefined) {
                        markers.push(XQST0034(fnode.pos, eQName));
                    } else {
                        if (declaredFunctions[eQName] === undefined) {
                            declaredFunctions[eQName] = {};
                        }
                        declaredFunctions[eQName][fnArity] = decl;
                    }
                    return true;
                };
            };

            visitor.visitChildren(node, new Handler());
            return true;
        };

        // -- FunctionCall --
        visitor.FunctionCall = function (node) {
            arity = 0;
            visitor.visitChildren(node);
            node.arity = arity;
            return true;
        };

        visitor.Argument = function () {
            arity++;
            return false;
        };

        // -- EQName --
        visitor.EQName = function (node) {
            const value = getNodeValue(node);
            if (value.substring(0, 2) !== "Q{" && value.indexOf(":") !== -1) {
                const prefix = value.substring(0, value.indexOf(":"));
                const localName = value.substring(value.indexOf(":") + 1);
                if (declaredNS[prefix] === undefined && namespaces[prefix] === undefined) {
                    markers.push(XPST0081(node.pos, prefix, localName));
                } else {
                    referencedPrefixes[prefix] = true;
                }
            }
            return false;
        };

        visitor.QName = function (node) {
            const value = getNodeValue(node);
            if (value.indexOf(":") !== -1) {
                const prefix = value.substring(0, value.indexOf(":"));
                referencedPrefixes[prefix] = true;
            }
            return false;
        };

        visitor.Wildcard = function (node) {
            const value = getNodeValue(node);
            const prefix = value.substring(0, value.indexOf(":"));
            if (prefix !== "*") {
                referencedPrefixes[prefix] = true;
            }
            return true;
        };

        // -- VarRef --
        visitor.VarRef = function (node) {
            const value = getNodeValue(node).substring(1);
            if (value.substring(0, 2) !== "Q{" && value.indexOf(":") === -1) {
                if (sctx.varRefs[value] === undefined) {
                    sctx.varRefs[value] = [];
                }
                const pos = { sl: node.pos.sl, sc: node.pos.sc + 1, el: node.pos.el, ec: node.pos.ec };
                sctx.varRefs[value].push({ pos });
            }
            visitor.visitChildren(node);
            return true;
        };

        // -- WS (skip comment parsing — not needed for markers) --
        visitor.WS = function () {
            return true;
        };

        // -- Run --
        visitor.visit(ast);

        return { markers };
    }

    // Full module records from startup fetch (prefix, uri, at)
    let registeredModules = [];

    return {
        analyze,
        setRegisteredModules (modules) {
            registeredModulePrefixes = {};
            registeredModules = modules || [];
            for (let i = 0; i < modules.length; i++) {
                if (modules[i].prefix && modules[i].uri) {
                    registeredModulePrefixes[modules[i].prefix] = modules[i].uri;
                }
            }
        },
        getModuleByPrefix (prefix) {
            for (let i = 0; i < registeredModules.length; i++) {
                if (registeredModules[i].prefix === prefix) {
                    return registeredModules[i];
                }
            }
            return null;
        }
    };
})();

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").staticAnalysis = staticAnalysis;
