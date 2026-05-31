(:
 :  eXide REST API — Query execution handlers.
 :  Migrated from controller.xq execute/results and compile.xq.
 :)
xquery version "3.1";

module namespace query="http://exist-db.org/apps/eXide/api/query";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";
import module namespace lang="http://exist-db.org/xquery/langservice";
import module namespace cursor="http://exist-db.org/xquery/cursor";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 : POST /api/query — Execute XQuery and return a cursor for paginated retrieval.
 :
 : Uses cursor:eval() to execute the query and store the result sequence in a
 : server-side cursor (Caffeine cache). The cursor holds live node references,
 : enabling lazy serialization and document-URI lookup on fetch.
 :
 : Returns: { id (cursor ID), count (total items), elapsed (ms) }
 : Clients then call GET /api/query/{id}/results?start=1&count=10 to fetch pages.
 :)
declare function query:execute($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $base := ($body?base, "xmldb:exist:///db")[1]

    (: Check execution permission :)
    let $user := (request:get-attribute("org.exist.login.user"), "guest")[1]
    let $conf := config:get-configuration()
    let $allowed := sm:is-dba($user) or (
        $conf/restrictions/@execute-query = "yes" and (
            $conf/restrictions/@guest = "yes" or not($user = ("guest", "nobody"))
        )
    )
    return
        if (not($allowed)) then
            roaster:response(403, "application/json",
                map { "error": "Query execution not allowed" })
        else
            try {
                let $cursor := cursor:eval($xquery, $base)
                return map {
                    "id": $cursor?cursor,
                    "count": $cursor?items,
                    "elapsed": $cursor?elapsed,
                    "timing": if (exists($cursor?timing)) then $cursor?timing else ()
                }
            } catch * {
                roaster:response(400, "application/json", map {
                    "error": $err:description,
                    "code": $err:code,
                    "line": $err:line-number,
                    "column": $err:column-number,
                    "module": $err:module
                })
            }
};

(:~
 : POST /api/query/compile — Compile-check XQuery without executing.
 : Migrated from compile.xq.
 :)
declare function query:compile($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $base := $body?base
    let $uri := ($body?uri, "untitled")[1]
    let $diagnostics := lang:diagnostics($xquery, $base)
    let $errors := array {
        for $d in $diagnostics?*
        return map {
            "line": $d?line + 1,
            "column": $d?column,
            "message": $d?message,
            "code": $d?code
        }
    }
    (: Push diagnostics via WebSocket to subscribed eXide clients :)
    let $ws-send := function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2)
    let $_ :=
        if (exists($ws-send)) then
            $ws-send("eXide", map {
                "type": "textDocument/publishDiagnostics",
                "uri": $uri,
                "diagnostics": $errors
            })
        else ()
    return
        map { "errors": $errors }
};

(:~
 : POST /api/query/symbols — Document symbol list for Navigate → Symbol.
 : Returns all declared functions and variables with their positions.
 :)
declare function query:symbols($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $base := $body?base
    return lang:symbols($xquery, $base)
};

(:~
 : POST /api/query/completions — LSP-aware function completions.
 :
 : Calls lang:completions() with the full document text so the server
 : compiler can see user-defined functions and imported modules, then
 : filters by $prefix and builds CM6 snippet templates.
 :)
declare function query:completions($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $prefix := ($body?prefix, "")[1]
    let $base := $body?base
    let $completions := lang:completions($xquery, $base)
    let $lang-results :=
        for $item in $completions?*
        let $name := replace($item?label, "#\d+$", "")
        where $prefix = "" or starts-with($name, $prefix)
        return map {
            "text":        $item?detail,
            "snippet":     query:make-snippet($item?detail),
            "description": $item?documentation
        }

    (: Supplement with inspect:inspect-module-uri() for imported XQuery modules
       that lang:completions() doesn't cover (e.g. kwic, templating).

       Only run this fallback when the user typed a namespace-qualified prefix
       (e.g. "kwic:summ" — has a colon). An unprefixed identifier like "str"
       is never a namespace name; treating it as one triggers a slow walk over
       every registered/mapped module via inspect:inspect-module-uri(), adding
       ~1.5s per completion request for no benefit. :)
    let $ns-prefix := if (contains($prefix, ":")) then substring-before($prefix, ":") else ""
    let $inspect-results :=
        if ($ns-prefix = "" or exists($lang-results)) then ()
        else
            (: Extract the namespace URI for this prefix from the query's import statements :)
            let $import-pattern := "import\s+module\s+namespace\s+" || $ns-prefix || "\s*=\s*[""']([^""']+)[""']"
            let $match := analyze-string($xquery, $import-pattern)//fn:match/fn:group[1]/string()
            let $ns-uri := if (exists($match)) then $match[1]
                           (: Also check registered/mapped modules by prefix :)
                           else query:uri-for-prefix($ns-prefix)
            return
                if (empty($ns-uri)) then ()
                else
                    try {
                        let $module := inspect:inspect-module-uri(xs:anyURI($ns-uri))
                        for $func in $module//function[(@visibility = "public" or not(@visibility))
                                                        and (argument or @arity = "0")]
                        let $name := $func/@name/string()
                        let $sig := query:build-signature($func)
                        where starts-with($name, $prefix)
                        return map {
                            "text":        $sig,
                            "snippet":     query:make-snippet($sig),
                            "description": normalize-space($func/description/string())
                        }
                    } catch * { () }

    return array { $lang-results, $inspect-results }
};

(:~
 : Look up a namespace URI for a given module prefix from registered/mapped modules.
 :)
