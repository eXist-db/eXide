/**
 * Bundle Prettier + plugins into a single IIFE for the browser.
 *
 * Produces resources/scripts/prettier-bundle.js exposing a global
 * `prettierBundle` with { prettier, plugins }.
 */
const esbuild = require("esbuild");
const path = require("path");

const entryContents = `
import * as prettier from "prettier/standalone";
import * as pluginHtml from "prettier/plugins/html";
import * as pluginPostcss from "prettier/plugins/postcss";
import * as pluginMarkdown from "prettier/plugins/markdown";
import * as pluginBabel from "prettier/plugins/babel";
import * as pluginEstree from "prettier/plugins/estree";
import pluginXquery from "prettier-plugin-xquery";
import pluginXml from "@prettier/plugin-xml";

globalThis.prettierBundle = {
    prettier: prettier,
    plugins: [pluginHtml, pluginPostcss, pluginMarkdown, pluginBabel, pluginEstree, pluginXquery, pluginXml]
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
        outfile: path.resolve(__dirname, "../resources/scripts/prettier-bundle.js"),
        minify: true,
        logLevel: "info",
    })
    .catch(() => process.exit(1));
