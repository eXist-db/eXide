/**
 * Parser registry: selects the appropriate XQuery parser based on
 * version declaration in source code or user preference override.
 *
 * - XQuery 1.0, 3.0, 3.1 (or no declaration) → XQueryParser (3.1, bundled)
 * - XQuery 4.0 → XQueryParser40 (lazy-loaded on first use)
 */

var VERSION_RE = /xquery\s+version\s+["'](\d+\.\d+)["']/;
var parser40Promise = null;

/**
 * Detect XQuery version from source code.
 * Scans first 500 characters for `xquery version "X.X"`.
 */
function detectVersion(code) {
    var match = VERSION_RE.exec(code.substring(0, 500));
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
    var version = (versionPref && versionPref !== "auto") ? versionPref : detectVersion(code);

    if (version === "4.0") {
        if (globalThis.XQueryParser40) {
            return { parser: globalThis.XQueryParser40, version: "4.0", pending: false };
        }
        // Kick off async load, return 3.1 as fallback
        loadParser40();
        return { parser: globalThis.XQueryParser, version: "3.1", pending: true };
    }

    return { parser: globalThis.XQueryParser, version: "3.1", pending: false };
}

/**
 * Load the XQuery 4.0 parser asynchronously via script tag injection.
 * Returns a promise that resolves to the parser constructor.
 */
function loadParser40() {
    if (globalThis.XQueryParser40) {
        return Promise.resolve(globalThis.XQueryParser40);
    }
    if (!parser40Promise) {
        parser40Promise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            // Resolve path relative to eXide's base URL
            var base = document.querySelector('base');
            var baseHref = base ? base.getAttribute('href') : '';
            script.src = baseHref + "resources/scripts/xquery-parser-40.js";
            script.onload = function () {
                if (globalThis.XQueryParser40) {
                    resolve(globalThis.XQueryParser40);
                } else {
                    reject(new Error("XQueryParser40 not found after script load"));
                }
            };
            script.onerror = function () {
                parser40Promise = null; // allow retry
                reject(new Error("Failed to load XQuery 4.0 parser"));
            };
            document.head.appendChild(script);
        });
    }
    return parser40Promise;
}

/**
 * Eagerly pre-load the 4.0 parser (e.g. when preference is set to "4.0").
 */
function preload40() {
    return loadParser40();
}

// Browser global
var parserRegistry = {
    detectVersion: detectVersion,
    getParser: getParser,
    loadParser40: loadParser40,
    preload40: preload40
};
globalThis.parserRegistry = parserRegistry;

// CommonJS export
if (typeof module !== "undefined" && module.exports) {
    module.exports = parserRegistry;
}
