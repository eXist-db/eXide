# eXide Feature Documentation

eXide is a web-based XQuery IDE built around the [ace editor](https://ace.c9.io/). It is tightly integrated with the [eXist-db native XML database](https://exist-db.org). 

## Highlights

*   XQuery function and variable completion (press Ctrl-Space or Opt-Space)
*   Outline view showing all functions and variables reachable from the current file
*   Powerful navigation (press F3 on a function call to see its declaration)
*   Templates and snippets
*   Background syntax checks for XQuery and XML
*   Database manager
*   Support for EXPath application packages: scaffolding, deployment...
*   And more ...

## Validation as you type

eXide constantly validates code while you edit an XQuery. It combines a client-side XQuery parser,
[xqlint](https://github.com/wcandillon/xqlint), with
the errors reported by the eXist-db server.

Validation on the server finds errors across all related modules,
while the client-side parsing provides the syntax tree required for sophisticated refactoring, context-sensitive
code completion etc.

## Code completion

In XQuery mode, pressing the `tab` key after typing a few characters calls context-sensitive code completion. 
The suggestions shown depend on the context:

* if the character sequence starts with a $, search for possible variable expansions
* if it matches a code snippet, insert it
* all other cases: show functions matching the entered prefix

A popup will be shown if there's more than one possible completion. Otherwise the code is just inserted.

As an alternative to the `tab` key, you can also press `Ctrl-Space`, `Cmd-Space` or
`Option-Space` (Mac). Unlike `tab`, this will also work if the cursor is placed in white space
or inside the prefix or namespace declarations of an *import module* or *declare namespace* expression.

## Code Snippets

Snippets are triggered by pressing
the `tab` key after typing a known keyword. For example, to create a new XQuery function, type
*fun* and press `tab`. A snippet may have one or more parameters to change: after insertion, 
the function name will be selected so you can edit it. Pressing `tab` will move to the next snippet parameter.
Press `ESC` when you are done editing parameters.

Code snippets are available in XQuery, HTML, Javascript, CSS and Less mode. To see all snippet keywords in
XQuery mode, press `Ctrl-Space` or `Cmd-Space` after a whitespace.

The snippet definitions use the same syntax as the textmate editor (a well-known editor on the mac). Feel free
to edit them. All snippet files reside in the templates collection inside the eXide collection.

## Refactoring

When writing XQuery code, one often ends up with long FLWOR expressions or markup with lots of enclosed XQuery.
In good functional style you want to clean this up and extract code into functions. eXide simplifies this by
providing refactorings for functions and variables.

To extract code into a function, select it in the editor (the block has to be syntactically valid) and choose
`XQuery/Extract function` from the menu or press `Ctrl-Shift-X` or
`Cmd-Ctrl-X` (Mac). A new function will be created with all dependant variables transformed into parameters.
At the same time the code block is replace with a matching function call and your cursor is duplicated and placed
at the function names, so you can just start typing and edit both. Press `ESC` once you are done.

Extracting a variable works in a similar way. Just press `Ctrl-Shift-E` or `Cmd-Ctrl-E`
after selecting a valid code block.

## Rename

To rename a variable or function, just place the cursor inside a variable or function name, either in its declaration
or any reference to it. Press `Ctrl-Alt-R` or `Cmd-Ctrl-R`. eXide finds all occurrences of the variable or function in the current scope (other variables with
the same name are not affected) and creates a new cursor for each of them. Start changing the name and you'll see how all
other occurrences change as well!

To rename an XML element, place the cursor inside the tag name of the start or end tag. This also works in
XML and HTML mode!

Press `ESC` when you are done.

## Quick Fixes

eXide continually parses the XQuery code while you type and displays an error or warning icon in the gutter of
the corresponding line. But instead of just complaining, eXide is able to suggest a quick fix for some types
of warnings or errors. To see if a quick fix is available, click on the icon or press the quick fix shortcut
(`Ctrl-Shift-Q` or `Command-Ctrl-Q`) to see a list of suggestions. Quick fixes are available for:

* undeclared namespaces
* calls to unknown functions
* unknown variables
* unused namespaces or module imports

## Code Navigation

In XQuery mode, eXide knows all reachable functions either in the current module or any imported one.
To navigate to a function declaration, place the cursor inside the function name of a call and press
`Ctrl-F3` or `Cmd-F3`.

To quickly navigate to any known function or variable declaration, press `Ctrl-Shift-U`
or `Cmd-Shift-U` and choose a target from the popup. Btw, within the popup, just type to
limit the displayed list to items containing the typed string.

eXide displays a list of all XQuery functions defined and imported in the "outline" pane to the left
of the query editor.

## Module Import

Create an "import module" statement (type "import" and press `tab`) and enter the prefix. When you are within the quotes for 
the namespace URI, press `Ctrl-Space` or `Cmd-Space` to call autocomplete. This should pop up any module currently stored in the db which matches the prefix you entered.

## Live Reload

When developing an XQuery application, enable *Live Reload* and the browser
tab or window containing the application's web page will automatically reload whenever
you save a resource belonging to the app's package.

Just start the app via the `Application > Live Reload` menu entry and check
*activate live reload*.

Then follow the instructions to enable live reload. Due to browser security restrictions, Live Reload
will only work if the app window has been
opened from within eXide, not via the Dashboard. A web page cannot control other windows unless it
created them.

## Drag and Drop Files

Drag a file on the editor to open its contents in a new tab. The new tab will not have the original file's name, 
but you can provide a name via "File > Save".

## Upload Directories

Use "File > Manage > Upload Files > Upload Directory" to upload
entire directories and preserve their structure. Or drag and drop onto the Upload Files pane.

## Download Resources

Use "File > Manage > (select a resource or collection) > Download Selected" to download an individual files or 
entire collections from the database and preserve their structure.

## Run XQSuite tests

Execute [XQSuite test suites](https://exist-db.org/exist/apps/doc/xqsuite) embedded in XQuery library modules by
saving the module to the database (e.g., as `/db/test.xqm`) and selecting "XQuery > Run as test".

## Support for EXPath Packages

- Download packages stored in the database via "Application > Download app"
- Synchronize your changes made on an application collection in the database to a directory on disk via "Application > Synchronize"
- [Live reload](#Live-Reload) of resources in an application package
- Upload and auto-install a package via "File > Manage > Upload" with the "Auto deploy uploaded .xar packages" checkbox selected

## Options for XML documents loaded from the database

When loading XML documents from the database into an editor window, you can control common serialization parameters, such 
as whether indentation is automatically applied, whether XInclude elements are automatically expanded, and whether XML 
declarations are omitted. Set these preferences in "Edit > Preferences > Serialization." Additional sets of these preferences 
are available for download of XML documents via "File > Download" and for
the serialization of XML documents included in application packages via ["Application > Download app"](#Support-for-EXPath-Packages).
By default, indentation is turned on for opening and downloading files but is off for downloading EXPath Packages; XInclude 
expansion is turned off in all cases; and the XML declaration is omitted in all cases. 

## Options for displaying query results

To see the results of a query, hit the "Eval" button in eXide's toolbar. (The "Run" button opens the query in a new tab 
and is only available for queries that have been saved to the database.) To automatically submit a query as you edit it, 
select the "Live Preview" checkbox at the top of the query results window.

eXide displays query results 10 at a time (i.e., a query `1 to 100` would be split into 10 pages), or customize the number of 
results. Navigate through pages of 
results with the `<<` and `>>` icons at the top of the query results window. To see all results in a single screen, surround your
query with an array constructor: `array { 1 to 100 }`. Use the "Copy to Clipboard" button to copy the current page's worth of 
results.

When displaying query results, use the dropdown menu above the query results window to select a serialization method to apply
to the results. The options available include all serialization options supported by eXist: Adaptive Output (eXide's default), 
JSON, Text, XML, HTML5, XHTML, XHTML5, MicroXML, and "Direct". In all but the last option, the selection overrides any 
serialization declarations in a query's prolog, and the results are displayed as plain text. The final, "Direct" option allows the 
serialization method to be set in the query, but the results are shown in the display window not as plain text but as the 
browser would render them assuming HTML. 

Besides controls for the serialization method, you can also control whether results are indented (pretty-printed) via the "Indent"
checkbox just above the query results window. 

When viewing the results of queries to eXist's full text index via `ft:query()`, you can automatically view the hits
wrapped in `<exist:match>` elements by selecting the "Highlight Index Matches" checkbox above the query results window. This 
simply applies the `util:expand()` function to the query's results.

# Security

Keeping eXide installed on a production server can pose a security risk. eXide fully respects eXist's security model, 
so users will only see resources they have the appropriate permissions on. However, if a query is exposed to the web, it
needs to be publicly readable, so users will be able to see at least parts of the application code via eXide.

eXide thus provides additional security checks, so one can hide any valuable source code while still allowing 
some users to access specific parts of the db via eXide. Security settings are read from the configuration.xml file
within the eXide app collection:

```xml
<configuration>
    <restrictions execute-query="yes" guest="no">
        <!-- disallow access to certain collections -->
        <!--deny collection="/db/apps/dashboard"/-->
    </restrictions>
</configuration>
```

* The `execute-query=yes|no` attribute controls if non-dba users are allowed to execute XQuery code 
from within eXide.
* `guest=yes|no`: if set to "no", the default guest user will not be able to log in. eXide will
    thus always show a login window before the editor is loaded - unless you already provided credentials during
    a previous, still valid session.
* One or more `<deny>` elements can be specified to block access to particular collections, even if the user
    has the appropriate database permissions to see those collections.

The additional security checks are done on the server, so hacking the client won't be fruitful. However, if you use
the `<deny>` feature, **you must make sure** that access to eXide's own collection is denied as well.
If not, logged in users could simply change eXide's code.
