![eXide logo](resources/images/logo.png)

[![Build Status](https://github.com/eXist-db/eXide/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/eXist-db/eXide/actions)

# eXide - a web-based XQuery IDE

eXide is a web-based XQuery IDE built around [CodeMirror 6](https://codemirror.net/). It is tightly integrated with the [eXist-db native XML database](https://exist-db.org). 

## Features

*   XQuery function and variable completion (press Ctrl-Space or Opt-Space)
*   Outline view showing all functions and variables reachable from the current file
*   Powerful navigation (press F3 on a function call to see its declaration)
*   Templates and snippets
*   Background syntax checks for XQuery and XML
*   Database manager
*   Support for EXPath application packages: scaffolding, deployment...
*   And more ...

eXide consists of two parts:

1.  a javascript library for the client-side application
2.  a set of XQuery scripts which are called via AJAX

## Note concerning eXide 3.0.0

eXide 3.0.0 removes the *app generation* feature as it was generating outdated code with potential security risks. We recommend the much better yeoman-based [generator-exist](https://github.com/eXist-db/generator-exist) for eXist-db.

## Documentation

* [short documentation of all features](./docs/docs.md)
* [screencast](https://youtu.be/U7Cd9h6UPoc) demonstrating most features

## Dependencies

Building eXide requires [git](https://git-scm.com/) and [node.js](https://nodejs.org/) (version 14+).

Running tests requires [npm](https://www.npmjs.com/) and [node.js](https://nodejs.org/).

## Getting eXide

eXide is included in eXist-db distributions and can be opened directly at `http://localhost:8080/exist/apps/eXide`. It can also be opened via the Dashboard or the "Open eXide" entry in eXist-db's task or menu bar. 

You can upgrade to new releases of eXide via the Dashboard app's Package Manager. 

You can also build eXide from source and install it.

## Building

To build eXide from scratch:

```bash
git clone git://github.com/eXist-db/eXide.git
cd eXide

```

Next, call `npm install` once:

```bash
npm install
```

And each time you want to build the application:

```bash
npm run build
```

You should now find a `.xar` file in the `build/` directory: `build/eXide-*.*.*.xar`. The `.xar` file is an EXPath Application package containing eXide. Install this into any compatible eXist-db instance using the Dashboard's Package Manager.

## Testing

We welcome contributions to help us improve both unit and integration tests. Current tests can be found in the `cypress/integration` folder.

eXide's GitHub repository is configured to run tests automatically on each PR via GitHub Actions.

To run tests locally, build and install eXide on localhost, and start the tests:

```shell
# clone the repo
git clone git://github.com/eXist-db/eXide.git
cd eXide

# build exide
npm install
# at this point if you are planning to build another branch change it now
npm run build
#start exist docker container
docker create  --name exist-ci -p 8080:8080 existdb/existdb:latest

#deploy exide
docker cp ./build/*.xar exist-ci:exist/autodeploy

#start the docker container
docker start exist-ci && sleep 30

# by this time you should be able to visit http://localhost:8080 and get exist-db home page
# run cypress tests
npm run cypress # this runs the tests in console 
# or use to view the tests in a GUI environment
#npm run cypress open 
```

If successful, the test runner should report, "All specs passed!"

## Commit message conventions

eXide uses [semantic-release](https://semantic-release.gitbook.io/) to automate versioning and releases from `develop`, so every commit message must follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, e.g. `fix(query): surface errors returned in a 200 body` or `feat(db): support renaming collections`. The `type` decides what happens on release — `fix:` bumps a patch version, `feat:` a minor version, and a `BREAKING CHANGE:` footer (or `!` after the type/scope) bumps a major version; other types (`chore:`, `ci:`, `docs:`, `refactor:`, `test:`, ...) don't trigger a release at all.

This is enforced, not just a suggestion: a [commitlint](https://commitlint.js.org/) GitHub Action rejects any PR containing a non-conforming commit message, and once you run `npm install` locally, a [husky](https://typicode.github.io/husky/) `commit-msg` hook checks it before the commit is even made.

## Publishing

Releases are fully automated from `develop` via semantic-release — no manual tagging or uploads. On every push to `develop` that passes CI, semantic-release inspects the commits since the last release, and if any are release-worthy (see above):

1. Bumps the version, builds the `.xar`, and inserts a changelog entry into `repo.xml`'s `<changelog>` (visible in eXist-db's Package Manager).
2. Tags the release and pushes the version bump back to `develop`.
3. Publishes a [GitHub Release](https://github.com/eXist-db/eXide/releases) with the `.xar` attached.
4. Mirrors that `.xar` to the [public repo](https://exist-db.org/exist/apps/public-repo/index.html), so it's immediately installable via the Package Manager.

If you need help with a release of eXide, post a note in the [eXist-db Community Slack](https://exist-db.slack.com). 
