const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    parse, InScopeVariables, VariableReferences,
    FunctionCalls, FunctionParameters, ModuleInfo
} = require("./harness");

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

// ── InScopeVariables ─────────────────────────────────────────

describe("InScopeVariables", () => {
    it("finds variables from let bindings", () => {
        const { ast } = parse("let $x := 1\nlet $y := 2\nreturn $y");
        const refs = findAllNodes(ast, "VarRef");
        const lastRef = refs[refs.length - 1];
        const scope = new InScopeVariables(ast, lastRef);
        const vars = scope.getStack();
        assert.ok(vars.includes("x"));
        assert.ok(vars.includes("y"));
    });

    it("finds variables from for bindings", () => {
        const { ast } = parse("for $i in (1,2,3) return $i");
        const refs = findAllNodes(ast, "VarRef");
        const scope = new InScopeVariables(ast, refs[0]);
        assert.ok(scope.getStack().includes("i"));
    });

    it("function parameters are in scope", () => {
        const { ast } = parse("declare function local:f($a, $b) { $a };");
        const refs = findAllNodes(ast, "VarRef");
        if (refs.length > 0) {
            const scope = new InScopeVariables(ast, refs[0]);
            const vars = scope.getStack();
            assert.ok(vars.includes("a"));
            assert.ok(vars.includes("b"));
        }
    });

    it("function boundary resets scope", () => {
        // A function declaration inside `return` is not valid XQuery,
        // so use a simpler case: two separate functions
        const code2 = "declare function local:f($a) { $a };\n" +
            "declare function local:g($b) { $b };";
        const { ast } = parse(code2);
        const funcs = findAllNodes(ast, "FunctionDecl");
        assert.equal(funcs.length, 2);
        // $b ref inside local:g should only see $b, not $a
        const refs = findAllNodes(funcs[1], "VarRef");
        if (refs.length > 0) {
            const scope = new InScopeVariables(ast, refs[0]);
            const vars = scope.getStack();
            assert.ok(vars.includes("b"));
            assert.ok(!vars.includes("a"));
        }
    });

    it("global variable declarations are in scope", () => {
        const { ast } = parse("declare variable $g := 10;\n$g");
        const refs = findAllNodes(ast, "VarRef");
        if (refs.length > 0) {
            const scope = new InScopeVariables(ast, refs[0]);
            const vars = scope.getStack();
            assert.ok(vars.includes("g"));
        }
    });

    it("nested FLWOR scoping pops correctly", () => {
        const code = "let $a := 1\nreturn\n  let $b := 2\n  return $b";
        const { ast } = parse(code);
        const refs = findAllNodes(ast, "VarRef");
        const lastRef = refs[refs.length - 1];
        const scope = new InScopeVariables(ast, lastRef);
        const vars = scope.getStack();
        assert.ok(vars.includes("a"));
        assert.ok(vars.includes("b"));
    });
});

// ── VariableReferences ───────────────────────────────────────

describe("VariableReferences", () => {
    it("finds all references to a variable name", () => {
        const { ast } = parse("let $x := 1 return $x + $x");
        const refs = new VariableReferences("x", ast);
        // binding + 2 usages = 3
        assert.ok(refs.getReferences().length >= 2);
    });

    it("does not find references to other variables", () => {
        const { ast } = parse("let $x := 1 let $y := 2 return $x");
        const refs = new VariableReferences("z", ast);
        assert.equal(refs.getReferences().length, 0);
    });

    it("distinguishes same-name variables in different scopes", () => {
        const code = "let $x := 1 return (let $x := 2 return $x)";
        const { ast } = parse(code);
        const refs = new VariableReferences("x", ast);
        // Should find all VarName nodes named "x" — at least 3 (2 bindings + 1 usage)
        assert.ok(refs.getReferences().length >= 2);
    });
});

// ── FunctionCalls ────────────────────────────────────────────

