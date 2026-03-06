const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("./harness");
const staticAnalysis = require("../src/static-analysis.js");

function analyze(code) {
    var result = parse(code);
    return staticAnalysis.analyze(result.ast);
}

function findMarker(markers, pattern) {
    return markers.find(function (m) { return m.message.indexOf(pattern) !== -1; });
}

function findMarkers(markers, pattern) {
    return markers.filter(function (m) { return m.message.indexOf(pattern) !== -1; });
}

describe("Static analysis: namespace checks", function () {
    it("warns on unused namespace prefix", function () {
        var result = analyze('declare namespace foo = "http://example.com";\n1');
        var m = findMarker(result.markers, "unused namespace prefix");
        assert.ok(m, "expected unused namespace warning");
        assert.equal(m.type, "warning");
        assert.ok(m.message.indexOf('"foo"') !== -1);
        assert.equal(m.prefix, "foo");
        assert.equal(m.nsType, "decl");
    });

    it("does not warn when namespace prefix is used", function () {
        var result = analyze('declare namespace foo = "http://example.com";\nfoo:bar()');
        var m = findMarker(result.markers, "unused namespace prefix");
        // Should not have a warning for "foo" — it's used
        if (m) {
            assert.ok(m.message.indexOf('"foo"') === -1, "foo should not be flagged as unused");
        }
    });

    it("errors on duplicate namespace binding (XQST0033)", function () {
        var result = analyze(
            'declare namespace foo = "http://example.com";\n' +
            'declare namespace foo = "http://other.com";\n1'
        );
        var m = findMarker(result.markers, "XQST0033");
        assert.ok(m, "expected XQST0033 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate module import prefix (XQST0033)", function () {
        var result = analyze(
            'import module namespace foo = "http://example.com";\n' +
            'import module namespace foo = "http://other.com";\n1'
        );
        var m = findMarker(result.markers, "XQST0033");
        assert.ok(m, "expected XQST0033 error");
    });

    it("errors on undeclared namespace prefix (XPST0081)", function () {
        var result = analyze("bogus:func()");
        var m = findMarker(result.markers, "XPST0081");
        assert.ok(m, "expected XPST0081 error");
        assert.equal(m.type, "error");
        assert.equal(m.prefix, "bogus");
    });

    it("does not error on built-in prefixes (fn, xs, local, err)", function () {
        var result = analyze("fn:count(xs:integer(1))");
        var m = findMarker(result.markers, "XPST0081");
        assert.ok(!m, "should not error on built-in prefixes");
    });
});

describe("Static analysis: variable scoping", function () {
    it("errors on undeclared variable (XPST0008)", function () {
        var result = analyze("$undeclared");
        var m = findMarker(result.markers, "XPST0008");
        assert.ok(m, "expected XPST0008 error");
        assert.equal(m.type, "error");
        assert.ok(m.message.indexOf("undeclared") !== -1);
    });

    it("warns on unused variable", function () {
        var result = analyze("let $x := 1\nreturn 2");
        var m = findMarker(result.markers, "unused variable");
        assert.ok(m, "expected unused variable warning");
        assert.equal(m.type, "warning");
        assert.equal(m.hasResolution, true);
    });

    it("does not warn on used variable", function () {
        var result = analyze("let $x := 1\nreturn $x");
        var m = findMarker(result.markers, "unused variable");
        assert.ok(!m, "should not warn on used variable");
    });

    it("does not warn on unused public VarDecl", function () {
        var result = analyze('declare variable $unused := 1;\n1');
        var m = findMarker(result.markers, "unused variable");
        assert.ok(!m, "should not warn on public VarDecl");
    });

    it("handles nested FLWOR scoping", function () {
        var result = analyze(
            "let $x := 1\n" +
            "return\n" +
            "  let $y := $x\n" +
            "  return $y"
        );
        var errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0, "all variables should be declared");
        var unused = findMarkers(result.markers, "unused variable");
        assert.equal(unused.length, 0, "all variables should be used");
    });

    it("handles for binding scoping", function () {
        var result = analyze(
            "for $x in (1, 2, 3)\n" +
            "return $x"
        );
        var errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0);
    });
});

describe("Static analysis: duplicate declarations", function () {
    it("errors on duplicate variable declaration (XQST0049)", function () {
        var result = analyze(
            'declare variable $x := 1;\n' +
            'declare variable $x := 2;\n1'
        );
        var m = findMarker(result.markers, "XQST0049");
        assert.ok(m, "expected XQST0049 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate parameter name (XQST0039)", function () {
        var result = analyze(
            'declare function local:test($a, $a) { $a };\n' +
            'local:test(1, 2)'
        );
        var m = findMarker(result.markers, "XQST0039");
        assert.ok(m, "expected XQST0039 error");
        assert.equal(m.type, "error");
    });

    it("errors on duplicate function declaration (XQST0034)", function () {
        var result = analyze(
            'declare function local:test($a) { $a };\n' +
            'declare function local:test($b) { $b };\n' +
            'local:test(1)'
        );
        var m = findMarker(result.markers, "XQST0034");
        assert.ok(m, "expected XQST0034 error");
        assert.equal(m.type, "error");
    });

    it("allows same function name with different arity", function () {
        var result = analyze(
            'declare function local:test($a) { $a };\n' +
            'declare function local:test($a, $b) { $a };\n' +
            'local:test(1)'
        );
        var m = findMarker(result.markers, "XQST0034");
        assert.ok(!m, "different arity should not trigger XQST0034");
    });
});

describe("Static analysis: function params in scope", function () {
    it("function params are in scope within body", function () {
        var result = analyze(
            'declare function local:add($a, $b) { $a + $b };\n' +
            'local:add(1, 2)'
        );
        var errors = findMarkers(result.markers, "XPST0008");
        assert.equal(errors.length, 0, "function params should be in scope");
    });
});

describe("Static analysis: marker shape", function () {
    it("markers have correct shape", function () {
        var result = analyze("$undeclared");
        assert.ok(result.markers.length > 0);
        var m = result.markers[0];
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
