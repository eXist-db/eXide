/**
 * Thin shim mapping common Ace editor patterns to CodeMirror 6 equivalents.
 *
 * This provides a migration bridge so that mode helpers, commands, and other
 * files can gradually transition from Ace APIs to CM6 APIs.
 */
(function () {
    "use strict";

    var CM6 = globalThis.CM6;
    var EditorView = CM6.EditorView;
    var EditorState = CM6.EditorState;
    var Compartment = CM6.Compartment;
    var StateEffect = CM6.StateEffect;
    var setDiagnostics = CM6.setDiagnostics;

    /**
     * Convert a CM6 offset position to an Ace-style {row, column} position.
     */
    function offsetToRowCol(state, offset) {
        var line = state.doc.lineAt(offset);
        return { row: line.number - 1, column: offset - line.from };
    }

    /**
     * Convert an Ace-style {row, column} position to a CM6 offset.
     */
    function rowColToOffset(state, row, column) {
        if (row < 0) row = 0;
        var maxLine = state.doc.lines;
        if (row >= maxLine) row = maxLine - 1;
        var line = state.doc.line(row + 1);
        var col = Math.min(column || 0, line.length);
        return line.from + col;
    }

    /**
     * Get the current cursor position as {row, column}.
     */
    function getCursorPosition(view) {
        return offsetToRowCol(view.state, view.state.selection.main.head);
    }

    /**
     * Get the selection lead (same as cursor in CM6).
     */
    function getSelectionLead(view) {
        return getCursorPosition(view);
    }

    /**
     * Check if the selection is empty (no text selected).
     */
    function isSelectionEmpty(view) {
        return view.state.selection.main.empty;
    }

    /**
     * Get the selection range as Ace-style {start: {row,column}, end: {row,column}}.
     */
    function getSelectionRange(view) {
        var sel = view.state.selection.main;
        return {
            start: offsetToRowCol(view.state, sel.from),
            end: offsetToRowCol(view.state, sel.to)
        };
    }

    /**
     * Get the document text.
     */
    function getValue(view) {
        return view.state.doc.toString();
    }

    /**
     * Set the entire document text.
     */
    function setValue(view, text) {
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: text }
        });
    }

    /**
     * Get a single line's text (0-indexed row).
     */
    function getLine(view, row) {
        var lineNum = row + 1;
        if (lineNum < 1 || lineNum > view.state.doc.lines) return "";
        return view.state.doc.line(lineNum).text;
    }

    /**
     * Get all lines as an array.
     */
    function getAllLines(view) {
        var lines = [];
        for (var i = 1; i <= view.state.doc.lines; i++) {
            lines.push(view.state.doc.line(i).text);
        }
        return lines;
    }

    /**
     * Get the number of lines in the document.
     */
    function getLength(view) {
        return view.state.doc.lines;
    }

    /**
     * Get the text within an Ace-style range {start: {row,column}, end: {row,column}}.
     */
    function getTextRange(view, range) {
        var from = rowColToOffset(view.state, range.start.row, range.start.column);
        var to = rowColToOffset(view.state, range.end.row, range.end.column);
        return view.state.sliceDoc(from, to);
    }

    /**
     * Insert text at the current cursor position.
     */
    function insert(view, text) {
        var pos = view.state.selection.main.head;
        view.dispatch({
            changes: { from: pos, insert: text },
            selection: { anchor: pos + text.length }
        });
    }

    /**
     * Replace text in an Ace-style range.
     */
    function replaceRange(view, range, text) {
        var from = rowColToOffset(view.state, range.start.row, range.start.column);
        var to = rowColToOffset(view.state, range.end.row, range.end.column);
        view.dispatch({
            changes: { from: from, to: to, insert: text }
        });
    }

    /**
     * Remove text in an Ace-style range.
     */
    function removeRange(view, range) {
        replaceRange(view, range, "");
    }

    /**
     * Go to a specific line number (1-indexed, like Ace's gotoLine).
     */
    function gotoLine(view, line, column, animate) {
        var row = Math.max(0, line - 1);
        var offset = rowColToOffset(view.state, row, column || 0);
        view.dispatch({
            selection: { anchor: offset },
            scrollIntoView: true
        });
        view.focus();
    }

    /**
     * Move cursor to a specific position {row, column}.
     */
    function moveCursorToPosition(view, pos) {
        var offset = rowColToOffset(view.state, pos.row, pos.column);
        view.dispatch({
            selection: { anchor: offset }
        });
    }

    /**
     * Set selection range from Ace-style range.
     */
    function setSelectionRange(view, range) {
        var from = rowColToOffset(view.state, range.start.row, range.start.column);
        var to = rowColToOffset(view.state, range.end.row, range.end.column);
        view.dispatch({
            selection: { anchor: from, head: to }
        });
    }

    /**
     * Clear the selection (collapse to cursor).
     */
    function clearSelection(view) {
        var head = view.state.selection.main.head;
        view.dispatch({
            selection: { anchor: head }
        });
    }

    /**
     * Set annotations (diagnostics) on the editor.
     * Converts Ace-style annotations [{row, text, type}] to CM6 diagnostics.
     */
    function setAnnotations(view, annotations) {
        var diagnostics = [];
        for (var i = 0; i < annotations.length; i++) {
            var ann = annotations[i];
            var row = ann.row || 0;
            var lineNum = Math.min(row + 1, view.state.doc.lines);
            var line = view.state.doc.line(lineNum);
            var from = line.from + (ann.column || 0);
            var to = line.to;
            if (from > to) from = line.from;
            var severity = ann.type === "error" ? "error" :
                           ann.type === "warning" ? "warning" : "info";
            diagnostics.push({
                from: from,
                to: to,
                severity: severity,
                message: ann.text || ""
            });
        }
        view.dispatch(setDiagnostics(view.state, diagnostics));
    }

    /**
     * Clear all annotations.
     */
    function clearAnnotations(view) {
        view.dispatch(setDiagnostics(view.state, []));
    }

    /**
     * Get current annotations (diagnostics).
     * Returns Ace-style annotation objects.
     */
    function getAnnotations(view) {
        var annotations = [];
        CM6.forEachDiagnostic(view.state, function (d) {
            var pos = offsetToRowCol(view.state, d.from);
            annotations.push({
                row: pos.row,
                column: pos.column,
                text: d.message,
                type: d.severity
            });
        });
        return annotations;
    }

    /**
     * Get screen coordinates for a text position.
     * Replacement for Ace's textToScreenCoordinates(row, column).
     */
    function textToScreenCoordinates(view, row, column) {
        var offset = rowColToOffset(view.state, row, column);
        var coords = view.coordsAtPos(offset);
        if (coords) {
            return { pageX: coords.left, pageY: coords.bottom };
        }
        return { pageX: 0, pageY: 0 };
    }

    /**
     * Ace find() equivalent - simple search within the editor.
     */
    function find(view, needle, options) {
        if (!needle) return;
        var query = new CM6.SearchQuery({
            search: needle,
            caseSensitive: options && options.caseSensitive,
            regexp: options && options.regExp,
            wholeWord: options && options.wholeWord
        });
        view.dispatch({ effects: CM6.setSearchQuery.of(query) });
        CM6.findNext(view);
    }

    /**
     * Find next occurrence.
     */
    function findNext(view) {
        CM6.findNext(view);
    }

    /**
     * Find previous occurrence.
     */
    function findPrevious(view) {
        CM6.findPrevious(view);
    }

    /**
     * Replace current match.
     */
    function replace(view, replacement) {
        CM6.replaceNext(view);
    }

    /**
     * Replace all occurrences.
     */
    function replaceAll(view, replacement) {
        CM6.replaceAll(view);
    }

    /**
     * Toggle comment lines - XQuery style (: :)
     */
    function toggleCommentLines(view) {
        // Use CM6's built-in comment toggling
        CM6.defaultKeymap.forEach(function(binding) {
            if (binding.key === "Mod-/") {
                binding.run(view);
            }
        });
    }

    /**
     * Snippet insertion.
     * Converts Ace snippet format ${n:placeholder} to CM6 snippet format.
     */
    function insertSnippet(view, template) {
        var sel = view.state.selection.main;
        var hasPlaceholders = /\$\{?\d/.test(template);
        if (hasPlaceholders) {
            // CM6 snippet() requires the autocompletion extension;
            // for now, strip placeholders and insert as plain text
            var text = template
                .replace(/\$\{(\d+):([^}]*)}/g, "$2")  // ${n:placeholder} → placeholder
                .replace(/\$\{(\d+)}/g, "")              // ${n} → empty
                .replace(/\$(\d+)/g, "");                 // $n → empty
            view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: text },
                selection: { anchor: sel.from + text.length }
            });
        } else {
            view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: template },
                selection: { anchor: sel.from + template.length }
            });
        }
    }

    /**
     * Create an Ace-style Range object for compatibility.
     * This is a plain object, not a class.
     */
    function createRange(startRow, startColumn, endRow, endColumn) {
        return {
            start: { row: startRow, column: startColumn },
            end: { row: endRow, column: endColumn }
        };
    }

    /**
     * Create an anchor that tracks a position across document changes.
     * Returns an object with getPosition() and detach() methods.
     */
    function createAnchor(view, row, column) {
        var offset = rowColToOffset(view.state, row, column);
        var currentOffset = offset;

        // Listen for document changes to update position
        var listener = EditorView.updateListener.of(function(update) {
            if (update.docChanged) {
                currentOffset = update.changes.mapPos(currentOffset);
            }
        });

        // Add the listener
        view.dispatch({ effects: StateEffect.appendConfig.of(listener) });

        return {
            getPosition: function() {
                return offsetToRowCol(view.state, currentOffset);
            },
            detach: function() {
                // In CM6, extensions can't be easily removed individually.
                // The anchor will be garbage collected when no longer referenced.
            }
        };
    }

    // Expose the shim as a global
    globalThis.editorShim = {
        // Position conversion
        offsetToRowCol: offsetToRowCol,
        rowColToOffset: rowColToOffset,

        // Cursor & selection
        getCursorPosition: getCursorPosition,
        getSelectionLead: getSelectionLead,
        isSelectionEmpty: isSelectionEmpty,
        getSelectionRange: getSelectionRange,
        setSelectionRange: setSelectionRange,
        clearSelection: clearSelection,
        moveCursorToPosition: moveCursorToPosition,

        // Document content
        getValue: getValue,
        setValue: setValue,
        getLine: getLine,
        getAllLines: getAllLines,
        getLength: getLength,
        getTextRange: getTextRange,

        // Editing
        insert: insert,
        replaceRange: replaceRange,
        removeRange: removeRange,
        gotoLine: gotoLine,

        // Annotations (diagnostics)
        setAnnotations: setAnnotations,
        clearAnnotations: clearAnnotations,
        getAnnotations: getAnnotations,

        // Coordinates
        textToScreenCoordinates: textToScreenCoordinates,

        // Search
        find: find,
        findNext: findNext,
        findPrevious: findPrevious,
        replace: replace,
        replaceAll: replaceAll,

        // Comments
        toggleCommentLines: toggleCommentLines,

        // Snippets
        insertSnippet: insertSnippet,

        // Range & Anchor compatibility
        createRange: createRange,
        createAnchor: createAnchor,

        // Search panel
        openSearchPanel: function(view, replace) {
            if (CM6.openSearchPanel) {
                CM6.openSearchPanel(view);
            }
        }
    };
})();