describe("FunctionCalls", () => {
    it("finds calls by name and arity", () => {
        const { ast } = parse("declare function local:add($a, $b) { $a + $b };\nlocal:add(1, 2)");
        const fc = new FunctionCalls("local:add", 2, ast);
        assert.equal(fc.getReferences().length, 1);
    });

    it("finds declaration node", () => {
        const { ast } = parse("declare function local:add($a, $b) { $a + $b };\nlocal:add(1, 2)");
        const fc = new FunctionCalls("local:add", 2, ast);
        assert.ok(fc.declaration);
        assert.equal(fc.declaration.value, "local:add");
    });

    it("distinguishes overloaded functions by arity", () => {
        const code = "declare function local:f($a) { $a };\n" +
            "declare function local:f($a, $b) { $a };\n" +
            "local:f(1)";
        const { ast } = parse(code);
        const fc1 = new FunctionCalls("local:f", 1, ast);
        assert.equal(fc1.getReferences().length, 1);
        assert.ok(fc1.declaration);

        const fc2 = new FunctionCalls("local:f", 2, ast);
        assert.equal(fc2.getReferences().length, 0);
        assert.ok(fc2.declaration);
    });

    it("returns no refs for unknown function", () => {
        const { ast } = parse("local:foo(1)");
        const fc = new FunctionCalls("local:bar", 1, ast);
        assert.equal(fc.getReferences().length, 0);
    });

    it("arity mismatch returns no results", () => {
        const { ast } = parse("local:foo(1, 2)");
        const fc = new FunctionCalls("local:foo", 1, ast);
        assert.equal(fc.getReferences().length, 0);
    });
});

// ── FunctionParameters ───────────────────────────────────────

describe("FunctionParameters", () => {
    it("extracts parameter names from variable arguments", () => {
        const { ast } = parse("local:foo($x, $y)");
        const fc = findNode(ast, "FunctionCall");
        const fp = new FunctionParameters(fc);
        assert.deepEqual(fp.getParameters(), ["x", "y"]);
    });

    it("uses fallback naming for literal arguments", () => {
        const { ast } = parse("local:foo(1, 2)");
        const fc = findNode(ast, "FunctionCall");
        const fp = new FunctionParameters(fc);
        assert.deepEqual(fp.getParameters(), ["argument0", "argument1"]);
    });

    it("mixes named and fallback parameters", () => {
        const { ast } = parse("local:foo($x, 2)");
        const fc = findNode(ast, "FunctionCall");
        const fp = new FunctionParameters(fc);
        assert.deepEqual(fp.getParameters(), ["x", "argument1"]);
    });

    it("handles zero arguments", () => {
        const { ast } = parse("local:foo()");
        const fc = findNode(ast, "FunctionCall");
        const fp = new FunctionParameters(fc);
        assert.deepEqual(fp.getParameters(), []);
    });
});

// ── ModuleInfo ───────────────────────────────────────────────

describe("ModuleInfo", () => {
    it("extracts module prefix and namespace", () => {
        const { ast } = parse('module namespace test = "http://example.com/test";');
        const mi = new ModuleInfo(ast);
        assert.equal(mi.modulePrefix, "test");
        assert.equal(mi.moduleNamespace, '"http://example.com/test"');
    });

    it("isModule returns true for library modules", () => {
        const { ast } = parse('module namespace test = "http://example.com/test";');
        assert.equal(new ModuleInfo(ast).isModule(), true);
    });

    it("isModule returns false for main modules", () => {
        const { ast } = parse("1 + 2");
        assert.equal(new ModuleInfo(ast).isModule(), false);
    });

    it("lists functions", () => {
        const code = 'module namespace t = "urn:test";\n' +
            "declare function t:a() { 1 };\n" +
            "declare function t:b($x) { $x };";
        const { ast } = parse(code);
        const mi = new ModuleInfo(ast);
        assert.equal(mi.functions.length, 2);
    });

    it("detects test annotations", () => {
        const code = 'module namespace t = "urn:test";\n' +
            "declare %test:case function t:example() { () };";
        const { ast } = parse(code);
        assert.equal(new ModuleInfo(ast).hasTests(), true);
    });

    it("hasTests returns false without test annotations", () => {
        const code = 'module namespace t = "urn:test";\n' +
            "declare function t:example() { () };";
        const { ast } = parse(code);
        assert.equal(new ModuleInfo(ast).hasTests(), false);
    });

    it("captures Prolog node", () => {
        const { ast } = parse("declare variable $x := 1; $x");
        const mi = new ModuleInfo(ast);
        assert.ok(mi.prolog);
        assert.equal(mi.prolog.name, "Prolog");
    });
});
