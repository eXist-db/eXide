#!/usr/bin/env node
/**
 * Print the package dependencies declared in expath-pkg.xml as shell variable
 * assignments, so CI installs exactly the versions eXide publishes as its
 * contract rather than versions hardcoded in the workflow (eXide#865).
 *
 * Usage: eval "$(node tools/read-declared-deps.js)"
 *
 * Exits non-zero if a dependency carries no semver-min: an undeclared minimum
 * is what let eXide 4.0.1 be paired with an existdb-openapi that could not
 * report query errors (eXide#821).
 */
const fs = require('fs')

// EXPath package name -> shell variable to emit.
const WANTED = {
    'http://e-editiones.org/roaster': 'ROASTER',
    'http://exist-db.org/pkg/openapi': 'OPENAPI'
}

const xml = fs.readFileSync('expath-pkg.xml', 'utf8')
const missing = []
const lines = []

for (const [pkg, name] of Object.entries(WANTED)) {
    const tag = xml.match(
        new RegExp('<dependency\\b[^>]*package="' + pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>')
    )
    const min = tag && tag[0].match(/semver-min="([^"]+)"/)
    if (min) {
        lines.push(name + '=' + min[1])
    } else {
        missing.push(pkg + (tag ? ' (declared, but with no semver-min)' : ' (not declared at all)'))
    }
}

if (missing.length) {
    console.error('expath-pkg.xml must declare a semver-min for every package dependency.')
    console.error('Missing:\n  ' + missing.join('\n  '))
    process.exit(1)
}

console.log(lines.join('\n'))
