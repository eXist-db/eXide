#!/usr/bin/env node
/**
 * Inserts a new <change> entry into repo.xml.tmpl based on conventional commits
 * since the previous release tag.
 *
 * Usage: node scripts/update-repo-changelog.js --version=X.Y.Z --prev-tag=X.Y.Z
 * Called by semantic-release via @semantic-release/exec prepareCmd.
 *
 * Ported from eXist-db/monex's scripts/update-repo-changelog.js.
 *
 * Slated to be replaced by @existdb/repo-xml-changelog-generator once that
 * plugin is published to npm: drop this script and the changelog part of the
 * exec prepareCmd in .releaserc, and add the plugin between the exec and git
 * entries. Keep any behavior change here in sync with that project
 * (https://github.com/eXist-db/repo-xml-changelog-generator).
 */
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { CommitParser } from 'conventional-commits-parser'
import { writeChangelogString } from 'conventional-changelog-writer'
import conventionalChangelogConventionalCommits from 'conventional-changelog-conventionalcommits'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_NS = 'http://exist-db.org/xquery/repo'
const HTML_NS = 'http://www.w3.org/1999/xhtml'
const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

const SECTION_PREFIX = {
  Features: 'New',
  'Bug Fixes': 'Fix',
  'Performance Improvements': 'Improvement',
  Reverts: 'Revert'
}

function escapeXml (text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Replaces the writer's default markdown template (conventional-changelog-writer
// v9+ takes a template function, no longer a handlebars string).
function xmlTemplate (context) {
  const lines = []
  for (const group of context.noteGroups ?? []) {
    for (const note of group.notes) {
      lines.push(`<li>Breaking change: ${escapeXml(note.text)}</li>`)
    }
  }
  for (const group of context.commitGroups ?? []) {
    for (const commit of group.commits) {
      if (commit.isBreaking) continue
      const scope = commit.scope ? `${commit.scope}: ` : ''
      lines.push(`<li>${escapeXml(`${commit.prefix}: ${scope}${commit.subject}`)}</li>`)
    }
  }
  return lines.join('\n')
}

function parseArgs () {
  return Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--') && a.includes('='))
      .map(a => {
        const eq = a.indexOf('=')
        return [a.slice(2, eq), a.slice(eq + 1)]
      })
  )
}

function tagExists (tag) {
  try {
    execSync(`git rev-parse "${tag}"`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function getRawCommits (prevTag) {
  const ref = tagExists(prevTag) ? prevTag
    : tagExists(`v${prevTag}`) ? `v${prevTag}`
      : null
  if (!ref) throw new Error(`Tag not found: ${prevTag} or v${prevTag}`)

  const hashes = execSync(`git log ${ref}..HEAD --format=%H`, { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)

  // %s folds a hard-wrapped subject paragraph into a single line; %B would
  // keep the line break and the parser would truncate the subject there.
  return hashes.map(hash =>
    execSync(`git log -1 --format=%s%n%n%b ${hash}`, { encoding: 'utf8' }).trim()
  )
}

function githubContext () {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
  const m = (pkg.repository?.url ?? '').match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  if (!m) throw new Error('Cannot derive owner/repository from package.json repository.url')
  return { host: 'https://github.com', owner: m[1], repository: m[2] }
}

async function buildChangeItems (rawCommits, version) {
  const { parser: parserOpts, writer: writerOpts } = await conventionalChangelogConventionalCommits()
  const commitParser = new CommitParser(parserOpts)

  const parsed = rawCommits.map(msg => commitParser.parse(msg)).filter(c => c.type)

  const presetTransform = writerOpts.transform
  const writerOptions = {
    ...writerOpts,
    template: xmlTemplate,
    transform (commit, context) {
      const transformed = presetTransform(commit, context)
      if (!transformed) return null
      if (transformed.notes.length > 0) {
        transformed.isBreaking = true
        return transformed
      }
      transformed.prefix = SECTION_PREFIX[transformed.type] ?? transformed.type
      return transformed
    }
  }

  const output = await writeChangelogString(parsed, { version, ...githubContext() }, writerOptions)

  const doc = new DOMParser().parseFromString(
    `<ul xmlns="${HTML_NS}">${output}</ul>`,
    'text/xml'
  )
  const liNodes = doc.getElementsByTagNameNS(HTML_NS, 'li')
  const items = []
  for (let i = 0; i < liNodes.length; i++) {
    // Collapse line breaks left over from hard-wrapped BREAKING CHANGE footers.
    const text = liNodes.item(i).textContent.replace(/\s+/g, ' ').trim()
    if (text) items.push(text)
  }
  return items
}

// Item text may contain markdown links produced by the conventional-changelog
// preset (issue refs, mentions); render them as XHTML anchors.
function appendItemContent (doc, li, text) {
  let last = 0
  for (const match of text.matchAll(MD_LINK)) {
    if (match.index > last) {
      li.appendChild(doc.createTextNode(text.slice(last, match.index)))
    }
    const a = doc.createElementNS(HTML_NS, 'a')
    a.setAttribute('href', match[2])
    a.appendChild(doc.createTextNode(match[1]))
    li.appendChild(a)
    last = match.index + match[0].length
  }
  if (last < text.length) {
    li.appendChild(doc.createTextNode(text.slice(last)))
  }
}

function insertChangeEntry (tmplPath, version, items) {
  const tmpl = readFileSync(tmplPath, 'utf8')
  const doc = new DOMParser().parseFromString(tmpl, 'text/xml')

  const changelog = doc.getElementsByTagNameNS(REPO_NS, 'changelog').item(0)
  if (!changelog) throw new Error('<changelog> not found in repo.xml.tmpl')

  const change = doc.createElementNS(REPO_NS, 'change')
  change.setAttribute('version', version)
  change.appendChild(doc.createTextNode('\n            '))

  const ul = doc.createElementNS(HTML_NS, 'ul')
  for (const item of items) {
    ul.appendChild(doc.createTextNode('\n                '))
    const li = doc.createElementNS(HTML_NS, 'li')
    appendItemContent(doc, li, item)
    ul.appendChild(li)
  }
  ul.appendChild(doc.createTextNode('\n            '))

  change.appendChild(ul)
  change.appendChild(doc.createTextNode('\n        '))

  let firstChange = null
  for (let i = 0; i < changelog.childNodes.length; i++) {
    if (changelog.childNodes.item(i).nodeType === 1) {
      firstChange = changelog.childNodes.item(i)
      break
    }
  }

  changelog.insertBefore(change, firstChange)
  changelog.insertBefore(doc.createTextNode('\n        '), firstChange)

  writeFileSync(tmplPath, new XMLSerializer().serializeToString(doc))
}

const { version, 'prev-tag': prevTag } = parseArgs()

if (!version || !prevTag) {
  console.error('Usage: update-repo-changelog.js --version=X.Y.Z --prev-tag=X.Y.Z')
  process.exit(1)
}

const rawCommits = getRawCommits(prevTag)
const items = await buildChangeItems(rawCommits, version)

if (items.length === 0) {
  console.log(`No notable commits since ${prevTag}, skipping changelog update`)
  process.exit(0)
}

const tmplPath = join(__dirname, '..', 'repo.xml.tmpl')
insertChangeEntry(tmplPath, version, items)
console.log(`Added ${version} changelog entry to repo.xml.tmpl`)
