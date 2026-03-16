/**
 * Build script for eXide Desktop.
 *
 * Copies the web frontend assets into dist-desktop/ for Tauri bundling.
 * Runs after the standard web build (bundle-cm6, bundle-prettier, build.js prepare).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist-desktop");

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            // Skip directories that shouldn't be bundled
            if (["node_modules", "src-tauri", ".git", "build", "dist-desktop",
                 "cypress", "test", "grammars", "tools", ".claude"].includes(entry)) {
                continue;
            }
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Clean and recreate
if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// Copy index.html, fixing XHTML self-closing tags for HTML5 compatibility.
// Tauri's WebKit webview requires proper <script></script> and <link></link> tags.
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// Remove XML declaration
html = html.replace(/<\?xml[^?]*\?>\s*/, "");
// Fix self-closing script tags: <script ... /> → <script ...></script>
html = html.replace(/<script([^>]*?)\/>/g, "<script$1></script>");
// Fix self-closing link tags (already valid in HTML5 but normalize)
html = html.replace(/<link([^>]*?)\/>/g, "<link$1>");
// Fix ALL self-closing non-void tags that HTML5 doesn't support.
// In HTML5, only void elements (br, hr, img, input, link, meta, etc.)
// can be self-closing. All others must have explicit close tags.
var nonVoidTags = ["div", "span", "ul", "ol", "li", "a", "i", "b", "p",
    "button", "select", "option", "textarea", "table", "tr", "td", "th",
    "thead", "tbody", "form", "fieldset", "legend", "label", "h1", "h2",
    "h3", "h4", "h5", "h6", "section", "article", "nav", "header", "footer",
    "dialog", "details", "summary", "code", "pre", "em", "strong", "small"];
nonVoidTags.forEach(function(tag) {
    var re = new RegExp("<" + tag + "([^>]*?)\\/>", "gi");
    html = html.replace(re, "<" + tag + "$1></" + tag + ">");
});
// Inject eXide.configuration defaults (normally injected by view.xq on the server)
var configScript = `
    <script type="text/javascript">
        eXide.namespace("eXide.configuration");
        eXide.configuration.allowExecution = true;
        eXide.configuration.allowGuest = true;
        eXide.configuration.context = "";
    </script>`;
html = html.replace("</head>", configScript + "\n</head>");

// Add HTML5 doctype
if (!html.startsWith("<!DOCTYPE")) {
    html = "<!DOCTYPE html>\n" + html;
}
fs.writeFileSync(path.join(DIST, "index.html"), html);

// Copy resources (CSS, JS bundles, images, fonts, schemas, templates)
copyRecursive(path.join(ROOT, "resources"), path.join(DIST, "resources"));

// Copy keybindings
fs.copyFileSync(path.join(ROOT, "keybindings.js"), path.join(DIST, "keybindings.js"));

// Copy templates directory if it exists
if (fs.existsSync(path.join(ROOT, "templates"))) {
    copyRecursive(path.join(ROOT, "templates"), path.join(DIST, "templates"));
}

// Copy connect page as the entry point for desktop release builds
fs.copyFileSync(path.join(ROOT, "src-tauri", "connect.html"), path.join(DIST, "connect.html"));

console.log("Desktop assets copied to dist-desktop/");
