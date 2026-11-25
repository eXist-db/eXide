/**
 * Tests for XQuery 4.0-specific syntax that the 3.1 parser cannot handle.
 * Verifies the 4.0 parser produces correct, normalized ASTs for new constructs.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { adapter } = require("./harness");

const XQueryParser31 = require("../src/parser/XQueryParser.js").default;
const XQueryParser40 = require("../src/parser/XQueryParser40.js").default;

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

describe("XQ 4.0: otherwise expression", () => {
    it("parses without error", () => {
        const result = parse40('1 otherwise 2');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects otherwise", () => {
        const result = parse31('1 otherwise 2');
        assert.ok(result.error, "3.1 should error on 'otherwise'");
    });

    it("collapses OtherwiseExpr when single operand", () => {
        const result = parse40('1');
        const nodes = findAllNodes(result.ast, "OtherwiseExpr");
        assert.equal(nodes.length, 0, "single-child OtherwiseExpr should collapse");
    });

    it("preserves OtherwiseExpr with two operands", () => {
        const result = parse40('1 otherwise 2');
        const nodes = findAllNodes(result.ast, "OtherwiseExpr");
        assert.equal(nodes.length, 1);
    });
});

describe("XQ 4.0: pipeline expression (->)", () => {
    it("parses without error", () => {
        const result = parse40('(1, 2, 3) -> fn:count()');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects pipeline", () => {
        const result = parse31('(1, 2, 3) -> fn:count()');
        assert.ok(result.error, "3.1 should error on '->'");
    });

    it("produces FunctionCall inside pipeline", () => {
        const result = parse40('(1, 2, 3) -> fn:count()');
        const fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
        const eq = findNode(fc, "EQName");
        assert.equal(eq.value, "fn:count");
    });
});

describe("XQ 4.0: sequence arrow (=>) and mapping arrow (=!>)", () => {
    it("parses sequence arrow", () => {
        const result = parse40('(1, 2, 3) => fn:count()');
        assert.equal(result.error, null);
    });

    it("parses mapping arrow", () => {
        const result = parse40('(1, 2, 3) =!> fn:abs()');
        assert.equal(result.error, null);
    });

    it("mapping arrow produces FunctionCall", () => {
        const result = parse40('(1, 2, 3) =!> fn:abs()');
        const fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
    });
});

describe("XQ 4.0: method call (=?>)", () => {
    it("parses without error", () => {
        const result = parse40('map { "a": 1 } =?> get("a")');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects method call", () => {
        const result = parse31('map { "a": 1 } =?> get("a")');
        assert.ok(result.error, "3.1 should error on '=?>'");
    });
});

describe("XQ 4.0: array member filter (?[...])", () => {
    it("parses without error", () => {
        const result = parse40('[1, 2, 3, 4]?[. > 2]');
        assert.equal(result.error, null);
    });

    it("3.1 parser rejects array member filter", () => {
        const result = parse31('[1, 2, 3, 4]?[. > 2]');
        assert.ok(result.error, "3.1 should error on '?['");
    });
});

describe("XQ 4.0: keyword arguments", () => {
    it("parses function call with keyword argument", () => {
        const result = parse40('fn:substring("hello", count := 3)');
        assert.equal(result.error, null);
    });

    it("finds keyword argument", () => {
        const result = parse40('fn:substring("hello", count := 3)');
        const ka = findNode(result.ast, "KeywordArgument");
        assert.ok(ka, "KeywordArgument node found");
    });
});

describe("XQ 4.0: enumeration type", () => {
    it("parses enum type in function parameter", () => {
        const result = parse40('declare function local:dir($d as enum("north", "south")) { $d }; local:dir("north")');
        assert.equal(result.error, null);
    });

    it("finds EnumerationType node", () => {
        const result = parse40('declare function local:dir($d as enum("north", "south")) { $d }; local:dir("north")');
        const en = findNode(result.ast, "EnumerationType");
        assert.ok(en, "EnumerationType node found");
    });
});

describe("XQ 4.0: version declaration", () => {
    it("parses xquery version 4.0 declaration", () => {
        const result = parse40('xquery version "4.0"; 1');
        assert.equal(result.error, null);
        const vd = findNode(result.ast, "VersionDecl");
        assert.ok(vd);
    });

    it("xquery version 4.0 is also valid in 3.1 parser (unknown version is not a parse error)", () => {
        // The version string is just a string literal; both parsers accept any value
        const result = parse31('xquery version "4.0"; 1');
        assert.equal(result.error, null);
    });
});

describe("XQ 4.0: chained postfix expressions", () => {
    it("parses chained predicates and lookups", () => {
        const result = parse40('([1,2,3])?1');
        assert.equal(result.error, null);
    });

    it("parses chained function calls", () => {
        const result = parse40('fn:string(fn:count((1,2,3)))');
        assert.equal(result.error, null);
        // Should find two FunctionCall nodes
        const fcs = findAllNodes(result.ast, "FunctionCall");
        assert.equal(fcs.length, 2);
    });
});

describe("XQ 4.0: AST compatibility for visitors", () => {
    const code = 'xquery version "4.0";\n' +
               'declare namespace ns = "http://example.com";\n' +
               'declare function local:add($a, $b) { $a + $b };\n' +
               'let $x := local:add(1, 2)\n' +
               'for $y in (1, 2, 3)\n' +
               'return $x + $y';

    const result = parse40(code);

    it("no parse errors", () => {
        assert.equal(result.error, null);
    });

    it("AnnotatedDecl wraps FunctionDecl", () => {
        const ad = findNode(result.ast, "AnnotatedDecl");
        assert.ok(ad);
        assert.equal(ad.children[0].name, "FunctionDecl");
    });

    it("FunctionDecl has correct arity", () => {
        const fd = findNode(result.ast, "FunctionDecl");
        assert.equal(fd.arity, 2);
    });

    it("LetBinding has $ and VarName as direct children", () => {
        const lb = findNode(result.ast, "LetBinding");
        assert.ok(lb);
        const names = lb.children.map((c) => { return c.name; });
        assert.ok(names.indexOf("VarName") !== -1, "VarName in LetBinding");
        // $ TOKEN should precede VarName
        let dollarIdx = -1;
        let varNameIdx = -1;
        for (let i = 0; i < lb.children.length; i++) {
            if (lb.children[i].name === "TOKEN" && lb.children[i].value === "$") dollarIdx = i;
            if (lb.children[i].name === "VarName") varNameIdx = i;
        }
        assert.ok(dollarIdx < varNameIdx, "$ precedes VarName");
    });

    it("ForBinding has $ and VarName as direct children", () => {
        const fb = findNode(result.ast, "ForBinding");
        assert.ok(fb);
        const hasVarName = fb.children.some((c) => { return c.name === "VarName"; });
        assert.ok(hasVarName);
    });

    it("VarRef contains VarName with EQName", () => {
        const vr = findNode(result.ast, "VarRef");
        assert.ok(vr);
        const vn = findNode(vr, "VarName");
        assert.ok(vn, "VarName inside VarRef");
        const eq = findNode(vn, "EQName");
        assert.ok(eq);
    });

    it("NamespaceDecl is present", () => {
        const ns = findNode(result.ast, "NamespaceDecl");
        assert.ok(ns);
    });

    it("FunctionCall has correct arity", () => {
        const fc = findNode(result.ast, "FunctionCall");
        assert.ok(fc);
        assert.equal(fc.arity, 2);
    });

    it("Param nodes exist for function parameters", () => {
        const params = findAllNodes(result.ast, "Param");
        assert.equal(params.length, 2);
    });

    it("getParent chain is intact", () => {
        const vr = findNode(result.ast, "VarRef");
        assert.ok(vr.getParent, "VarRef has parent");
        const vn = findNode(vr, "VarName");
        assert.equal(vn.getParent, vr, "VarName parent is VarRef");
    });
});
