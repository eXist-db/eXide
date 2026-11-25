/**
 * Matching tag highlight for XML/HTML modes.
 *
 * When the cursor is inside a tag name, highlights the matching
 * open/close tag with a subtle background. Uses CM6's syntax tree
 * to find Element nodes and their OpenTag/CloseTag children.
 */

import { eXide, namespace } from "./namespace.js";

export const TagMatching = (function () {

    const Decoration = CM6.Decoration;
    const ViewPlugin = CM6.ViewPlugin;
    const StateField = CM6.StateField;
    const StateEffect = CM6.StateEffect;

    const matchDeco = Decoration.mark({ class: "cm-matchingTag" });
    const matchEffect = StateEffect.define();
    const clearEffect = StateEffect.define();

    const matchField = StateField.define({
        create: function () { return Decoration.none; },
        update: function (value, tr) {
            for (let i = 0; i < tr.effects.length; i++) {
                if (tr.effects[i].is(matchEffect)) {
                    const ranges = tr.effects[i].value;
                    return Decoration.set(ranges.map(function (r) {
                        return matchDeco.range(r.from, r.to);
                    }), true);
                }
                if (tr.effects[i].is(clearEffect)) {
                    return Decoration.none;
                }
            }
            return value;
        },
        provide: function (f) { return CM6.EditorView.decorations.from(f); }
    });

    const tagPlugin = ViewPlugin.fromClass(function TagMatchingPlugin(view) {
        this.view = view;
        this.lastHead = -1;
    }, {
        update: function (update) {
            if (!update.selectionSet && !update.docChanged) return;

            const view = update.view;
            const state = update.state;
            const head = state.selection.main.head;

            // Only for XML/HTML modes
            const doc = typeof eXide !== "undefined" && eXide.app && eXide.app.getEditor &&
                      eXide.app.getEditor() && eXide.app.getEditor().getActiveDocument();
            if (!doc) return;
            const syntax = doc.getSyntax();
            if (syntax !== "xml" && syntax !== "html") {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            const tree = CM6.syntaxTree(state);
            const node = tree.resolveInner(head, 0);

            // Find the Element ancestor
            let element = null;
            let cur = node;
            while (cur) {
                if (cur.name === "Element") {
                    element = cur;
                    break;
                }
                cur = cur.parent;
            }

            if (!element) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Find OpenTag and CloseTag children
            let openTag = null;
            let closeTag = null;
            let child = element.firstChild;
            while (child) {
                if (child.name === "OpenTag") openTag = child;
                if (child.name === "CloseTag") closeTag = child;
                if (child.name === "SelfClosingTag") openTag = child;
                child = child.nextSibling;
            }

            if (!openTag || !closeTag) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Find TagName in each
            const openTagName = findTagName(openTag);
            const closeTagName = findTagName(closeTag);

            if (!openTagName || !closeTagName) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Check if cursor is inside the open or close tag
            const inOpen = head >= openTag.from && head <= openTag.to;
            const inClose = head >= closeTag.from && head <= closeTag.to;

            if (!inOpen && !inClose) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Highlight the matching tag name (the other one)
            const ranges = [];
            if (inOpen) {
                ranges.push({ from: closeTagName.from, to: closeTagName.to });
            } else {
                ranges.push({ from: openTagName.from, to: openTagName.to });
            }
            // Also highlight the current tag name
            if (inOpen) {
                ranges.push({ from: openTagName.from, to: openTagName.to });
            } else {
                ranges.push({ from: closeTagName.from, to: closeTagName.to });
            }

            view.dispatch({ effects: matchEffect.of(ranges) });
            this.lastHead = head;
        }
    });

    function findTagName(tagNode) {
        let child = tagNode.firstChild;
        while (child) {
            if (child.name === "TagName") return child;
            child = child.nextSibling;
        }
        return null;
    }

    function extension() {
        return [matchField, tagPlugin];
    }

    return {
        extension: extension
    };
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").TagMatching = TagMatching;
