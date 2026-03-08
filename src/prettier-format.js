/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2024 Wolfgang Meier
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Thin wrapper around Prettier for use by eXide mode helpers.
 * Requires prettierBundle global (loaded from prettier-bundle.js).
 */
var prettierFormat = (function () {

    var MODE_CONFIG = {
        "xquery":     { parser: "xquery" },
        "xml":        { parser: "xml", hasXmlOptions: true },
        "html":       { parser: "html", hasXmlOptions: true },
        "css":        { parser: "css" },
        "less":       { parser: "less" },
        "javascript": { parser: "babel" },
        "json":       { parser: "json" },
        "markdown":   { parser: "markdown" }
    };

    return {
        /**
         * Format code using Prettier.
         * @param {string} code - source code to format
         * @param {string} mode - eXide syntax mode name
         * @returns {Promise<string>} formatted code
         */
        format: function (code, mode) {
            if (typeof prettierBundle === "undefined") {
                return Promise.reject(new Error("Prettier is not loaded."));
            }
            var config = MODE_CONFIG[mode];
            if (!config) {
                return Promise.reject(new Error("No formatter available for mode: " + mode));
            }
            var prefs = (typeof eXide !== "undefined" && eXide.app && eXide.app.editor && eXide.app.editor._preferences) || {};
            var useTabs = prefs.indent === 0;
            var options = {
                parser: config.parser,
                plugins: prettierBundle.plugins,
                tabWidth: prefs.indentSize || 4,
                useTabs: useTabs,
                printWidth: prefs.prettierPrintWidth || 80,
                singleQuote: prefs.prettierSingleQuote || false
            };
            if (config.hasXmlOptions) {
                options.xmlWhitespaceSensitivity = prefs.prettierXmlWhitespaceSensitivity || "ignore";
                options.xmlSelfClosingSpace = prefs.prettierXmlSelfClosingSpace !== false;
                options.xmlSortAttributesByKey = prefs.prettierXmlSortAttributesByKey || false;
                options.xmlQuoteAttributes = prefs.prettierXmlQuoteAttributes || "preserve";
                options.singleAttributePerLine = prefs.prettierSingleAttributePerLine || false;
                options.bracketSameLine = prefs.prettierBracketSameLine !== false;
            }
            return prettierBundle.prettier.format(code, options);
        }
    };
}());

// Browser global (needed when bundled by esbuild)
globalThis.prettierFormat = prettierFormat;
