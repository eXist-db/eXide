/**
 * Bundle CodeMirror 6 into a single IIFE for the browser.
 *
 * Produces resources/scripts/cm6-bundle.js exposing a global
 * `CM6` with all CodeMirror modules needed by eXide.
 */
const esbuild = require("esbuild");
const path = require("path");

const entryContents = `
import {EditorState, Compartment, StateField, StateEffect, Prec, Facet} from "@codemirror/state";
import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
        drawSelection, dropCursor, rectangularSelection, crosshairCursor,
        highlightSpecialChars, Decoration, ViewPlugin, WidgetType, gutter, GutterMarker,
        showTooltip, tooltips} from "@codemirror/view";
import {syntaxHighlighting, HighlightStyle, indentOnInput, foldGutter, foldKeymap,
        bracketMatching, defaultHighlightStyle, indentUnit, StreamLanguage,
        syntaxTree, foldNodeProp, foldInside, Language, LRLanguage,
        LanguageSupport, LanguageDescription} from "@codemirror/language";
import {defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, toggleComment} from "@codemirror/commands";
import {searchKeymap, openSearchPanel, closeSearchPanel, search, findNext, findPrevious,
        replaceNext, replaceAll, SearchQuery, setSearchQuery, getSearchQuery,
        SearchCursor} from "@codemirror/search";
import {autocompletion, completionKeymap, CompletionContext, startCompletion,
        acceptCompletion, closeCompletion, snippet, snippetCompletion} from "@codemirror/autocomplete";
import {lintKeymap, setDiagnostics, forEachDiagnostic, linter, lintGutter,
        openLintPanel, closeLintPanel} from "@codemirror/lint";
import {StreamLanguage as LegacyStreamLanguage} from "@codemirror/language";
import * as legacyModes from "@codemirror/legacy-modes/mode/xquery";
import {javascript} from "@codemirror/lang-javascript";
import {css} from "@codemirror/lang-css";
import {html} from "@codemirror/lang-html";
import {xml} from "@codemirror/lang-xml";
import {json} from "@codemirror/lang-json";
import {markdown} from "@codemirror/lang-markdown";
import {oneDark, oneDarkTheme, oneDarkHighlightStyle} from "@codemirror/theme-one-dark";
import {languages} from "@codemirror/language-data";
import {tags, classHighlighter, highlightTree} from "@lezer/highlight";

globalThis.CM6 = {
    // @codemirror/state
    EditorState,
    Compartment,
    StateField,
    StateEffect,
    Prec,
    Facet,

    // @codemirror/view
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
    dropCursor,
    rectangularSelection,
    crosshairCursor,
    highlightSpecialChars,
    Decoration,
    ViewPlugin,
    WidgetType,
    gutter,
    GutterMarker,
    showTooltip,
    tooltips,

    // @codemirror/language
    syntaxHighlighting,
    HighlightStyle,
    indentOnInput,
    foldGutter,
    foldKeymap,
    bracketMatching,
    defaultHighlightStyle,
    indentUnit,
    StreamLanguage,
    syntaxTree,
    foldNodeProp,
    foldInside,
    Language,
    LRLanguage,
    LanguageSupport,
    LanguageDescription,

    // @codemirror/commands
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab,
    undo,
    redo,
    toggleComment,

    // @codemirror/search
    searchKeymap,
    openSearchPanel,
    closeSearchPanel,
    search,
    findNext,
    findPrevious,
    replaceNext,
    replaceAll,
    SearchQuery,
    setSearchQuery,
    getSearchQuery,
    SearchCursor,

    // @codemirror/autocomplete
    autocompletion,
    completionKeymap,
    CompletionContext,
    startCompletion,
    acceptCompletion,
    closeCompletion,
    snippet,
    snippetCompletion,

    // @codemirror/lint
    lintKeymap,
    setDiagnostics,
    forEachDiagnostic,
    linter,
    lintGutter,
    openLintPanel,
    closeLintPanel,

    // Legacy XQuery mode
    legacyModes,

    // Language packs
    javascript,
    css,
    html,
    xml,
    json,
    markdown,
    languages,

    // Themes
    oneDark,
    oneDarkTheme,
    oneDarkHighlightStyle,

    // Lezer highlight tags & tree highlighting
    tags,
    classHighlighter,
    highlightTree
};
`;

esbuild
    .build({
        stdin: {
            contents: entryContents,
            resolveDir: path.resolve(__dirname, ".."),
            loader: "js",
        },
        bundle: true,
        format: "iife",
        platform: "browser",
        target: ["es2018"],
        outfile: path.resolve(__dirname, "../resources/scripts/cm6-bundle.js"),
        minify: true,
        logLevel: "info",
    })
    .catch(() => process.exit(1));
