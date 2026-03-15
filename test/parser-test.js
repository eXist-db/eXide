const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse, adapter } = require("./harness");

// Helpers
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

describe("Node shape contract", function () {
    const { ast } = parse("1");

    it("root has required properties", function () {
        assert.equal(typeof ast.name, "string");
        assert.ok(Array.isArray(ast.children));
        assert.ok("pos" in ast);
        assert.ok("sl" in ast.pos && "sc" in ast.pos && "el" in ast.pos && "ec" in ast.pos);
    });

    it("terminal nodes have value", function () {
        const lit = findNode(ast, "IntegerLiteral");
        assert.equal(lit.value, "1");
    });

    it("nonterminal nodes have children array", function () {
        const mod = findNode(ast, "Module");
        assert.ok(Array.isArray(mod.children));
        assert.ok(mod.children.length > 0);
    });
});

describe("getParent references", function () {
    const { ast } = parse("1 + 2");

    it("root getParent is null", function () {
        assert.equal(ast.getParent, null);
    });

    it("children have getParent set to their parent", function () {
        for (const child of ast.children) {
            assert.equal(child.getParent, ast);
        }
    });

    it("deeply nested node has correct parent chain", function () {
        const lit = findNode(ast, "IntegerLiteral");
        assert.ok(lit.getParent != null);
        let node = lit;
        while (node.getParent) node = node.getParent;
        assert.equal(node, ast);
    });
});

describe("Basic expressions", function () {
    it("FLWOR expression", function () {
        const { ast } = parse("let $x := 1 return $x");
        assert.ok(findNode(ast, "FLWORExpr"));
        assert.ok(findNode(ast, "LetBinding"));
        assert.ok(findNode(ast, "ReturnClause"));
    });

    it("if/then/else", function () {
        const { ast } = parse("if (true()) then 1 else 2");
        assert.ok(findNode(ast, "IfExpr"));
    });

    it("function call", function () {
        const { ast } = parse("fn:count(1, 2, 3)");
        const fc = findNode(ast, "FunctionCall");
        assert.ok(fc);
        assert.equal(fc.arity, 3);
    });

    it("variable reference", function () {
        const { ast } = parse("$foo");
        const vr = findNode(ast, "VarRef");
        assert.ok(vr);
        const vn = findNode(vr, "VarName");
        assert.ok(vn);
    });

    it("path expression", function () {
        const { ast } = parse("/root/child");
        assert.ok(findNode(ast, "PathExpr") || findNode(ast, "AxisStep"));
    });
});

describe("Declarations", function () {
    it("function declaration", function () {
        const { ast } = parse("declare function local:foo($a) { $a };");
        const fd = findNode(ast, "FunctionDecl");
        assert.ok(fd);
        assert.equal(fd.arity, 1);
        const eqname = findNode(fd, "EQName");
        assert.equal(eqname.value, "local:foo");
    });

    it("variable declaration", function () {
        const { ast } = parse("declare variable $x := 42;");
        assert.ok(findNode(ast, "VarDecl"));
    });

    it("namespace declaration", function () {
        const { ast } = parse('declare namespace foo = "http://example.com";');
        assert.ok(findNode(ast, "NamespaceDecl"));
    });

    it("module declaration", function () {
        const { ast } = parse('module namespace foo = "http://example.com";');
        assert.ok(findNode(ast, "ModuleDecl"));
    });

    it("module import", function () {
        const { ast } = parse('import module namespace foo = "http://example.com";');
        assert.ok(findNode(ast, "Import"));
    });
});

