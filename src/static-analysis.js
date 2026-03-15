/**
 * Static analysis for XQuery ASTs.
 *
 * Replaces xqlint's Translator — produces the same { markers: [] } result
 * containing namespace, variable-scoping, and function-declaration diagnostics.
 *
 * Browser global: staticAnalysis  (loaded via build.xml concat before xquery-helper.js)
 * Node/CommonJS:  module.exports = staticAnalysis
 */
var staticAnalysis = (function () {

    // ---- Marker constructors (same shape as xqlint Errors.js) ----

    var ERROR = "error";
    var WARNING = "warning";
    var LANG = "xquery";

    // Registered module prefixes fetched from the server at startup
    var registeredModulePrefixes = {};

    function warningMarker(pos, msg) {
        return { pos: pos, lang: LANG, type: WARNING, level: WARNING, message: msg };
    }
    function unusedVarMarker(pos, name) {
        return {
            pos: pos, lang: LANG, type: WARNING, level: WARNING,
            message: "$" + name + ": unused variable.",
            hasResolution: true
        };
    }
    function XPST0008(pos, varname) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            message: '[XPST0008] "' + varname + '": undeclared variable.'
        };
    }
    function XQST0033(pos, prefix, ns) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            message: '[XQST0033] "' + prefix + '": namespace prefix already bound to "' + ns + '".'
        };
    }
    function XPST0081(pos, prefix, localName) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            prefix: prefix, localName: localName,
            message: '[XPST0081] "' + prefix + '": can not expand namespace prefix to URI.'
        };
    }
    function XQST0039(pos, varname) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            message: '[XQST0039] "' + varname + '": duplicate parameter name.'
        };
    }
    function XQST0049(pos, varname) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            message: '[XQST0049] "' + varname + '": duplicate variable declaration.'
        };
    }
    function XQST0034(pos, functionName) {
        return {
            pos: pos, lang: LANG, type: ERROR, level: ERROR,
            message: '[XQST0034] "' + functionName + '": duplicate function declaration.'
        };
    }

    // ---- Helpers ----

    function getNodeValue(node) {
        if (node.value !== undefined) return node.value;
        var v = "";
        for (var i = 0; i < node.children.length; i++) {
            v += getNodeValue(node.children[i]);
        }
        return v;
    }

    // ---- Main analysis ----

    function analyze(ast) {
        var markers = [];

        // -- Namespace tracking --
        var namespaces = {
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
        for (var p in registeredModulePrefixes) {
            if (!namespaces[p]) {
                namespaces[p] = registeredModulePrefixes[p];
            }
        }
        var declaredNS = {
            "jn": { ns: "http://www.jsoniq.org/functions", pos: { sl: 0, sc: 0, el: 0, ec: 0 }, type: "module", auto: true },
            "fn": { ns: "http://www.w3.org/2005/xpath-functions", pos: { sl: 0, sc: 0, el: 0, ec: 0 }, type: "module", auto: true }
        };
        var referencedPrefixes = {};
        var defaultFnNs = "http://www.w3.org/2005/xpath-functions";

        // -- Variable scoping (simple scope stack, no StaticContext class) --
        function makeScope(pos, parent) {
            return { pos: { sl: pos.sl, sc: pos.sc, el: pos.el, ec: pos.ec },
                     parent: parent, children: [], varDecls: {}, varRefs: {} };
        }

        var rootSctx = makeScope(ast.pos, undefined);
        var sctx = rootSctx;

        function pushSctx(pos) {
            var child = makeScope(pos, sctx);
            sctx.children.push(child);
            sctx = child;
        }

        function popSctx(pos) {
            if (pos !== undefined) {
                sctx.pos.el = pos.el;
                sctx.pos.ec = pos.ec;
            }
            var varDecls = sctx.varDecls;
            var varRefs = sctx.varRefs;

            // Unused variable warnings
            for (var name in varDecls) {
                if (varRefs[name] === undefined && varDecls[name].kind !== "VarDecl") {
                    markers.push(unusedVarMarker(varDecls[name].pos, name));
                }
            }

            // Undeclared variable references
            for (var name in varRefs) {
                if (varDecls[name] === undefined) {
                    if (sctx.parent.parent === undefined) {
                        // At top-level: emit error
                        var refs = varRefs[name];
                        for (var j = 0; j < refs.length; j++) {
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
        var declaredFunctions = {};
        var declaredVariables = {};

        // -- FLWOR clause counting --
        var clauseCount = [];
        var statementCount = [];

        // -- Function declaration state --
        var fnParams = [];
        var isExternal = false;
        var decl = {};

        // -- FunctionCall state --
        var fnCall = false;
        var fnName = "";
        var arity = 0;

        // ---- VarHandler (for bindings) ----
        function VarHandler(node) {
            this.ExprSingle = this.VarValue = this.VarDefaultValue = function () {
                return true;
            };

            this.VarName = this.EQName = function (varName) {
                var value = getNodeValue(varName);
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
        var visitor = {};

        visitor.visit = function (node) {
            var name = node.name;
            var skip = false;
            if (typeof visitor[name] === "function") {
                skip = visitor[name](node) === true;
            }
            if (!skip) {
                visitor.visitChildren(node);
            }
        };

        visitor.visitChildren = function (node, handler) {
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                if (handler !== undefined && typeof handler[child.name] === "function") {
                    handler[child.name](child);
                } else {
                    visitor.visit(child);
                }
            }
        };

        visitor.visitExprSingles = function (node) {
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
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
            var dNS = {};
            for (var prefix in declaredNS) {
                var ns = declaredNS[prefix].ns;
                var pos = declaredNS[prefix].pos;
                var type = declaredNS[prefix].type;
                if (referencedPrefixes[prefix] === undefined && declaredNS[prefix].auto === undefined) {
                    var err = warningMarker(pos, '"' + prefix + '": unused namespace prefix.');
                    err.prefix = prefix;
                    err.ns = ns;
                    err.nsType = type;
                    markers.push(err);
                }
                if (dNS[ns] === undefined) {
                    dNS[ns] = { prefix: prefix, positions: [pos] };
                } else if (type !== "schema") {
                    dNS[ns].positions.push(pos);
                }
            }
            // Warn on duplicate NS URIs
            for (var ns in dNS) {
                var prefix = dNS[ns].prefix;
                var positions = dNS[ns].positions;
                if (positions.length > 1) {
                    for (var i = 1; i < positions.length; i++) {
                        markers.push(warningMarker(positions[i],
                            '"' + ns + '": is already available with the prefix "' + prefix + '".'));
                    }
                }
            }
            return true;
        };

        visitor.ModuleDecl = function (node) {
            var Handler = function () {
                var prefix = "";
                this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                this.URILiteral = function (uri) {
                    var ns = getNodeValue(uri);
                    ns = ns.substring(1, ns.length - 1);
                    namespaces[prefix] = ns;
                };
            };
            visitor.visitChildren(node, new Handler());
            return true;
        };

        visitor.ModuleImport = function (node) {
            var handler = new function () {
                var prefix = "";
                var moduleURI = null;
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
            var handler = new function () {
                var prefix = "";
                var schemaURI = null;
                this.SchemaPrefix = function (schemaPrefix) {
                    var Handler = function () {
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
            var handler = new function () {
                var prefix = "";
                this.NCName = function (ncname) { prefix = getNodeValue(ncname); };
                this.URILiteral = function (uri) {
                    var moduleURI = getNodeValue(uri);
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

        visitor.DefaultNamespaceDecl = function (node) {
            var Handler = function () {
                var fn = false;
                this.TOKEN = function (token) {
                    fn = fn ? true : (token.value === "function");
                };
                this.URILiteral = function (uri) {
                    var ns = getNodeValue(uri);
                    ns = ns.substring(1, ns.length - 1);
                    if (fn) { defaultFnNs = ns; }
                };
            };
            visitor.visitChildren(node, new Handler());
            return true;
        };

        // -- Statement scoping --
        visitor.StatementsAndOptionalExpr = function (node) {
            pushSctx(node.pos);
            statementCount.push(0);
            visitor.visitChildren(node);
            for (var i = 1; i <= statementCount[statementCount.length - 1]; i++) {
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
            for (var i = 1; i <= statementCount[statementCount.length - 1]; i++) {
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
            for (var i = 1; i <= statementCount[statementCount.length - 1]; i++) {
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
            for (var i = 1; i <= clauseCount[clauseCount.length - 1]; i++) {
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

        var isGroupDecl = false;
        visitor.GroupingSpec = function (node) {
            isGroupDecl = false;
            pushSctx(node.pos);
            clauseCount[clauseCount.length - 1]++;

            for (var i = 0; i < node.children.length; i++) {
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
                name: "$" + getNodeValue(node.children[1])
            });
            return true;
        };

        // -- VarDecl / VarDeclStatement --
        visitor.VarDecl = visitor.VarDeclStatement = function (node) {
            var isStmt = (node.name === "VarDeclStatement");
            var varNames = [];

            var VarDeclHandler = function (decls) {
                this.ExprSingle = function () { return true; };
                this.VarName = function (vnode) {
                    var varName = getNodeValue(vnode);
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

            var decls;
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

            varNames.forEach(function (curName) {
                var newDecl = { pos: node.pos, kind: node.name };
                decls[curName] = decls[curName] || newDecl;
                if (!isStmt) {
                    var firstSctx = rootSctx.children[0];
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

            var Handler = function () {
                this.FunctionDecl = function (fnode) {
                    isExternal = fnode.children[fnode.children.length - 1].value &&
                                 fnode.children[fnode.children.length - 1].value === "external";
                    fnParams = [];
                    var eQName = "";
                    pushSctx(fnode.pos);
                    var FnHandler = function () {
                        this.EQName = function (eqnode) {
                            eQName = getNodeValue(eqnode);
                        };
                    };
                    visitor.visitChildren(fnode, new FnHandler());
                    popSctx();

                    var fnArity = fnParams.length;
                    fnode.arity = "" + fnArity;
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
            fnCall = true;
            arity = 0;
            fnName = "";
            visitor.visitChildren(node);
            fnCall = false;
            node.arity = arity;
            return true;
        };

        visitor.Argument = function () {
            arity++;
            return false;
        };

        // -- EQName --
        visitor.EQName = function (node) {
            var value = getNodeValue(node);
            if (fnCall) {
                fnName = value;
            }
            if (value.substring(0, 2) !== "Q{" && value.indexOf(":") !== -1) {
                var prefix = value.substring(0, value.indexOf(":"));
                var localName = value.substring(value.indexOf(":") + 1);
                if (declaredNS[prefix] === undefined && namespaces[prefix] === undefined) {
                    markers.push(XPST0081(node.pos, prefix, localName));
                } else {
                    referencedPrefixes[prefix] = true;
                }
            }
            return false;
        };

        visitor.QName = function (node) {
            var value = getNodeValue(node);
            if (value.indexOf(":") !== -1) {
                var prefix = value.substring(0, value.indexOf(":"));
                referencedPrefixes[prefix] = true;
            }
            return false;
        };

        visitor.Wildcard = function (node) {
            var value = getNodeValue(node);
            var prefix = value.substring(0, value.indexOf(":"));
            if (prefix !== "*") {
                referencedPrefixes[prefix] = true;
            }
            return true;
        };

        // -- VarRef --
        visitor.VarRef = function (node) {
            var value = getNodeValue(node).substring(1);
            if (value.substring(0, 2) !== "Q{" && value.indexOf(":") === -1) {
                if (sctx.varRefs[value] === undefined) {
                    sctx.varRefs[value] = [];
                }
                var pos = { sl: node.pos.sl, sc: node.pos.sc + 1, el: node.pos.el, ec: node.pos.ec };
                sctx.varRefs[value].push({ pos: pos });
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

        return { markers: markers };
    }

    return {
        analyze: analyze,
        setRegisteredModules: function (modules) {
            registeredModulePrefixes = {};
            for (var i = 0; i < modules.length; i++) {
                if (modules[i].prefix && modules[i].uri) {
                    registeredModulePrefixes[modules[i].prefix] = modules[i].uri;
                }
            }
        }
    };
})();

// Browser global (needed when bundled by esbuild)
globalThis.staticAnalysis = staticAnalysis;

if (typeof module !== "undefined" && module.exports) {
    module.exports = staticAnalysis;
}
