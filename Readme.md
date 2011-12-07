![eXide logo](/wolfgangmm/eXide/raw/master/resources/images/logo.png)

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

The .xar file is an installable package containing everything needed by eXide. You can install this into any eXist 
instance using the application repository manager. In a web browser, open the 
admin web page of your eXist instance and select "Package Repository". Switch to the "Upload" tab and select the .xar
file for upload, then click "Upload Package". After installation has finished, your new version of eXide (now stored
inside the database) should be accessible at:

     http://localhost:8080/exist/apps/eXide