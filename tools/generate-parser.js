/**
 * generate-parser.js — Generate XQueryParser.js from EBNF grammar via REx.
 *
 * Configuration is defined here so the build is reproducible and the
 * grammar source is explicit.
 *
 * Usage:
 *   node tools/generate-parser.js            # generate from default grammar
 *   node tools/generate-parser.js --dry-run  # show command without running
 *   node tools/generate-parser.js --grammar grammars/XQuery-31-Update-FullText.ebnf
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
    // Grammar source file (relative to project root)
    grammar: 'grammars/XQuery-31-Family-XQUFEL.ebnf',

    // REx parser generator options
    rexOptions: [
        '-ll', '3',         // LL(3) lookahead
        '-backtrack',        // enable backtracking for ambiguous constructs
        '-tree',             // generate TopDownTreeBuilder for AST access
        '-javascript',       // JavaScript output
        '-name', 'XQueryParser'  // constructor name
    ],

    // Output file (relative to project root)
    output: 'src/parser/XQueryParser.js',

    // REx classpath (relative to project root)
    rexClasspath: 'tools',

    // Export boilerplate appended to generated file
    exportBoilerplate: [
        '',
        '// Browser global (needed when bundled by esbuild)',
        'globalThis.XQueryParser = XQueryParser;',
        '',
        '// CommonJS export',
        'if (typeof module !== "undefined" && module.exports) {',
        '  module.exports = XQueryParser;',
        '}',
    ].join('\n'),

    // Post-generation patches for REx v6.1 compatibility
    // (Nonterminal constructor doesn't expose name/children as properties)
    patches: [
        {
            description: 'Add name/children properties to Nonterminal constructor',
            find: 'XQueryParser.Nonterminal = function(name, begin, end, children)\n{\n  this.begin = begin;\n  this.end = end;\n\n  this.send = function(e)',
            replace: 'XQueryParser.Nonterminal = function(name, begin, end, children)\n{\n  this.name = name;\n  this.begin = begin;\n  this.end = end;\n  this.children = children;\n\n  var self = this;\n  this.send = function(e)',
        }
    ]
};

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const grammarOverride = args.indexOf('--grammar') !== -1
    ? args[args.indexOf('--grammar') + 1]
    : null;

const root = path.resolve(__dirname, '..');
const grammar = grammarOverride || CONFIG.grammar;
const grammarPath = path.join(root, grammar);
const outputPath = path.join(root, CONFIG.output);

if (!fs.existsSync(grammarPath)) {
    console.error(`Grammar not found: ${grammarPath}`);
    process.exit(1);
}

const cmd = [
    'java', '-cp', CONFIG.rexClasspath,
    'REx', grammar,
    ...CONFIG.rexOptions
].join(' ');

console.log(`Grammar:  ${grammar}`);
console.log(`Output:   ${CONFIG.output}`);
console.log(`Command:  ${cmd}`);

if (dryRun) {
    console.log('\n(dry run — not executing)');
    process.exit(0);
}

// ── Generate ─────────────────────────────────────────────────────────────────

console.log('\nGenerating parser...');
try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
} catch (e) {
    console.error('REx generation failed');
    process.exit(1);
}

// REx outputs to cwd as XQueryParser.js — move to target
const generatedPath = path.join(root, 'XQueryParser.js');
if (!fs.existsSync(generatedPath)) {
    console.error('Expected output file not found: XQueryParser.js');
    process.exit(1);
}

let source = fs.readFileSync(generatedPath, 'utf-8');
fs.unlinkSync(generatedPath); // clean up from root

// ── Patch ────────────────────────────────────────────────────────────────────

for (const patch of CONFIG.patches) {
    if (source.includes(patch.find)) {
        source = source.replace(patch.find, patch.replace);
        console.log(`Patched: ${patch.description}`);
    } else {
        console.warn(`WARNING: patch target not found — ${patch.description}`);
    }
}

// ── Append exports ───────────────────────────────────────────────────────────

source = source.replace(/\/\/ End\s*$/, CONFIG.exportBoilerplate + '\n\n// End\n');

// ── Write ────────────────────────────────────────────────────────────────────

fs.writeFileSync(outputPath, source, 'utf-8');
const lines = source.split('\n').length;
console.log(`\nWrote ${CONFIG.output} (${lines} lines)`);
