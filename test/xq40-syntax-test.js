/**
 * Tests for XQuery 4.0-specific syntax that the 3.1 parser cannot handle.
 * Verifies the 4.0 parser produces correct, normalized ASTs for new constructs.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { adapter } = require("./harness");

const XQueryParser31 = require("../src/parser/XQueryParser.js");
const XQueryParser40 = require("../src/parser/XQueryParser40.js");

function parse40(code) {
    return adapter.parseXQuery(code, XQueryParser40);
}

function parse31(code) {
    return adapter.parseXQuery(code, XQueryParser31);
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

function getValue(node) {
    if (node.value) return node.value;
    var val = "";
    for (var c of (node.children || [])) val += getValue(c);
    return val;
}

describe("XQ 4.0: otherwise expression", function () {
    it("parses without error", function () {
        var result = parse40('1 otherwise 2');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects otherwise", function () {
        var result = parse31('1 otherwise 2');
        assert.ok(result.error, "3.1 should error on 'otherwise'");
    });

    it("collapses OtherwiseExpr when single operand", function () {
        var result = parse40('1');
        var nodes = findAllNodes(result.ast, "OtherwiseExpr");
        assert.equal(nodes.length, 0, "single-child OtherwiseExpr should collapse");
    });

    it("preserves OtherwiseExpr with two operands", function () {
        var result = parse40('1 otherwise 2');
        var nodes = findAllNodes(result.ast, "OtherwiseExpr");
        assert.equal(nodes.length, 1);
    });
});

describe("XQ 4.0: pipeline expression (->)", function () {
    it("parses without error", function () {
        var result = parse40('(1, 2, 3) -> fn:count()');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects pipeline", function () {
        var result = parse31('(1, 2, 3) -> fn:count()');
        assert.ok(result.error, "3.1 should error on '->'");
    });

    it("produces FunctionCall inside pipeline", function () {
        var result = parse40('(1, 2, 3) -> fn:count()');
        var fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
        var eq = findNode(fc, "EQName");
        assert.equal(eq.value, "fn:count");
    });
});

describe("XQ 4.0: sequence arrow (=>) and mapping arrow (=!>)", function () {
    it("parses sequence arrow", function () {
        var result = parse40('(1, 2, 3) => fn:count()');
        assert.equal(result.error, null);
    });

    it("parses mapping arrow", function () {
        var result = parse40('(1, 2, 3) =!> fn:abs()');
        assert.equal(result.error, null);
    });

    it("mapping arrow produces FunctionCall", function () {
        var result = parse40('(1, 2, 3) =!> fn:abs()');
        var fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
    });
});

describe("XQ 4.0: method call (=?>)", function () {
    it("parses without error", function () {
        var result = parse40('map { "a": 1 } =?> get("a")');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects method call", function () {
        var result = parse31('map { "a": 1 } =?> get("a")');
        assert.ok(result.error, "3.1 should error on '=?>'");
    });
});

describe("XQ 4.0: array member filter (?[...])", function () {
    it("parses without error", function () {
        var result = parse40('[1, 2, 3, 4]?[. > 2]');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects array member filter", function () {
        var result = parse31('[1, 2, 3, 4]?[. > 2]');
        assert.ok(result.error, "3.1 should error on '?['");
    });
});

describe("XQ 4.0: keyword arguments", function () {
    it("parses function call with keyword argument", function () {
        var result = parse40('fn:substring("hello", count := 3)');
        assert.equal(result.error, null);
    });

    it("finds keyword argument", function () {
        var result = parse40('fn:substring("hello", count := 3)');
        var ka = findNode(result.ast, "KeywordArgument");
        assert.ok(ka, "KeywordArgument node found");
    });
});

describe("XQ 4.0: enumeration type", function () {
    it("parses enum type in function parameter", function () {
        var result = parse40('declare function local:dir($d as enum("north", "south")) { $d }; local:dir("north")');
        assert.equal(result.error, null);
    });

    it("finds EnumerationType node", function () {
        var result = parse40('declare function local:dir($d as enum("north", "south")) { $d }; local:dir("north")');
        var en = findNode(result.ast, "EnumerationType");
        assert.ok(en, "EnumerationType node found");
    });
});

describe("XQ 4.0: version declaration", function () {
    it("parses xquery version 4.0 declaration", function () {
        var result = parse40('xquery version "4.0"; 1');
        assert.equal(result.error, null);
        var vd = findNode(result.ast, "VersionDecl");
        assert.ok(vd);
    });

    it("xquery version 4.0 is also valid in 3.1 parser (unknown version is not a parse error)", function () {
        // The version string is just a string literal; both parsers accept any value
        var result = parse31('xquery version "4.0"; 1');
        assert.equal(result.error, null);
    });
});

describe("XQ 4.0: chained postfix expressions", function () {
    it("parses chained predicates and lookups", function () {
        var result = parse40('([1,2,3])?1');
        assert.equal(result.error, null);
    });

    it("parses chained function calls", function () {
        var result = parse40('fn:string(fn:count((1,2,3)))');
        assert.equal(result.error, null);
        // Should find two FunctionCall nodes
        var fcs = findAllNodes(result.ast, "FunctionCall");
        assert.equal(fcs.length, 2);
    });
});

describe("XQ 4.0: AST compatibility for visitors", function () {
    var code = 'xquery version "4.0";\n' +
               'declare namespace ns = "http://example.com";\n' +
               'declare function local:add($a, $b) { $a + $b };\n' +
               'let $x := local:add(1, 2)\n' +
               'for $y in (1, 2, 3)\n' +
               'return $x + $y';

    var result = parse40(code);

    it("no parse errors", function () {
        assert.equal(result.error, null);
    });

    it("AnnotatedDecl wraps FunctionDecl", function () {
        var ad = findNode(result.ast, "AnnotatedDecl");
        assert.ok(ad);
        assert.equal(ad.children[0].name, "FunctionDecl");
    });

    it("FunctionDecl has correct arity", function () {
        var fd = findNode(result.ast, "FunctionDecl");
        assert.equal(fd.arity, 2);
    });

    it("LetBinding has $ and VarName as direct children", function () {
        var lb = findNode(result.ast, "LetBinding");
        assert.ok(lb);
        var names = lb.children.map(function (c) { return c.name; });
        assert.ok(names.indexOf("VarName") !== -1, "VarName in LetBinding");
        // $ TOKEN should precede VarName
        var dollarIdx = -1;
        var varNameIdx = -1;
        for (var i = 0; i < lb.children.length; i++) {
            if (lb.children[i].name === "TOKEN" && lb.children[i].value === "$") dollarIdx = i;
            if (lb.children[i].name === "VarName") varNameIdx = i;
        }
        assert.ok(dollarIdx < varNameIdx, "$ precedes VarName");
    });

    it("ForBinding has $ and VarName as direct children", function () {
        var fb = findNode(result.ast, "ForBinding");
        assert.ok(fb);
        var hasVarName = fb.children.some(function (c) { return c.name === "VarName"; });
        assert.ok(hasVarName);
    });

    it("VarRef contains VarName with EQName", function () {
        var vr = findNode(result.ast, "VarRef");
        assert.ok(vr);
        var vn = findNode(vr, "VarName");
        assert.ok(vn, "VarName inside VarRef");
        var eq = findNode(vn, "EQName");
        assert.ok(eq);
    });

    it("NamespaceDecl is present", function () {
        var ns = findNode(result.ast, "NamespaceDecl");
        assert.ok(ns);
    });

    it("FunctionCall has correct arity", function () {
        var fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
        assert.equal(fc.arity, 2);
    });

    it("Param nodes exist for function parameters", function () {
        var params = findAllNodes(result.ast, "Param");
        assert.equal(params.length, 2);
    });

    it("getParent chain is intact", function () {
        var vr = findNode(result.ast, "VarRef");
        assert.ok(vr.getParent, "VarRef has parent");
        var vn = findNode(vr, "VarName");
        assert.equal(vn.getParent, vr, "VarName parent is VarRef");
    });
});