declare %private function query:uri-for-prefix($prefix as xs:string) as xs:string? {
    (
        for $uri in distinct-values((util:registered-modules(), util:mapped-modules()))
        let $module := try { inspect:inspect-module-uri(xs:anyURI($uri)) } catch * { () }
        where $module/@prefix = $prefix
        return $uri
    )[1]
};

(:~
 : Build a function signature string from inspect XML.
 : E.g. "kwic:summarize($hit as element(), $config as element()?) as element()"
 :)
declare %private function query:build-signature($func as element()) as xs:string {
    let $name := $func/@name/string()
    let $params :=
        for $arg in $func/argument
        return "$" || $arg/@var/string() ||
               (if ($arg/@type) then " as " || $arg/@type/string() || query:cardinality-symbol($arg/@cardinality) else "")
    let $return := $func/returns
    return
        $name || "(" || string-join($params, ", ") || ")" ||
        (if ($return/@type) then " as " || $return/@type/string() || query:cardinality-symbol($return/@cardinality) else "")
};

(:~
 : Convert inspect cardinality words to XQuery symbols.
 :)
declare %private function query:cardinality-symbol($cardinality as xs:string?) as xs:string {
    switch ($cardinality)
        case "zero or one"  return "?"
        case "zero or more" return "*"
        case "one or more"  return "+"
        case "exactly one"  return ""
        default return ""
};

(:~
 : Build a CM6 snippet template from an LSP detail string.
 : E.g. "count($items as item()*) as xs:integer" → "count(${1:$items})"
 :)
declare %private function query:make-snippet($detail as xs:string) as xs:string {
    let $fname := replace($detail, "\(.*$", "")
    let $params := analyze-string($detail, '\$([a-zA-Z][a-zA-Z0-9\-_\.]*)') //fn:match/fn:group[1]/string()
    return
        if (empty($params)) then $fname || "()"
        else
            $fname || "(" ||
            string-join(
                for $p at $i in $params
                return "${" || $i || ":$" || $p || "}",
                ", "
            ) || ")"
};

(:~
 : POST /api/query/hover — Get hover info for symbol at position.
 :)
declare function query:hover($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $line := xs:integer($body?line)
    let $column := xs:integer($body?column)
    let $base := $body?base
    let $hover := lang:hover($xquery, $line, $column, $base)
    return
        if (exists($hover)) then
            $hover
        else
            map {}
};

(:~
 : POST /api/query/definition — Get definition location for symbol at position.
 :)
declare function query:definition($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $line := xs:integer($body?line)
    let $column := xs:integer($body?column)
    let $base := $body?base
    let $def := lang:definition($xquery, $line, $column, $base)
    return
        if (exists($def)) then
            $def
        else
            map {}
};

(:~
 : POST /api/query/references — Find all references to symbol at position.
 :)
declare function query:references($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $line := xs:integer($body?line)
    let $column := xs:integer($body?column)
    let $base := ($body?base, "xmldb:exist:///db")[1]
    return lang:references($xquery, $line, $column, $base)
};

(:~
 : GET /api/query/{id}/results — Paginated result items from cursor.
 :
 : Uses cursor:fetch() to retrieve a page of items from the server-side cursor.
 : Only the requested items are serialized; the rest remain as live references.
 : Each item includes: value (serialized), type, documentURI, nodeId.
 :
 : Accepts serialization parameters as query string params:
 :   method (adaptive|xml|json|text|html5|xhtml|xhtml5|microxml)
 :   indent (yes|no)
 :   highlight-matches (yes|no — eXist-specific, expands index match markers)
 :   omit-xml-declaration, encoding, media-type, item-separator, etc.
 :)
declare function query:results($request as map(*)) {
    let $id := $request?parameters?id
    let $start := xs:integer(($request?parameters?start, 1)[1])
    let $count := xs:integer(($request?parameters?count, 10)[1])

    (: Build serialization options from query parameters :)
    let $method := ($request?parameters?method, "adaptive")[1]
    let $indent := ($request?parameters?indent, "yes")[1]
    let $ser-params := map:merge((
        map { "method": $method, "indent": $indent },
        (: Pass through any additional W3C serialization params :)
        if (exists($request?parameters?("omit-xml-declaration")))
            then map { "omit-xml-declaration": $request?parameters?("omit-xml-declaration") } else (),
        if (exists($request?parameters?encoding))
            then map { "encoding": $request?parameters?encoding } else (),
        if (exists($request?parameters?("media-type")))
            then map { "media-type": $request?parameters?("media-type") } else (),
        if (exists($request?parameters?("item-separator")))
            then map { "item-separator": $request?parameters?("item-separator") } else (),
        (: eXist-specific: highlight index matches :)
        if (exists($request?parameters?("highlight-matches")))
            then map { "highlight-matches": $request?parameters?("highlight-matches") } else ()
    ))
    (: Use 4-arity fetch with serialization params if available,
       fall back to 3-arity (default serialization) if not :)
    let $fetch4 := function-lookup(QName("http://exist-db.org/xquery/cursor", "fetch"), 4)
    return
        try {
            let $page :=
                if (exists($fetch4)) then
                    $fetch4($id, $start, $count, $ser-params)
                else
                    cursor:fetch($id, $start, $count)
            return map {
                "start": $start,
                "count": array:size($page),
                "items": $page
            }
        } catch * {
            roaster:response(404, "application/json",
                map { "error": "Cursor expired or invalid: " || $id })
        }
};

(:~
 : DELETE /api/query/{id} — Close a cursor and release server resources.
 :)
declare function query:close($request as map(*)) {
    let $id := $request?parameters?id
    return map {
        "closed": cursor:close($id)
    }
};
