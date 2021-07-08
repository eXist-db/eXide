# Feature Documentation

## Validation as you type

eXide constantly validates code while you edit an XQuery. It combines a client-side XQuery parser 
(<a href="https://github.com/wcandillon/xqlint">xqlint</a>) with
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
or inside the prefix or namespace declarations of an <i>import module</i> or <i>declare namespace</i> expression.

## Code Snippets

Snippets are triggered by pressing
`tab` after typing a known keyword. For example, to create a new XQuery function, type
<i>fun</i> and press `tab`. A snippet may have one or more parameters to change: after insertion, 
the function name will be selected so you can edit it. Pressing `tab` will move to the next snippet parameter.
Press `ESC` when you are done editing parameters.

Code snippets are available in XQuery, HTML, Javascript, CSS and Less mode. To see all snippet keywords in
XQuery mode, press `Ctrl-Space` or `Cmd-Space` after a whitespace.

The snippet definitions use the same syntax as the textmate editor (a well-known editor on the mac). Feel free
to edit them. All snippet files reside in the templates collection inside the eXide collection.

## Refactoring

Extract function or variable from selected block

When writing XQuery code, one often ends up with long FLWOR expressions or markup with lots of enclosed XQuery.
In good functional style you want to clean this up and extract code into functions. eXide 2.0 simplifies this by
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
(`Ctrl-Shift-Q` or `Command-Ctrl-Q`) to see a list of suggestions. Quick fixes are available for
(we'll add more over time):

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

## Module Import

There are two ways to quickly import another XQuery module into the current code:

1. Choose the "Import Module" dialog from the menu or type `F4`
2. Create an "import module" statement (type "import" and press `tab`) and enter the prefix. When you are within the quotes for 
the namespace URI, press `Ctrl-Space` or `Cmd-Space` to call autocomplete. This should pop up any module currently stored in the db which matches the prefix you entered.

## Live Reload

When developing an XQuery application, enable *Live Reload* and the browser
tab or window containing the application's web page will automatically reload whenever
you save a resource belonging to the app's package.

Just start the app via the `Application/Run app` menu entry and check
*activate live reload*.

Note: due to browser security restrictions, live reload will only work if the app window has been
opened from within eXide, not via the dashboard. A web page cannot control other windows unless it
created them.

## Drop Files

Drag a file on the editor to open its contents in a new tab.

## Directory Uploads

Use File > Manage > Upload Files > Upload Directory to upload
entire directories and preserve their structure. Or drag and drop onto the Upload Files pane.

## Options for XML documents loaded from the database

When loading XML documents from the database into an editor window, you can control whether indentation is automatically applied 
or not and whether XInclude elements are automatically expanded or not. Set this preference in "Edit > Preferences > When 
opening or downloading XML documents." The same preference applies to the download of XML documents via "File > Download" and
the serialization of XML documents included in application packages via ["Application > Download app"](#Support-for-EXPath-Packages).
By default, indentation is turned on and XInclude expansion is turned off.

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

* The **execute-query=yes|no** attribute controls if non-dba users are allowed to execute XQuery code 
from within eXide.
* **guest=yes|no**: if set to "no", the default guest user will not be able to log in. eXide will
    thus always show a login window before the editor is loaded - unless you already provided credentials during
    a previous, still valid session.
* One or more **<deny>** elements can be specified to block access to particular collections, even if the user
    has the appropriate database permissions to see those collections.

The additional security checks are done on the server, so hacking the client won't be fruitful. However, if you use
the <deny> feature, **you must make sure** that access to eXide's own collection is denied as well.
If not, logged in users could simply change eXide's code.