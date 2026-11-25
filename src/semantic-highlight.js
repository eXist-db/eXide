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

import { namespace } from "./namespace.js";

export const SemanticHighlight = (function () {

    const StateField = CM6.StateField;
    const StateEffect = CM6.StateEffect;
    const Decoration = CM6.Decoration;
    const EditorView = CM6.EditorView;

    // --- Effect to push new tokens ---
    const setTokens = StateEffect.define();

    // --- CSS classes for semantic token types ---
    const MARK_CLASSES = {
        "function-name":    Decoration.mark({ class: "sem-function-name" }),
        "variable":         Decoration.mark({ class: "sem-variable" }),
        "namespace-prefix": Decoration.mark({ class: "sem-namespace-prefix" }),
        "annotation":       Decoration.mark({ class: "sem-annotation" }),
        "type-name":        Decoration.mark({ class: "sem-type-name" })
    };

    // --- StateField holding the decoration set ---
    const field = StateField.define({
        create () {
            return Decoration.none;
        },
        update (decos, tr) {
            for (let i = 0; i < tr.effects.length; i++) {
                if (tr.effects[i].is(setTokens)) {
                    return tr.effects[i].value;
                }
            }
            if (tr.docChanged) {
                return decos.map(tr.changes);
            }
            return decos;
        },
        provide (f) {
            return EditorView.decorations.from(f);
        }
    });

    /**
     * Walk the AST and collect semantic token ranges.
     * Returns a CM6 DecorationSet sorted by from-position.
     */
    function buildDecorations(ast, doc) {
        const ranges = [];
        const docLength = doc.length;

        function posToOffset(pos) {
            if (pos.sl < 0 || pos.sc < 0) return -1;
            const line = doc.line(pos.sl + 1); // CM6 lines are 1-indexed
            return line.from + pos.sc;
        }

        function addRange(node, type) {
            const from = posToOffset(node.pos);
            const to = posToOffset({ sl: node.pos.el, sc: node.pos.ec });
            if (from >= 0 && to > from && to <= docLength) {
                ranges.push(MARK_CLASSES[type].range(from, to));
            }
        }

        function getChildByName(node, name) {
            if (!node.children) return null;
            for (let i = 0; i < node.children.length; i++) {
                if (node.children[i].name === name) return node.children[i];
            }
            return null;
        }

        function visit(node) {
            if (!node || !node.name) return;

            switch (node.name) {
                case "FunctionCall": {
                    // Highlight the function name (EQName child)
                    const fname = getChildByName(node, "EQName") || getChildByName(node, "QName");
                    if (fname) addRange(fname, "function-name");
                    break;
                }

                case "FunctionDecl": {
                    // Highlight the declared function name
                    const dname = getChildByName(node, "EQName") || getChildByName(node, "QName");
                    if (dname) addRange(dname, "function-name");
                    break;
                }

                case "VarRef":
                case "VarName":
                    addRange(node, "variable");
                    break;

                case "Annotation":
                    addRange(node, "annotation");
                    break;

                case "NamespaceDecl":
                case "ModuleDecl": {
                    // Highlight the prefix NCName
                    const prefix = getChildByName(node, "NCName");
                    if (prefix) addRange(prefix, "namespace-prefix");
                    break;
                }

                case "ModuleImport": {
                    // Highlight the namespace prefix in imports
                    const importPrefix = getChildByName(node, "NCName");
                    if (importPrefix) addRange(importPrefix, "namespace-prefix");
                    break;
                }

                case "AtomicOrUnionType":
                case "SimpleTypeName":
                case "TypeName":
                    addRange(node, "type-name");
                    break;
            }

            // Recurse into children
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    visit(node.children[i]);
                }
            }
        }

        visit(ast);

        // Sort by from-position (required by RangeSet)
        ranges.sort((a, b) => { return a.from - b.from || a.to - b.to; });

        // Remove overlapping ranges (keep first)
        const filtered = [];
        let lastTo = -1;
        for (let i = 0; i < ranges.length; i++) {
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
        extension () {
            return field;
        },

        /**
         * Dispatch new semantic tokens to the editor.
         * Call after parsing/validation.
         *
         * @param {EditorView} editor - the CM6 editor view
         * @param {object} ast - the parsed AST
         */
        update (editor, ast) {
            if (!editor || !ast) return;
            try {
                const decos = buildDecorations(ast, editor.state.doc);
                editor.dispatch({ effects: setTokens.of(decos) });
            } catch (e) {
                console.log("Semantic highlight error (non-fatal): %s", e.message);
            }
        }
    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").SemanticHighlight = SemanticHighlight;
