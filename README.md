![eXide logo](resources/images/logo.png)

[![Build Status](https://travis-ci.com/eXist-db/eXide.svg?branch=develop)](https://travis-ci.com/eXist-db/eXide)

# eXide - a web-based XQuery IDE
eXide is a a web-based XQuery IDE built around the [ace editor](http://ace.ajax.org/).
It is tightly integrated with the [eXist-db native XML database](http://exist-db.org).

## Features
*   XQuery function and variable completion (press Ctrl-Space or Opt-Space)
*   Outline view showing all functions and variables reachable from the current file
*   Powerful navigation (press F3 on a function call to see its declaration)
*   Templates
*   Background syntax checks for XQuery and XML
*   Database manager
*   Support for EXPath application packages: scaffolding, deployment...
*   And more ...

eXide consists of two parts:
1.  a javascript library for the client-side application
2.  a set of XQuery scripts which are called via AJAX

## Dependencies
eXide requires the shared-resources package in eXist-db. It should be installed by default unless you changed the build.

## Building
The latest version of eXide is included with eXist-db, though this might not be the newest version.

You can install a newer or second version of eXide by deploying it directly into the database. This is also how development on eXide is done.

To build eXide from scratch:
```bash
git clone git://github.com/eXist-db/eXide.git
cd eXide
git submodule update --init --recursive
```

Next, call ant on the `build.xml` file in eXide:
```bash
ant
```

You should now find a `.xar` file in the `build/` directory:
```    
build/eXide-*.*.*.xar
```
The `.xar` file is an installable package containing eXide. You can install this into any eXist
instance using the application repository manager in the dashboard.

eXide depends on the shared-resources eXpath-package which provides the ace editor files. If you install eXide via the dashboard, the dependency should be processed automatically.

## Testing
!! WIP !!
We are working on improving the test coverage of eXide, and welcome contributions to help us improve both unit and integration tests. To add in-browser integrations tests contributor should open a pull request to [e2e-core](https://www.github.com/eXist-db/e2e-core).

## Deployment
New releases require a `.xar` file to be uploaded to `exist-db.org`'s public repo, and to Github releases. To trigger a new release simply add a tag in the form: 'vX.X.X' to the repo (where `X` corresponds to the semantic-version number of the new release). Tags can be added via CLI or the GitHub UI. Travis will automatically initiate the release and attach the xar once you added a tag. Either upload the `.xar` to public repo yourself, or post a not in [slack](https://exist-db.slack.com). 
