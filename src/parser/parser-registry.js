/**
 * Parser registry: selects the appropriate XQuery parser based on
 * version declaration in source code or user preference override.
 *
 * - XQuery 1.0, 3.0, 3.1 (or no declaration) → XQueryParser (3.1, bundled)
 * - XQuery 4.0 → XQueryParser40 (lazy-loaded on first use, as a separate chunk)
 */

import { namespace } from "../namespace.js";
import XQueryParser from "./XQueryParser.js";

const VERSION_RE = /xquery\s+version\s+["'](\d+\.\d+)["']/;
let XQueryParser40 = null;
let parser40Promise = null;

/**
 * Detect XQuery version from source code.
 * Scans first 500 characters for `xquery version "X.X"`.
 */
function detectVersion(code) {
    const match = VERSION_RE.exec(code.substring(0, 500));
    if (match && match[1] === "4.0") return "4.0";
    return "3.1";
}

/**
 * Get the parser constructor for the given code synchronously.
 * Returns XQueryParser (3.1) immediately. For 4.0, returns XQueryParser40
 * if already loaded, otherwise returns 3.1 as fallback and triggers async load.
 *
 * @param {string} code - XQuery source text
 * @param {string} [versionPref] - "auto" (default), "3.1", or "4.0"
 * @returns {{ parser: Function, version: string, pending: boolean }}
 */
function getParser(code, versionPref) {
    const version = (versionPref && versionPref !== "auto") ? versionPref : detectVersion(code);

    if (version === "4.0") {
        if (XQueryParser40) {
            return { parser: XQueryParser40, version: "4.0", pending: false };
        }
        // Kick off async load, return 3.1 as fallback
        loadParser40();
        return { parser: XQueryParser, version: "3.1", pending: true };
    }

    return { parser: XQueryParser, version: "3.1", pending: false };
}

/**
 * Load the XQuery 4.0 parser on first use. esbuild splits the dynamic import
 * into its own chunk, so the large parser is only downloaded when needed.
 * Returns a promise that resolves to the parser constructor.
 */
function loadParser40() {
    if (XQueryParser40) {
        return Promise.resolve(XQueryParser40);
    }
    parser40Promise ??= import("./XQueryParser40.js")
        .then((module) => {
            XQueryParser40 = module.default;
            return XQueryParser40;
        })
        .catch((err) => {
            parser40Promise = null; // allow retry
            throw new Error(`Failed to load XQuery 4.0 parser: ${err.message}`);
        });
    return parser40Promise;
}

/**
 * Eagerly pre-load the 4.0 parser (e.g. when preference is set to "4.0").
 */
function preload40() {
    return loadParser40();
}

export const parserRegistry = {
    detectVersion,
    getParser,
    loadParser40,
    preload40
};

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").parserRegistry = parserRegistry;
