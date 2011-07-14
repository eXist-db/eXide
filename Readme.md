![eXide logo](resources/images/logo.png)

eXide - a web-based XQuery IDE
==============================

eXide is a a web-based XQuery IDE built around the ace editor (http://ace.ajax.org/).
It is tightly integrated with the eXist-db native XML database (http://exist-db.org).

Features
--------

* XQuery function and variable completion (press Ctrl-Space)
* Outline view showing all functions and variables reachable from the current file
* Powerful navigation (press F3 on a function call to see its declaration)
* Templates
* Background syntax checks for XQuery and XML
* Database manager
* Support for EXPath application packages: scaffolding, deployment...

eXide consists of two parts:

1. a javascript library for the client-side application
2. a set of XQuery scripts which are called from AJAX

Building
--------

The latest version of eXide is included with eXist-db. To build eXide from scratch,
you should first get eXist-db from SVN and build it (build.sh/build.bat). Next, change
into the webapp directory of your eXist install and clone eXide into a sub-directory, e.g.:

     git clone git://github.com/wolfgangmm/eXide.git eXideDev
     cd eXideDev
     git submodule update --init --recursive

Next, call ant on the build.xml file in eXideDev:

      ./build.sh -f webapp/eXideDev/build.xml

After launching eXist, you should now be able to access eXide:

      http://localhost:8080/exist/eXideDev/