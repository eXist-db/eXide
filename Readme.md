![eXide logo](resources/images/logo.png)

eXide - a web-based XQuery IDE
==============================

eXide is a a web-based XQuery IDE built around the ace editor (http://ace.ajax.org/).
It is tightly integrated with the eXist-db native XML database (http://exist-db.org).

Features
--------

* XQuery function and variable completion (press Ctrl-Space or Opt-Space)
* Outline view showing all functions and variables reachable from the current file
* Powerful navigation (press F3 on a function call to see its declaration)
* Templates
* Background syntax checks for XQuery and XML
* Database manager
* Support for EXPath application packages: scaffolding, deployment...
* And more ...

eXide consists of two parts:

1. a javascript library for the client-side application
2. a set of XQuery scripts which are called via AJAX

Dependencies
------------

eXide requires the shared-resources package in eXist-db. It should be installed by default unless you changed
the build.

Building
--------

The latest version of eXide is included with eXist-db, though this might not be the newest version.
You can install a newer or second version of eXide by deploying it directly into the database. This is
also how development on eXide is done.

To build eXide from scratch,
you should first get eXist-db from SVN and build it (build.sh/build.bat). Next, clone eXide into a directory, e.g.:

     git clone git://github.com/wolfgangmm/eXide.git eXideDev
     cd eXideDev
     git submodule update --init --recursive

Next, call ant on the build.xml file in eXideDev:

      ant

You should now find a .xar file in the build directory:
     
     build/eXide-1.0.xar

The .xar file is an installable package containing eXide. You can install this into any eXist 
instance using the application repository manager in the dashboard.

eXide depends on the shared-resources xar package which provides the ace editor files. If you install eXide
via the dashboard, the dependency should be processed automatically.
