/**
 * Editor utility functions for CodeMirror 6.
 *
 * Coordinate conversion, navigation, snippet insertion, and annotation helpers
 * used throughout eXide. These are genuinely useful abstractions over CM6's
 * offset-based API.
 */

import { namespace } from "./namespace.js";
const CM6 = globalThis.CM6;
const setDiagnostics = CM6.setDiagnostics;

// -- Navigation flash effect --
// Briefly highlights the target line after gotoLine to draw the eye.
const flashEffect = CM6.StateEffect.define();
const flashClear = CM6.StateEffect.define();
const flashDeco = CM6.Decoration.line({ class: "cm-goto-flash" });
const flashField = CM6.StateField.define({
    create () { return CM6.Decoration.none; },
    update (value, tr) {
        for (let i = 0; i < tr.effects.length; i++) {
            if (tr.effects[i].is(flashEffect)) {
                const line = tr.state.doc.lineAt(tr.effects[i].value);
                return CM6.Decoration.set([flashDeco.range(line.from)]);
            }
            if (tr.effects[i].is(flashClear)) {
                return CM6.Decoration.none;
            }
        }
        return value;
    },
    provide (f) { return CM6.EditorView.decorations.from(f); }
});

/**
 * Convert a CM6 offset to a 0-indexed {row, column} position.
 */
function offsetToRowCol(state, offset) {
    const line = state.doc.lineAt(offset);
    return { row: line.number - 1, column: offset - line.from };
}

/**
 * Convert a 0-indexed {row, column} to a CM6 offset.
 */
function rowColToOffset(state, row, column) {
    if (row < 0) row = 0;
    const maxLine = state.doc.lines;
    if (row >= maxLine) row = maxLine - 1;
    const line = state.doc.line(row + 1);
    const col = Math.min(column || 0, line.length);
    return line.from + col;
}

/**
 * Navigate to a line (1-indexed) and optional column (0-indexed).
 */
function gotoLine(view, line, column, animate) {
    const row = Math.max(0, line - 1);
    const offset = rowColToOffset(view.state, row, column || 0);
    view.dispatch({
        selection: { anchor: offset }
    });
    view.dispatch({
        effects: CM6.EditorView.scrollIntoView(offset, { y: "center" })
    });
    flashLine(view, offset);
    view.focus();
}

/**
 * Briefly flash the line at the given offset to draw the eye.
 */
function flashLine(view, offset) {
    view.dispatch({ effects: flashEffect.of(offset) });
    setTimeout(() => {
        view.dispatch({ effects: flashClear.of(null) });
    }, 1200);
}

/**
 * Insert a snippet template, stripping tab-stop placeholders.
 */
function insertSnippet(view, template) {
    if (/\$\{?\d/.test(template)) {
        // eXide's ${N:label} syntax is native CM6 snippet syntax
        CM6.snippet(template)(view, null, view.state.selection.main.from, view.state.selection.main.to);
    } else {
        const sel = view.state.selection.main;
        view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: template },
            selection: { anchor: sel.from + template.length }
        });
    }
}

/**
 * Get screen coordinates for a 0-indexed row/column position.
 */
function textToScreenCoordinates(view, row, column) {
    const offset = rowColToOffset(view.state, row, column);
    const coords = view.coordsAtPos(offset);
    if (coords) {
        return { pageX: coords.left, pageY: coords.bottom };
    }
    return { pageX: 0, pageY: 0 };
}

/**
 * Set annotations (diagnostics) from [{row, column, text, type}] objects.
 */
function setAnnotations(view, annotations) {
    const diagnostics = [];
    for (let i = 0; i < annotations.length; i++) {
        const ann = annotations[i];
        const row = Math.max(ann.row || 0, 0);
        const lineNum = Math.min(row + 1, view.state.doc.lines);
        const line = view.state.doc.line(lineNum);
        let from = line.from + (ann.column || 0);
        const to = line.to;
        if (from > to) from = line.from;
        const severity = ann.type === "error" ? "error" :
                       ann.type === "warning" ? "warning" : "info";
        const diag = {
            from,
            to,
            severity,
            message: ann.text || ""
        };
        if (ann.actions) {
            diag.actions = ann.actions;
        }
        diagnostics.push(diag);
    }
    view.dispatch(setDiagnostics(view.state, diagnostics));
}

/**
 * Get current annotations as {row, column, text, type} objects.
 */
function getAnnotations(view) {
    const annotations = [];
    CM6.forEachDiagnostic(view.state, (d) => {
        const pos = offsetToRowCol(view.state, d.from);
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

export const editorUtils = {
    offsetToRowCol,
    rowColToOffset,
    gotoLine,
    insertSnippet,
    textToScreenCoordinates,
    setAnnotations,
    getAnnotations,
    clearAnnotations,
    flashField,
    flashLine
};

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").editorUtils = editorUtils;
