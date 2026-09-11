/**
 * Tests for the error panel formatters in src/error-status-ui.js.
 *
 * Covers the existdb-openapi error-envelope parity: the panel/hover dump must
 * prefer the concise `message` (existdb-openapi#71) over the verbose `raw`,
 * while staying compatible with the older { code, description, module, value }
 * shape and the oldest { error }-only / unstructured shapes.
 *
 * The envelope samples below are the real responses captured from running
 * `1 + "oops"` against existdb-openapi at three versions.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatStructuredPanelHtml, formatTitleDump, makeShortLabel } =
    require("../src/error-status-ui.js");

// existdb-openapi#71 envelope (HTTP 400): concise message + raw boilerplate.
const E71 = {
    code: "err:XPTY0004",
    message: "'xs:string(oops)' can not be an operand for +",
    line: 1,
    column: 3,
    raw: "It is a type error if, during the static analysis phase, an expression is found to have a static type that is not appropriate."
};

// Current existdb-openapi release (≤ v0.9.7): a generic { error } string, no
// code/line/message. #71's clean QueryError shape is not yet released.
const EGENERIC = { error: "Invalid context-item: 'xs:string(oops)' can not be an operand for +" };

describe("error-status-ui formatters — envelope parity", () => {

    it("#71: panel shows the concise message, not the raw boilerplate", () => {
        const html = formatStructuredPanelHtml(E71, "");
        assert.match(html, /err:XPTY0004/);
        assert.match(html, /line 1, column 3/);
        assert.match(html, /can not be an operand/);          // the message
        assert.doesNotMatch(html, /It is a type error if/);   // boilerplate stays out of the panel
    });

    it("#71: hover dump exposes the raw boilerplate under Raw", () => {
        const dump = formatTitleDump(E71, "");
        assert.match(dump, /Code:\s+err:XPTY0004/);
        assert.match(dump, /Location:\s+line 1, column 3/);
        assert.match(dump, /Description: .*can not be an operand/);
        assert.match(dump, /Raw:\s+It is a type error if/);   // verbose detail preserved
    });

    it("generic { error } (current release) falls back to plain text, never blank", () => {
        const html = formatStructuredPanelHtml(EGENERIC, "");
        assert.notEqual(html, "");                            // not an empty panel
        assert.match(html, /can not be an operand/);          // the error text is shown
        const dump = formatTitleDump(EGENERIC, "");
        assert.match(dump, /can not be an operand/);
        assert.doesNotMatch(dump, /Raw:/);                    // no raw field on this shape
    });

    it("no structured object falls back to the raw-text formatter", () => {
        const html = formatStructuredPanelHtml(null, "Cannot compile xquery: boom");
        assert.match(html, /boom/);
        assert.equal(formatTitleDump(null, "rawonly"), "rawonly");
    });

    it("makeShortLabel strips boilerplate and location", () => {
        const label = makeShortLabel("err:XPST0017 Call to undeclared function: local:foo [at line 3, column 5]");
        assert.equal(label, "Call to undeclared function: local:foo");
    });
});
