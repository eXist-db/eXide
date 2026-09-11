(:
 :  eXide REST API — Query compilation and language-service handlers.
 :
 :  Query execution and server-side cursor paging (execute/results/close)
 :  were offloaded to existdb-openapi's /api/query; the editor calls that
 :  endpoint directly. What remains here is the compile check plus the
 :  language services backing the editor (symbols, completions, hover,
 :  go-to-definition, references), all served by the langservice module.
 :)
xquery version "3.1";

module namespace query="http://exist-db.org/apps/eXide/api/query";

import module namespace lang="http://exist-db.org/xquery/langservice";

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
