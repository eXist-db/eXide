const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { adapter } = require("./harness");

// Load both parsers
const XQueryParser = require("../src/parser/XQueryParser.js");
const XQueryParser40 = require("../src/parser/XQueryParser40.js");

// Helper: parse with a specific parser and find a node
function parse(code, Parser) {
    return adapter.parseXQuery(code, Parser);
}

function findNode(n, name) {
    if (n.name === name) return n;
    for (const c of (n.children || [])) {
        const r = findNode(c, name);
        if (r) return r;
    }
    return null;
}

function findAllNodes(n, name, results) {
    results = results || [];
    if (n.name === name) results.push(n);
    for (const c of (n.children || [])) findAllNodes(c, name, results);
    return results;
}

describe("Version detection regex", function () {
    // Import detectVersion from parser-registry
    const registry = require("../src/parser/parser-registry.js");

    it("detects version 4.0", function () {
        assert.equal(registry.detectVersion('xquery version "4.0"; 1'), "4.0");
    });

    it("detects version 3.1 explicitly", function () {
        assert.equal(registry.detectVersion('xquery version "3.1"; 1'), "3.1");
    });

    it("defaults to 3.1 when no declaration", function () {
        assert.equal(registry.detectVersion("1 + 1"), "3.1");
    });

    it("detects version 1.0 as 3.1", function () {
        assert.equal(registry.detectVersion('xquery version "1.0"; 1'), "3.1");
    });

    it("detects version 3.0 as 3.1", function () {
        assert.equal(registry.detectVersion('xquery version "3.0"; 1'), "3.1");
    });

    it("handles single quotes in version declaration", function () {
        assert.equal(registry.detectVersion("xquery version '4.0'; 1"), "4.0");
    });
});

describe("XQuery 3.1 parser", function () {
    it("parses basic expression", function () {
        var result = parse("1 + 2", XQueryParser);
        assert.ok(result.ast);
        assert.equal(result.error, null);
    });

    it("parses function declaration", function () {
        var result = parse("declare function local:foo($x) { $x }; local:foo(1)", XQueryParser);
        var fd = findNode(result.ast, "FunctionDecl");
        assert.ok(fd);
        assert.equal(fd.arity, 1);
    });

    it("parses FLWOR expression", function () {
        var result = parse("let $x := 1 return $x", XQueryParser);
        var lb = findNode(result.ast, "LetBinding");
        assert.ok(lb);
    });
});

describe("XQuery 4.0 parser", function () {
    it("parses basic expression", function () {
        var result = parse('xquery version "4.0"; 1 + 2', XQueryParser40);
        assert.ok(result.ast);
        assert.equal(result.error, null);
    });

    it("parses function declaration with normalized AST", function () {
        var result = parse('declare function local:foo($x) { $x }; local:foo(1)', XQueryParser40);
        var fd = findNode(result.ast, "FunctionDecl");
        assert.ok(fd, "FunctionDecl found");
        assert.equal(fd.arity, 1);
        // EQName should be present (normalized from UnreservedFunctionEQName)
        var eq = findNode(fd, "EQName");
        assert.ok(eq);
        assert.equal(eq.value, "local:foo");
    });

    it("normalizes VarRef with VarName wrapper", function () {
        var result = parse("$x", XQueryParser40);
        var vr = findNode(result.ast, "VarRef");
        assert.ok(vr);
        var vn = findNode(vr, "VarName");
        assert.ok(vn, "VarName synthesized inside VarRef");
        var eq = findNode(vn, "EQName");
        assert.ok(eq);
        assert.equal(eq.value, "x");
    });

    it("normalizes LetBinding by unwrapping LetValueBinding", function () {
        var result = parse("let $x := 1 return $x", XQueryParser40);
        var lb = findNode(result.ast, "LetBinding");
        assert.ok(lb);
        // Should have $ and VarName as direct children (not wrapped in LetValueBinding)
        var hasVarName = lb.children.some(function (c) { return c.name === "VarName"; });
        assert.ok(hasVarName, "VarName is direct child of LetBinding");
    });

    it("normalizes ForBinding by unwrapping ForItemBinding", function () {
        var result = parse("for $x in (1,2) return $x", XQueryParser40);
        var fb = findNode(result.ast, "ForBinding");
        assert.ok(fb);
        var hasVarName = fb.children.some(function (c) { return c.name === "VarName"; });
        assert.ok(hasVarName, "VarName is direct child of ForBinding");
    });

    it("synthesizes AnnotatedDecl wrapper in Prolog", function () {
        var result = parse("declare function local:test() { 1 }; 1", XQueryParser40);
        var ad = findNode(result.ast, "AnnotatedDecl");
        assert.ok(ad, "AnnotatedDecl wrapper synthesized");
        var fd = findNode(ad, "FunctionDecl");
        assert.ok(fd, "FunctionDecl inside AnnotatedDecl");
    });

    it("normalizes ParamWithDefault to Param", function () {
        var result = parse("declare function local:foo($a, $b) { $a }; 1", XQueryParser40);
        var params = findAllNodes(result.ast, "Param");
        assert.equal(params.length, 2);
    });

    it("collapses OtherwiseExpr and PipelineExpr", function () {
        // These should collapse to their single child
        var result = parse("1", XQueryParser40);
        var otherwise = findAllNodes(result.ast, "OtherwiseExpr");
        var pipeline = findAllNodes(result.ast, "PipelineExpr");
        assert.equal(otherwise.length, 0, "OtherwiseExpr should be collapsed");
        assert.equal(pipeline.length, 0, "PipelineExpr should be collapsed");
    });
});

describe("Both parsers produce compatible ASTs", function () {
    var code = 'declare namespace ns = "http://example.com";\n' +
               'declare function local:add($a, $b) { $a + $b };\n' +
               'let $x := local:add(1, 2)\n' +
               'return $x';

    var result31 = parse(code, XQueryParser);
    var result40 = parse(code, XQueryParser40);

    it("both produce AnnotatedDecl", function () {
        assert.ok(findNode(result31.ast, "AnnotatedDecl"));
        assert.ok(findNode(result40.ast, "AnnotatedDecl"));
    });

    it("both produce FunctionDecl with same arity", function () {
        var fd31 = findNode(result31.ast, "FunctionDecl");
        var fd40 = findNode(result40.ast, "FunctionDecl");
        assert.equal(fd31.arity, fd40.arity);
    });

    it("both produce FunctionCall with same arity", function () {
        var fc31 = findNode(result31.ast, "FunctionCall");
        var fc40 = findNode(result40.ast, "FunctionCall");
        assert.equal(fc31.arity, fc40.arity);
    });

    it("both produce VarRef > VarName > EQName chain", function () {
        var vr31 = findNode(result31.ast, "VarRef");
        var vr40 = findNode(result40.ast, "VarRef");
        var vn31 = findNode(vr31, "VarName");
        var vn40 = findNode(vr40, "VarName");
        assert.ok(vn31 && vn40, "Both have VarName inside VarRef");
    });

    it("both produce NamespaceDecl", function () {
        assert.ok(findNode(result31.ast, "NamespaceDecl"));
        assert.ok(findNode(result40.ast, "NamespaceDecl"));
    });
});
