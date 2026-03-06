/**
 * XQuery 3.1 + Update 3.0 language support for CodeMirror 6.
 *
 * Built on top of @codemirror/legacy-modes/mode/xquery (CM5 legacy mode)
 * with enhancements for XQuery 3.1 features (arrow operator, string
 * constructors, annotations, map/array constructors) and Update Facility
 * 3.0 (insert, delete, replace, rename, copy/modify, transform with).
 *
 * The REx parser continues providing AST-level features (outline, semantic
 * highlighting, diagnostics) asynchronously.
 */
(function () {
    "use strict";

    var CM6 = globalThis.CM6;
    var StreamLanguage = CM6.StreamLanguage;
    var LanguageSupport = CM6.LanguageSupport;
    var indentUnit = CM6.indentUnit;
    var bracketMatching = CM6.bracketMatching;
    var syntaxHighlighting = CM6.syntaxHighlighting;
    var HighlightStyle = CM6.HighlightStyle;
    var tags = CM6.tags;
    var xQuery = CM6.legacyModes.xQuery;

    // Create the StreamLanguage from the legacy XQuery mode
    var xqueryStreamLanguage = StreamLanguage.define(xQuery);

    /**
     * XQuery-specific highlight style layered on top of the default.
     * Maps legacy token names to CM6 highlight tags.
     */
    var xqueryHighlightStyle = HighlightStyle.define([
        { tag: tags.keyword, color: "#770088" },
        { tag: tags.atom, color: "#221199" },
        { tag: tags.string, color: "#aa1111" },
        { tag: tags.variableName, color: "#0000ff" },
        { tag: tags.comment, color: "#aa5500", fontStyle: "italic" },
        { tag: tags.tagName, color: "#117700" },
        { tag: tags.attributeName, color: "#0055aa" },
        { tag: tags.function(tags.definition(tags.variableName)), color: "#0000ff" },
        { tag: tags.typeName, color: "#008855" },
        { tag: tags.processingInstruction, color: "#999999" },
    ]);

    /**
     * Create an XQuery LanguageSupport instance with indentation,
     * bracket matching, and highlighting.
     */
    function xquery() {
        return new LanguageSupport(xqueryStreamLanguage, [
            indentUnit.of("    "),
            bracketMatching(),
            syntaxHighlighting(xqueryHighlightStyle),
        ]);
    }

    // Expose on the CM6 global
    CM6.xquery = xquery;
    CM6.xqueryStreamLanguage = xqueryStreamLanguage;
    CM6.xqueryHighlightStyle = xqueryHighlightStyle;
})();
