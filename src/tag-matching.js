/**
 * Matching tag highlight for XML/HTML modes.
 *
 * When the cursor is inside a tag name, highlights the matching
 * open/close tag with a subtle background. Uses CM6's syntax tree
 * to find Element nodes and their OpenTag/CloseTag children.
 */
eXide.namespace("eXide.edit.TagMatching");

eXide.edit.TagMatching = (function () {

    var Decoration = CM6.Decoration;
    var ViewPlugin = CM6.ViewPlugin;
    var StateField = CM6.StateField;
    var StateEffect = CM6.StateEffect;

    var matchDeco = Decoration.mark({ class: "cm-matchingTag" });
    var matchEffect = StateEffect.define();
    var clearEffect = StateEffect.define();

    var matchField = StateField.define({
        create: function () { return Decoration.none; },
        update: function (value, tr) {
            for (var i = 0; i < tr.effects.length; i++) {
                if (tr.effects[i].is(matchEffect)) {
                    var ranges = tr.effects[i].value;
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

    var tagPlugin = ViewPlugin.fromClass(function TagMatchingPlugin(view) {
        this.view = view;
        this.lastHead = -1;
    }, {
        update: function (update) {
            if (!update.selectionSet && !update.docChanged) return;

            var view = update.view;
            var state = update.state;
            var head = state.selection.main.head;

            // Only for XML/HTML modes
            var doc = typeof eXide !== "undefined" && eXide.app && eXide.app.getEditor &&
                      eXide.app.getEditor() && eXide.app.getEditor().getActiveDocument();
            if (!doc) return;
            var syntax = doc.getSyntax();
            if (syntax !== "xml" && syntax !== "html") {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            var tree = CM6.syntaxTree(state);
            var node = tree.resolveInner(head, 0);

            // Find the Element ancestor
            var element = null;
            var cur = node;
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
            var openTag = null;
            var closeTag = null;
            var child = element.firstChild;
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
            var openTagName = findTagName(openTag);
            var closeTagName = findTagName(closeTag);

            if (!openTagName || !closeTagName) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Check if cursor is inside the open or close tag
            var inOpen = head >= openTag.from && head <= openTag.to;
            var inClose = head >= closeTag.from && head <= closeTag.to;

            if (!inOpen && !inClose) {
                if (this.lastHead !== -1) {
                    view.dispatch({ effects: clearEffect.of(null) });
                    this.lastHead = -1;
                }
                return;
            }

            // Highlight the matching tag name (the other one)
            var ranges = [];
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
        var child = tagNode.firstChild;
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
