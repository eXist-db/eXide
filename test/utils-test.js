const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse, XQueryUtils } = require("./harness");

// Helpers
function findNode(n, name) {
    if (n.name === name) return n;
    for (const c of (n.children || [])) {
        const r = findNode(c, name);
        if (r) return r;
    }
    return null;
}

// ── findNode ─────────────────────────────────────────────────

describe("XQueryUtils.findNode", function () {
    it("finds deepest node at cursor position", function () {
        const { ast } = parse("1 + 2");
        // col 5 lands inside IntegerLiteral "2" (pos 0:4-0:5)
        const node = XQueryUtils.findNode(ast, { line: 0, col: 5 });
        assert.ok(node);
        assert.equal(node.name, "IntegerLiteral");
        assert.equal(node.value, "2");
    });

    it("returns null for position outside AST", function () {
        const { ast } = parse("1");
        const node = XQueryUtils.findNode(ast, { line: 10, col: 0 });
        assert.equal(node, null);
    });

    it("finds correct node in multiline code", function () {
        const { ast } = parse("let $x := 1\nreturn $x");
        // Line 1, col 7 is inside the VarRef "$x"
        const node = XQueryUtils.findNode(ast, { line: 1, col: 7 });
        assert.ok(node);
        // Should be inside the return clause area
        assert.ok(node.pos.sl <= 1 && node.pos.el >= 1);
    });
});

// ── findAncestor ─────────────────────────────────────────────

describe("XQueryUtils.findAncestor", function () {
    it("finds ancestor by single type", function () {
        const { ast } = parse("let $x := 1 return $x");
        const eqname = findNode(ast, "EQName");
        const flwor = XQueryUtils.findAncestor(eqname, "FLWORExpr");
        assert.ok(flwor);
        assert.equal(flwor.name, "FLWORExpr");
    });

    it("finds ancestor by type array", function () {
        const { ast } = parse("let $x := 1 return $x");
        const eqname = findNode(ast, "EQName");
        const result = XQueryUtils.findAncestor(eqname, ["FLWORExpr", "FunctionDecl"]);
        assert.ok(result);
        assert.equal(result.name, "FLWORExpr");
    });

    it("returns null when no ancestor matches", function () {
        const { ast } = parse("1 + 2");
        const lit = findNode(ast, "IntegerLiteral");
        assert.equal(XQueryUtils.findAncestor(lit, "FLWORExpr"), null);
    });

    it("returns the node itself if it matches", function () {
        const { ast } = parse("let $x := 1 return $x");
        const flwor = findNode(ast, "FLWORExpr");
        assert.equal(XQueryUtils.findAncestor(flwor, "FLWORExpr"), flwor);
    });
});

// ── findChild ────────────────────────────────────────────────

describe("XQueryUtils.findChild", function () {
    it("finds first child by type", function () {
        const { ast } = parse("let $x := 1 return $x");
        const flwor = findNode(ast, "FLWORExpr");
        const ret = XQueryUtils.findChild(flwor, "ReturnClause");
        assert.ok(ret);
        assert.equal(ret.name, "ReturnClause");
    });

    it("returns null when no child matches", function () {
        const { ast } = parse("1 + 2");
        assert.equal(XQueryUtils.findChild(ast, "FLWORExpr"), null);
    });
});

// ── getValue ─────────────────────────────────────────────────

describe("XQueryUtils.getValue", function () {
    it("returns value for terminal nodes", function () {
        const { ast } = parse("$foo");
        const eqname = findNode(ast, "EQName");
        assert.equal(XQueryUtils.getValue(eqname), "foo");
    });

    it("concatenates descendant values for nonterminals", function () {
        const { ast } = parse("let $x := 1 return $x");
        const binding = findNode(ast, "LetBinding");
        const val = XQueryUtils.getValue(binding);
        // Should contain "$", "x", ":=", "1" concatenated (with WS)
        assert.ok(val.includes("$"));
        assert.ok(val.includes("x"));
        assert.ok(val.includes(":="));
        assert.ok(val.includes("1"));
    });

    it("returns empty string for empty node", function () {
        const empty = { value: undefined, children: [] };
        assert.equal(XQueryUtils.getValue(empty), "");
    });
});

