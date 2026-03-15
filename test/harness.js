/**
 * Test harness: shims the eXide browser globals so that
 * src/visitor.js and src/xquery-utils.js can be loaded in Node.js.
 */
const path = require("path");
const fs = require("fs");

// Shim globals expected by eXide source files
const eXide = {};
eXide.namespace = function (ns_string) {
    var parts = ns_string.split("."),
        parent = eXide,
        i;
    if (parts[0] === "eXide") {
        parts = parts.slice(1);
    }
    for (i = 0; i < parts.length; i++) {
        if (typeof parent[parts[i]] === "undefined") {
            parent[parts[i]] = {};
        }
        parent = parent[parts[i]];
    }
    return parent;
};

// oop.inherit (from src/util.js)
eXide.namespace("eXide.util.oop");
eXide.util.oop.inherit = (function () {
    var F = function () {};
    return function (C, P) {
        F.prototype = P.prototype;
        C.prototype = new F();
        C.super_ = P.prototype;
        C.prototype.constructor = C;
    };
})();

global.eXide = eXide;

// Shim require("ace/range") — imported but unused by visitor code
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === "ace/range") {
        return request; // return dummy id
    }
    return origResolve.call(this, request, parent, isMain, options);
};
require.cache["ace/range"] = {
    id: "ace/range",
    filename: "ace/range",
    loaded: true,
    exports: { Range: function () {} }
};


// Load source files in dependency order
const srcDir = path.join(__dirname, "..", "src");
require(path.join(srcDir, "visitor.js"));
require(path.join(srcDir, "xquery-utils.js"));

// Load parser + adapter
const XQueryParser = require(path.join(srcDir, "parser", "XQueryParser.js"));
const adapter = require(path.join(srcDir, "parser", "adapter.js"));

function parse(code) {
    return adapter.parseXQuery(code, XQueryParser);
}

module.exports = {
    eXide,
    parse,
    XQueryParser,
    adapter,
    XQueryUtils: eXide.edit.XQueryUtils,
    Visitor: eXide.edit.Visitor,
    InScopeVariables: eXide.edit.InScopeVariables,
    VariableReferences: eXide.edit.VariableReferences,
    FunctionCalls: eXide.edit.FunctionCalls,
    FunctionParameters: eXide.edit.FunctionParameters,
    ModuleInfo: eXide.edit.ModuleInfo
};
