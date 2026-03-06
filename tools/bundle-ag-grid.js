/**
 * Bundle ag-grid into a single IIFE for the browser.
 *
 * Produces resources/scripts/ag-grid-bundle.js exposing globals
 * needed by src/resources.js.
 */
const esbuild = require("esbuild");
const path = require("path");

const entryContents = `
import { Grid } from "@ag-grid-community/core";
import { InfiniteRowModelModule } from "@ag-grid-community/infinite-row-model";

globalThis.agGrid = { Grid, InfiniteRowModelModule };
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
        outfile: path.resolve(__dirname, "../resources/scripts/ag-grid-bundle.js"),
        minify: true,
        logLevel: "info",
    })
    .catch(() => process.exit(1));