describe("XQuery 3.1 features", function () {
    it("map constructor", function () {
        const { ast } = parse("map { 1: 2 }");
        assert.ok(findNode(ast, "MapConstructor"));
    });

    it("array constructor (curly)", function () {
        const { ast } = parse("array { 1, 2, 3 }");
        assert.ok(findNode(ast, "CurlyArrayConstructor"));
    });

    it("array constructor (square)", function () {
        const { ast } = parse("[1, 2, 3]");
        assert.ok(findNode(ast, "SquareArrayConstructor"));
    });

    it("arrow expression", function () {
        const { ast } = parse('"hello" => upper-case()');
        const arrow = findNode(ast, "ArrowExpr");
        assert.ok(arrow);
        assert.ok(arrow.children.length > 1);
    });

    it("string constructor", function () {
        const { ast } = parse("``[Hello `{$name}` world]``");
        assert.ok(findNode(ast, "StringConstructor"));
    });

    it("try/catch", function () {
        const { ast } = parse("try { 1 div 0 } catch * { 0 }");
        assert.ok(findNode(ast, "TryCatchExpr"));
    });
});

describe("XQuery Update 3.0 expressions", function () {
    it("insert expression", function () {
        const { ast } = parse("insert node <a/> into /root");
        assert.ok(findNode(ast, "InsertExpr"));
    });

    it("delete expression", function () {
        const { ast } = parse("delete node /root/child");
        assert.ok(findNode(ast, "DeleteExpr"));
    });

    it("replace expression", function () {
        const { ast } = parse('replace value of node /root/a with "new"');
        assert.ok(findNode(ast, "ReplaceExpr"));
    });

    it("rename expression", function () {
        const { ast } = parse('rename node /root/a as "b"');
        assert.ok(findNode(ast, "RenameExpr"));
    });

    it("transform (copy-modify) expression", function () {
        const { ast } = parse("copy $x := /root modify delete node $x/a return $x");
        assert.ok(findNode(ast, "TransformExpr"));
    });
});

describe("XQuery Full Text 1.0 expressions", function () {
    it("contains text expression", function () {
        const { ast } = parse('"hello world" contains text "hello"');
        assert.ok(findNode(ast, "FTContainsExpr"));
    });

    it("ft-or expression", function () {
        const { ast } = parse('"text" contains text "foo" ftor "bar"');
        assert.ok(findNode(ast, "FTOr"));
    });

    it("ft-and expression", function () {
        const { ast } = parse('"text" contains text "foo" ftand "bar"');
        assert.ok(findNode(ast, "FTAnd"));
    });

    it("contains text with match options", function () {
        const { ast } = parse('"text" contains text "hello" using stemming');
        assert.ok(findNode(ast, "FTContainsExpr"));
    });

    it("for binding with score variable", function () {
        const { ast } = parse('for $x score $s in /books/book where $x/title contains text "XML" return $x');
        assert.ok(findNode(ast, "FTScoreVar"));
    });
});

describe("eXist-db legacy update expressions (XQUFEL)", function () {
    it("update insert expression", function () {
        const { ast } = parse('update insert <a/> into /root');
        assert.ok(findNode(ast, "ExistUpdateExpr"));
    });

    it("update replace expression", function () {
        const { ast } = parse('update replace /root/a with <b/>');
        assert.ok(findNode(ast, "ExistUpdateExpr"));
    });

    it("update value expression", function () {
        const { ast } = parse('update value /root/a with "new"');
        assert.ok(findNode(ast, "ExistUpdateExpr"));
    });

    it("update delete expression", function () {
        const { ast } = parse('update delete /root/a');
        assert.ok(findNode(ast, "ExistUpdateExpr"));
    });

    it("update rename expression", function () {
        const { ast } = parse('update rename /root/a as "b"');
        assert.ok(findNode(ast, "ExistUpdateExpr"));
    });
});

describe("Position accuracy", function () {
    it("single-line positions are correct", function () {
        const { ast } = parse("1 + 2");
        const lits = findAllNodes(ast, "IntegerLiteral");
        assert.ok(lits.length >= 2);
        // "1" at 0:0
        assert.equal(lits[0].pos.sl, 0);
        assert.equal(lits[0].pos.sc, 0);
        assert.equal(lits[0].pos.el, 0);
        assert.equal(lits[0].pos.ec, 1);
        // "2" at 0:4
        assert.equal(lits[1].pos.sl, 0);
        assert.equal(lits[1].pos.sc, 4);
    });

    it("multiline positions span lines", function () {
        const { ast } = parse("let $x := 1\nreturn\n  $x");
        const flwor = findNode(ast, "FLWORExpr");
        assert.equal(flwor.pos.sl, 0);
        assert.equal(flwor.pos.sc, 0);
        assert.equal(flwor.pos.el, 2);
        assert.equal(flwor.pos.ec, 4);
    });

    it("return clause starts on correct line", function () {
        const { ast } = parse("let $x := 1\nreturn\n  $x");
        const ret = findNode(ast, "ReturnClause");
        assert.equal(ret.pos.sl, 1);
        assert.equal(ret.pos.sc, 0);
    });
});

