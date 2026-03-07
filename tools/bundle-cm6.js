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
        acceptCompletion, closeCompletion, snippet, snippetCompletion,
        closeBrackets, closeBracketsKeymap} from "@codemirror/autocomplete";
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
    closeBrackets,
    closeBracketsKeymap,

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
    xquery: function() {
        return new LanguageSupport(StreamLanguage.define(legacyModes.xQuery));
    },

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
    oneDarkHighlightStyle: HighlightStyle.define([
        { tag: tags.keyword, color: "#c678dd" },
        { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#e06c75" },
        { tag: [tags.function(tags.variableName), tags.labelName], color: "#61afef" },
        { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#d19a66" },
        { tag: [tags.definition(tags.name), tags.separator], color: "#abb2bf" },
        { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#e5c07b" },
        { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: "#56b6c2" },
        { tag: [tags.meta, tags.comment], color: "#7d8799" },
        { tag: tags.strong, fontWeight: "bold" },
        { tag: tags.emphasis, fontStyle: "italic" },
        { tag: tags.strikethrough, textDecoration: "line-through" },
        { tag: tags.link, color: "#7d8799", textDecoration: "underline" },
        { tag: tags.heading, fontWeight: "bold", color: "#e06c75" },
        { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#d19a66" },
        { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#98c379" },
        { tag: tags.invalid, color: "#ffffff" },
    ], {themeType: "dark"}),

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
