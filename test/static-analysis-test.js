const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("./harness");
const { staticAnalysis } = require("../src/static-analysis.js");

function analyze(code) {
    const result = parse(code);
    return staticAnalysis.analyze(result.ast);
}

function findMarker(markers, pattern) {
    return markers.find((m) => { return m.message.indexOf(pattern) !== -1; });
}

function findMarkers(markers, pattern) {
    return markers.filter((m) => { return m.message.indexOf(pattern) !== -1; });
}

describe("Static analysis: namespace checks", () => {
    it("warns on unused namespace prefix", () => {
        const result = analyze('declare namespace foo = "http://example.com";\n1');
        const m = findMarker(result.markers, "unused namespace prefix");
        assert.ok(m, "expected unused namespace warning");
        assert.equal(m.type, "warning");
        assert.ok(m.message.indexOf('"foo"') !== -1);
        assert.equal(m.prefix, "foo");
        assert.equal(m.nsType, "decl");
    });

    it("does not warn when namespace prefix is used", () => {
        const result = analyze('declare namespace foo = "http://example.com";\nfoo:bar()');
        const m = findMarker(result.markers, "unused namespace prefix");
        // Should not have a warning for "foo" — it's used
        if (m) {
            assert.ok(m.message.indexOf('"foo"') === -1, "foo should not be flagged as unused");
        }
    });

    it("errors on duplicate namespace binding (XQST0033)", () => {
        const result = analyze(
            'declare namespace foo = "http://example.com";\n' +
            'declare namespace foo = "http://other.com";\n1'
        );
        const m = findMarker(result.markers, "XQST0033");
        assert.ok(m, "expected XQST0033 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate module import prefix (XQST0033)", () => {
        const result = analyze(
            'import module namespace foo = "http://example.com";\n' +
            'import module namespace foo = "http://other.com";\n1'
        );
        const m = findMarker(result.markers, "XQST0033");
        assert.ok(m, "expected XQST0033 error");
    });

    it("errors on undeclared namespace prefix (XPST0081)", () => {
        const result = analyze("bogus:func()");
        const m = findMarker(result.markers, "XPST0081");
        assert.ok(m, "expected XPST0081 error");
        assert.equal(m.type, "error");
        assert.equal(m.prefix, "bogus");
    });

    it("errors on undeclared prefix in FLWOR expression (XPST0081)", () => {
        const result = analyze("let $x := foo:bar()\nreturn $x");
        const m = findMarker(result.markers, "XPST0081");
        assert.ok(m, "expected XPST0081 error for undeclared prefix foo");
        assert.equal(m.type, "error");
        assert.equal(m.prefix, "foo");
    });

    it("does not error on built-in prefixes (fn, xs, local, err)", () => {
        const result = analyze("fn:count(xs:integer(1))");
        const m = findMarker(result.markers, "XPST0081");
        assert.ok(!m, "should not error on built-in prefixes");
    });
});

describe("Static analysis: variable scoping", () => {
    it("errors on undeclared variable (XPST0008)", () => {
        const result = analyze("$undeclared");
        const m = findMarker(result.markers, "XPST0008");
        assert.ok(m, "expected XPST0008 error");
        assert.equal(m.type, "error");
        assert.ok(m.message.indexOf("undeclared") !== -1);
    });

    it("warns on unused variable", () => {
        const result = analyze("let $x := 1\nreturn 2");
        const m = findMarker(result.markers, "unused variable");
        assert.ok(m, "expected unused variable warning");
        assert.equal(m.type, "warning");
        assert.equal(m.hasResolution, true);
    });

    it("does not warn on used variable", () => {
        const result = analyze("let $x := 1\nreturn $x");
        const m = findMarker(result.markers, "unused variable");
        assert.ok(!m, "should not warn on used variable");
    });

    it("does not warn on unused public VarDecl", () => {
        const result = analyze('declare variable $unused := 1;\n1');
        const m = findMarker(result.markers, "unused variable");
        assert.ok(!m, "should not warn on public VarDecl");
    });

    it("handles nested FLWOR scoping", () => {
        const result = analyze(
            "let $x := 1\n" +
            "return\n" +
            "  let $y := $x\n" +
            "  return $y"
        );
        const errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0, "all variables should be declared");
        const unused = findMarkers(result.markers, "unused variable");
        assert.equal(unused.length, 0, "all variables should be used");
    });

    it("handles for binding scoping", () => {
        const result = analyze(
            "for $x in (1, 2, 3)\n" +
            "return $x"
        );
        const errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0);
    });
});

describe("Static analysis: duplicate declarations", () => {
    it("errors on duplicate variable declaration (XQST0049)", () => {
        const result = analyze(
            'declare variable $x := 1;\n' +
            'declare variable $x := 2;\n1'
        );
        const m = findMarker(result.markers, "XQST0049");
        assert.ok(m, "expected XQST0049 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate parameter name (XQST0039)", () => {
        const result = analyze(
            'declare function local:test($a, $a) { $a };\n' +
            'local:test(1, 2)'
        );
        const m = findMarker(result.markers, "XQST0039");
        assert.ok(m, "expected XQST0039 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate function declaration (XQST0034)", () => {
        const result = analyze(
            'declare function local:test($a) { $a };\n' +
            'declare function local:test($b) { $b };\n' +
            'local:test(1)'
        );
        const m = findMarker(result.markers, "XQST0034");
        assert.ok(m, "expected XQST0034 error");
        assert.equal(m.type, "error");
    });

    it("allows same function name with different arity", () => {
        const result = analyze(
            'declare function local:test($a) { $a };\n' +
            'declare function local:test($a, $b) { $a };\n' +
            'local:test(1)'
        );
        const m = findMarker(result.markers, "XQST0034");
        assert.ok(!m, "different arity should not trigger XQST0034");
    });
});

describe("Static analysis: function params in scope", () => {
    it("function params are in scope within body", () => {
        const result = analyze(
            'declare function local:add($a, $b) { $a + $b };\n' +
            'local:add(1, 2)'
        );
        const errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0, "function params should be in scope");
    });
});

describe("Static analysis: marker shape", () => {
    it("markers have correct shape", () => {
        const result = analyze("$undeclared");
        assert.ok(result.markers.length > 0);
        const m = result.markers[0];
        assert.ok(m.pos, "marker should have pos");
        assert.equal(typeof m.pos.sl, "number");
        assert.equal(typeof m.pos.sc, "number");
        assert.equal(typeof m.pos.el, "number");
        assert.equal(typeof m.pos.ec, "number");
        assert.equal(m.lang, "xquery");
        assert.ok(m.type === "error" || m.type === "warning");
        assert.ok(m.level === "error" || m.level === "warning");
        assert.equal(typeof m.message, "string");
    });
});
