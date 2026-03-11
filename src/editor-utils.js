/**
 * Editor utility functions for CodeMirror 6.
 *
 * Coordinate conversion, navigation, snippet insertion, and annotation helpers
 * used throughout eXide. These are genuinely useful abstractions over CM6's
 * offset-based API.
 */
(function () {
    "use strict";

    var CM6 = globalThis.CM6;
    var setDiagnostics = CM6.setDiagnostics;

    /**
     * Convert a CM6 offset to a 0-indexed {row, column} position.
     */
    function offsetToRowCol(state, offset) {
        var line = state.doc.lineAt(offset);
        return { row: line.number - 1, column: offset - line.from };
    }

    /**
     * Convert a 0-indexed {row, column} to a CM6 offset.
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
     * Navigate to a line (1-indexed) and optional column (0-indexed).
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
     * Insert a snippet template, stripping tab-stop placeholders.
     */
    function insertSnippet(view, template) {
        var sel = view.state.selection.main;
        var hasPlaceholders = /\$\{?\d/.test(template);
        var text;
        if (hasPlaceholders) {
            text = template
                .replace(/\$\{(\d+):([^}]*)}/g, "$2")
                .replace(/\$\{(\d+)}/g, "")
                .replace(/\$(\d+)/g, "");
        } else {
            text = template;
        }
        view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: text },
            selection: { anchor: sel.from + text.length }
        });
    }

    /**
     * Get screen coordinates for a 0-indexed row/column position.
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
     * Set annotations (diagnostics) from [{row, column, text, type}] objects.
     */
    function setAnnotations(view, annotations) {
        var diagnostics = [];
        for (var i = 0; i < annotations.length; i++) {
            var ann = annotations[i];
            var row = Math.max(ann.row || 0, 0);
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
     * Get current annotations as {row, column, text, type} objects.
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
     * Clear all annotations.
     */
    function clearAnnotations(view) {
        view.dispatch(setDiagnostics(view.state, []));
    }

    globalThis.editorUtils = {
        offsetToRowCol: offsetToRowCol,
        rowColToOffset: rowColToOffset,
        gotoLine: gotoLine,
        insertSnippet: insertSnippet,
        textToScreenCoordinates: textToScreenCoordinates,
        setAnnotations: setAnnotations,
        getAnnotations: getAnnotations,
        clearAnnotations: clearAnnotations
    };
})();
