![eXide logo](resources/images/logo.png)

[![Build Status](https://github.com/eXist-db/eXide/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/eXist-db/eXide/actions)

# eXide - a web-based XQuery IDE

eXide is a web-based XQuery IDE built around the [ace editor](https://ace.c9.io/). It is tightly integrated with the [eXist-db native XML database](https://exist-db.org). 

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

Building eXide requires [git](https://git-scm.com/) and [Apache Ant](https://ant.apache.org/). 

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
git submodule update --init --recursive
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

eXide's GitHub repository is configured to run tests automatically on each PR via TravisCI (see `.travis.yml`).

To run tests locally, build and install eXide on localhost, and start the tests:

```shell
# clone the repo
git clone git://github.com/eXist-db/eXide.git
cd eXide
git submodule update --init --recursive
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

## Publishing

eXist-db.org Community administrators publish eXide releases by uploading the eXide `.xar` file to the [public repo](https://exist-db.org/exist/apps/public-repo/index.html). 

Releases are also published to the eXide GitHub repository's [Releases](https://github.com/eXist-db/eXide/releases) page. To do so, either use the Releases page or add a tag in the form: 'vX.X.X' to the repo (where `X` corresponds to the semantic version number of the new release). 

If you need help with a release of eXide, post a note in the [eXist-db Community Slack](https://exist-db.slack.com). 
