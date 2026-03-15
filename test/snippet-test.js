const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

/**
 * parseSignature — extracted from src/util.js for unit testing.
 * Converts a function signature like "util:wait($interval as xs:integer)"
 * into a CM6-compatible snippet template "util:wait(${1:$interval})".
 */
function parseSignature(signature) {
    var p = signature.indexOf("(");
    if (p > -1) {
        var parsed = signature.substring(0, p + 1);
        signature = signature.substring(p);
        var vars = signature.match(/\$[^\s,\)]+/g);
        if (vars) {
            for (var i = 0; i < vars.length; i++) {
                if (i > 0)
                    parsed += ", ";
                parsed += "${" + (i + 1) + ":$" + vars[i].substring(1) + "}";
            }
        }
        parsed += ")";
        return parsed;
    }
    return signature;
}

// ── parseSignature ──────────────────────────────────────────

describe("parseSignature", function () {
    it("converts single-param signature to snippet", function () {
        var result = parseSignature("util:wait($interval as xs:integer)");
        assert.equal(result, "util:wait(${1:$interval})");
    });

    it("converts multi-param signature to snippet", function () {
        var result = parseSignature("xmldb:copy($source as xs:string, $target as xs:string)");
        assert.equal(result, "xmldb:copy(${1:$source}, ${2:$target})");
    });

    it("handles zero-arity functions", function () {
        var result = parseSignature("fn:current-dateTime()");
        assert.equal(result, "fn:current-dateTime()");
    });

    it("returns signature unchanged when no parens", function () {
        var result = parseSignature("no-parens");
        assert.equal(result, "no-parens");
    });

    it("produces valid CM6 snippet syntax (no backslash escaping)", function () {
        var result = parseSignature("util:wait($interval as xs:integer)");
        // Must NOT contain \$ — CM6 treats \$ as literal backslash + dollar
        assert.ok(!result.includes("\\$"), "snippet must not contain backslash-escaped dollar signs");
        // Must contain ${1:$interval} — CM6 natively handles $ in labels
        assert.ok(result.includes("${1:$interval}"));
    });

    it("strips type annotations from param names", function () {
        var result = parseSignature("fn:substring($value as xs:string, $start as xs:double, $length as xs:double)");
        assert.equal(result, "fn:substring(${1:$value}, ${2:$start}, ${3:$length})");
    });
});
