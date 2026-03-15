/*
 *  Semantic highlighting for XQuery via CM6 Decorations.
 *
 *  Walks the REx parser AST and applies CSS classes to tokens that the
 *  basic syntax grammar cannot distinguish: function names, variable
 *  references, namespace prefixes, annotations, and type names.
 *
 *  Usage:
 *    - Add semanticHighlightField to the editor extensions
 *    - After parsing, dispatch setSemanticTokens effect with the AST
 */
eXide.namespace("eXide.edit.SemanticHighlight");

eXide.edit.SemanticHighlight = (function () {

    var StateField = CM6.StateField;
    var StateEffect = CM6.StateEffect;
    var Decoration = CM6.Decoration;
    var EditorView = CM6.EditorView;

    // --- Effect to push new tokens ---
    var setTokens = StateEffect.define();

    // --- CSS classes for semantic token types ---
    var MARK_CLASSES = {
        "function-name":    Decoration.mark({ class: "sem-function-name" }),
        "variable":         Decoration.mark({ class: "sem-variable" }),
        "namespace-prefix": Decoration.mark({ class: "sem-namespace-prefix" }),
        "annotation":       Decoration.mark({ class: "sem-annotation" }),
        "type-name":        Decoration.mark({ class: "sem-type-name" })
    };

    // --- StateField holding the decoration set ---
    var field = StateField.define({
        create: function () {
            return Decoration.none;
        },
        update: function (decos, tr) {
            for (var i = 0; i < tr.effects.length; i++) {
                if (tr.effects[i].is(setTokens)) {
                    return tr.effects[i].value;
                }
            }
            if (tr.docChanged) {
                return decos.map(tr.changes);
            }
            return decos;
        },
        provide: function (f) {
            return EditorView.decorations.from(f);
        }
    });

    /**
     * Walk the AST and collect semantic token ranges.
     * Returns a CM6 DecorationSet sorted by from-position.
     */
    function buildDecorations(ast, doc) {
        var ranges = [];
        var docLength = doc.length;

        function posToOffset(pos) {
            if (pos.sl < 0 || pos.sc < 0) return -1;
            var line = doc.line(pos.sl + 1); // CM6 lines are 1-indexed
            return line.from + pos.sc;
        }

        function addRange(node, type) {
            var from = posToOffset(node.pos);
            var to = posToOffset({ sl: node.pos.el, sc: node.pos.ec });
            if (from >= 0 && to > from && to <= docLength) {
                ranges.push(MARK_CLASSES[type].range(from, to));
            }
        }

        function getChildByName(node, name) {
            if (!node.children) return null;
            for (var i = 0; i < node.children.length; i++) {
                if (node.children[i].name === name) return node.children[i];
            }
            return null;
        }

        function visit(node) {
            if (!node || !node.name) return;

            switch (node.name) {
                case "FunctionCall":
                    // Highlight the function name (EQName child)
                    var fname = getChildByName(node, "EQName") || getChildByName(node, "QName");
                    if (fname) addRange(fname, "function-name");
                    break;

                case "FunctionDecl":
                    // Highlight the declared function name
                    var dname = getChildByName(node, "EQName") || getChildByName(node, "QName");
                    if (dname) addRange(dname, "function-name");
                    break;

                case "VarRef":
                case "VarName":
                    addRange(node, "variable");
                    break;

                case "Annotation":
                    addRange(node, "annotation");
                    break;

                case "NamespaceDecl":
                case "ModuleDecl":
                    // Highlight the prefix NCName
                    var prefix = getChildByName(node, "NCName");
                    if (prefix) addRange(prefix, "namespace-prefix");
                    break;

                case "ModuleImport":
                    // Highlight the namespace prefix in imports
                    var importPrefix = getChildByName(node, "NCName");
                    if (importPrefix) addRange(importPrefix, "namespace-prefix");
                    break;

                case "AtomicOrUnionType":
                case "SimpleTypeName":
                case "TypeName":
                    addRange(node, "type-name");
                    break;
            }

            // Recurse into children
            if (node.children) {
                for (var i = 0; i < node.children.length; i++) {
                    visit(node.children[i]);
                }
            }
        }

        visit(ast);

        // Sort by from-position (required by RangeSet)
        ranges.sort(function (a, b) { return a.from - b.from || a.to - b.to; });

        // Remove overlapping ranges (keep first)
        var filtered = [];
        var lastTo = -1;
        for (var i = 0; i < ranges.length; i++) {
            if (ranges[i].from >= lastTo) {
                filtered.push(ranges[i]);
                lastTo = ranges[i].to;
            }
        }

        return Decoration.set(filtered);
    }

    return {
        /**
         * CM6 extension — add to editor extensions array.
         */
        extension: function () {
            return field;
        },

        /**
         * Dispatch new semantic tokens to the editor.
         * Call after parsing/validation.
         *
         * @param {EditorView} editor - the CM6 editor view
         * @param {object} ast - the parsed AST
         */
        update: function (editor, ast) {
            if (!editor || !ast) return;
            try {
                var decos = buildDecorations(ast, editor.state.doc);
                editor.dispatch({ effects: setTokens.of(decos) });
            } catch (e) {
                console.log("Semantic highlight error (non-fatal): %s", e.message);
            }
        }
    };
}());
