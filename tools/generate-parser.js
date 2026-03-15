/**
 * generate-parser.js — Generate XQueryParser.js from EBNF grammar via REx.
 *
 * Configuration is defined here so the build is reproducible and the
 * grammar source is explicit.
 *
 * Usage:
 *   node tools/generate-parser.js            # generate from default grammar
 *   node tools/generate-parser.js --dry-run  # show command without running
 *   node tools/generate-parser.js --grammar grammars/XQuery-40-Family-XQUFEL.ebnf
 *   node tools/generate-parser.js --name XQueryParser40 --output src/parser/XQueryParser40.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
    // Grammar source file (relative to project root)
    grammar: 'grammars/XQuery-31-Family-XQUFEL.ebnf',

    // Parser constructor name (used in REx -name flag, exports, and patches)
    name: 'XQueryParser',

    // REx parser generator options (excluding -name, which is added dynamically)
    rexOptions: [
        '-ll', '3',         // LL(3) lookahead
        '-backtrack',        // enable backtracking for ambiguous constructs
        '-tree',             // generate TopDownTreeBuilder for AST access
        '-javascript',       // JavaScript output
    ],

    // Output file (relative to project root)
    output: 'src/parser/XQueryParser.js',

    // REx classpath (relative to project root)
    rexClasspath: 'tools',
};

// ── CLI ──────────────────────────────────────────────────────────────────────

function getArg(flag) {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const grammar = getArg('--grammar') || CONFIG.grammar;
const parserName = getArg('--name') || CONFIG.name;
const output = getArg('--output') || CONFIG.output;

const root = path.resolve(__dirname, '..');
const grammarPath = path.join(root, grammar);
const outputPath = path.join(root, output);

if (!fs.existsSync(grammarPath)) {
    console.error(`Grammar not found: ${grammarPath}`);
    process.exit(1);
}

// Compile REx.java if REx.class is not present (class is gitignored; source is committed)
const rexClass = path.join(root, CONFIG.rexClasspath, 'REx.class');
const rexJava  = path.join(root, CONFIG.rexClasspath, 'REx.java');
if (!fs.existsSync(rexClass)) {
    if (!fs.existsSync(rexJava)) {
        console.error('REx.java not found — cannot compile REx parser generator');
        process.exit(1);
    }
    console.log('Compiling REx.java...');
    try {
        execSync(`javac ${rexJava}`, { cwd: root, stdio: 'inherit' });
    } catch (e) {
        console.error('javac failed — ensure a JDK is installed');
        process.exit(1);
    }
}

const cmd = [
    'java', '-cp', CONFIG.rexClasspath,
    'REx', grammar,
    ...CONFIG.rexOptions,
    '-name', parserName
].join(' ');

console.log(`Grammar:  ${grammar}`);
console.log(`Name:     ${parserName}`);
console.log(`Output:   ${output}`);
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

// REx outputs to cwd as <name>.js — move to target
const generatedPath = path.join(root, parserName + '.js');
if (!fs.existsSync(generatedPath)) {
    console.error(`Expected output file not found: ${parserName}.js`);
    process.exit(1);
}

let source = fs.readFileSync(generatedPath, 'utf-8');
fs.unlinkSync(generatedPath); // clean up from root

// ── Patch ────────────────────────────────────────────────────────────────────

// Post-generation patches for REx v6.1 compatibility
// (Nonterminal constructor doesn't expose name/children as properties)
const patches = [
    {
        description: 'Add name/children properties to Nonterminal constructor',
        find: `${parserName}.Nonterminal = function(name, begin, end, children)\n{\n  this.begin = begin;\n  this.end = end;\n\n  this.send = function(e)`,
        replace: `${parserName}.Nonterminal = function(name, begin, end, children)\n{\n  this.name = name;\n  this.begin = begin;\n  this.end = end;\n  this.children = children;\n\n  var self = this;\n  this.send = function(e)`,
    }
];

for (const patch of patches) {
    if (source.includes(patch.find)) {
        source = source.replace(patch.find, patch.replace);
        console.log(`Patched: ${patch.description}`);
    } else {
        console.warn(`WARNING: patch target not found — ${patch.description}`);
    }
}

// ── Append exports ───────────────────────────────────────────────────────────

const exportBoilerplate = [
    '',
    '// Browser global (needed when bundled by esbuild)',
    `globalThis.${parserName} = ${parserName};`,
    '',
    '// CommonJS export',
    'if (typeof module !== "undefined" && module.exports) {',
    `  module.exports = ${parserName};`,
    '}',
].join('\n');

source = source.replace(/\/\/ End\s*$/, exportBoilerplate + '\n\n// End\n');

// ── Write ────────────────────────────────────────────────────────────────────

fs.writeFileSync(outputPath, source, 'utf-8');
const lines = source.split('\n').length;
console.log(`\nWrote ${output} (${lines} lines)`);