describe("COLLAPSE_LIST single-child wrappers", function () {
    it("single-child OrExpr is collapsed", function () {
        // "1" goes through OrExpr → AndExpr → ... → IntegerLiteral
        // Single-child wrappers should be collapsed
        const { ast } = parse("1");
        const expr = findNode(ast, "ExprSingle");
        // The child of ExprSingle should NOT be OrExpr wrapping AndExpr etc.
        // It should be collapsed to a deeper node
        const names = expr.children.map(c => c.name);
        assert.ok(!names.includes("OrExpr") || findNode(expr, "OrExpr").children.length > 1,
            "Single-child OrExpr should be collapsed");
    });
});

describe("EQName flattening", function () {
    it("EQName has value and empty children", function () {
        const { ast } = parse("$foo");
        const eqname = findNode(ast, "EQName");
        assert.ok(eqname);
        assert.equal(eqname.value, "foo");
        assert.deepEqual(eqname.children, []);
    });

    it("prefixed EQName has full value", function () {
        const { ast } = parse("local:bar(1)");
        const fc = findNode(ast, "FunctionCall");
        const eqname = findNode(fc, "EQName");
        assert.equal(eqname.value, "local:bar");
        assert.deepEqual(eqname.children, []);
    });
});

describe("URILiteral flattening", function () {
    it("URILiteral has value and empty children", function () {
        const { ast } = parse('module namespace foo = "http://example.com";');
        const uri = findNode(ast, "URILiteral");
        assert.ok(uri);
        assert.equal(uri.value, '"http://example.com"');
        assert.deepEqual(uri.children, []);
    });
});

describe("Arity", function () {
    it("FunctionCall arity matches argument count", function () {
        const { ast: ast0 } = parse("local:foo()");
        assert.equal(findNode(ast0, "FunctionCall").arity, 0);

        const { ast: ast2 } = parse("local:foo(1, 2)");
        assert.equal(findNode(ast2, "FunctionCall").arity, 2);
    });

    it("FunctionDecl arity matches parameter count", function () {
        const { ast } = parse("declare function local:f($a, $b, $c) { 1 };");
        assert.equal(findNode(ast, "FunctionDecl").arity, 3);
    });

    it("zero-arity function declaration", function () {
        const { ast } = parse("declare function local:f() { 1 };");
        assert.equal(findNode(ast, "FunctionDecl").arity, 0);
    });
});

describe("Error recovery", function () {
    it("produces error string on invalid input", function () {
        const { error } = parse("let $x :=");
        assert.ok(error);
        assert.equal(typeof error, "string");
    });

    it("still produces a partial AST on error", function () {
        const { ast, error } = parse("let $x :=");
        assert.ok(error);
        assert.ok(ast);
        assert.equal(ast.name, "XQuery");
    });
});

describe("Adapter internals", function () {
    it("buildLineOffsets returns correct offsets", function () {
        const offsets = adapter.buildLineOffsets("abc\ndef\nghi");
        assert.deepEqual(offsets, [0, 4, 8]);
    });

    it("offsetToLineCol converts correctly", function () {
        const offsets = adapter.buildLineOffsets("abc\ndef\nghi");
        assert.deepEqual(adapter.offsetToLineCol(0, offsets), { line: 0, col: 0 });
        assert.deepEqual(adapter.offsetToLineCol(5, offsets), { line: 1, col: 1 });
        assert.deepEqual(adapter.offsetToLineCol(8, offsets), { line: 2, col: 0 });
    });
});