// ── inRange ──────────────────────────────────────────────────

describe("XQueryUtils.inRange", function () {
    it("returns true for point inside single-line range", function () {
        const p = { sl: 0, sc: 5, el: 0, ec: 10 };
        assert.equal(XQueryUtils.inRange(p, { line: 0, col: 7 }), true);
    });

    it("returns undefined for point outside range", function () {
        const p = { sl: 0, sc: 5, el: 0, ec: 10 };
        assert.ok(!XQueryUtils.inRange(p, { line: 0, col: 3 }));
        assert.ok(!XQueryUtils.inRange(p, { line: 1, col: 0 }));
    });

    it("handles multiline ranges", function () {
        const p = { sl: 0, sc: 0, el: 2, ec: 10 };
        assert.equal(XQueryUtils.inRange(p, { line: 1, col: 5 }), true);
    });

    it("checks start boundary", function () {
        const p = { sl: 0, sc: 5, el: 0, ec: 10 };
        assert.equal(XQueryUtils.inRange(p, { line: 0, col: 5 }), true);
        assert.ok(!XQueryUtils.inRange(p, { line: 0, col: 4 }));
    });

    it("checks end boundary with exclusive flag", function () {
        const p = { sl: 0, sc: 5, el: 0, ec: 10 };
        // Without exclusive: col 10 is in range, col 11 is not
        assert.equal(XQueryUtils.inRange(p, { line: 0, col: 10 }), true);
        assert.ok(!XQueryUtils.inRange(p, { line: 0, col: 11 }));
        // With exclusive: col 11 is also in range
        assert.equal(XQueryUtils.inRange(p, { line: 0, col: 11 }, true), true);
    });

    it("returns undefined for null pos", function () {
        assert.ok(!XQueryUtils.inRange(null, { line: 0, col: 0 }));
    });
});

// ── samePosition ─────────────────────────────────────────────

describe("XQueryUtils.samePosition", function () {
    it("returns true for identical positions", function () {
        const p = { sl: 1, sc: 2, el: 3, ec: 4 };
        assert.equal(XQueryUtils.samePosition(p, { sl: 1, sc: 2, el: 3, ec: 4 }), true);
    });

    it("returns false for different positions", function () {
        const p = { sl: 1, sc: 2, el: 3, ec: 4 };
        assert.equal(XQueryUtils.samePosition(p, { sl: 1, sc: 2, el: 3, ec: 5 }), false);
    });
});

// ── getPath ──────────────────────────────────────────────────

describe("XQueryUtils.getPath", function () {
    it("returns slash-separated ancestor path", function () {
        const { ast } = parse("$foo");
        const eqname = findNode(ast, "EQName");
        const path = XQueryUtils.getPath(eqname);
        assert.ok(path.startsWith("XQuery/"));
        assert.ok(path.endsWith("EQName"));
    });
});

// ── findSibling / findSiblings ───────────────────────────────

describe("XQueryUtils.findSibling", function () {
    it("finds sibling by type", function () {
        const { ast } = parse("let $x := 1 return $x");
        const flwor = findNode(ast, "FLWORExpr");
        const ret = findNode(flwor, "ReturnClause");
        const init = XQueryUtils.findSibling(ret, "InitialClause");
        assert.ok(init);
        assert.equal(init.name, "InitialClause");
    });
});

describe("XQueryUtils.findSiblings", function () {
    it("finds all siblings of given type excluding self", function () {
        const { ast } = parse("declare function local:f($a, $b) { 1 };");
        const fd = findNode(ast, "FunctionDecl");
        const paramList = findNode(fd, "ParamList");
        if (paramList) {
            const params = paramList.children.filter(c => c.name === "Param");
            if (params.length >= 2) {
                const siblings = XQueryUtils.findSiblings(params[0], "Param");
                assert.equal(siblings.length, 1);
                assert.equal(siblings[0], params[1]);
            }
        }
    });
});
