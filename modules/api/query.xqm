(:
 :  eXide REST API — Query execution handlers.
 :  Migrated from controller.xq execute/results and compile.xq.
 :)
xquery version "3.1";

module namespace query="http://exist-db.org/apps/eXide/api/query";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";
import module namespace lsp="http://exist-db.org/xquery/lsp";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 : POST /api/query — Execute XQuery and return a cursor for paginated retrieval.
 :
 : Uses lsp:eval() to execute the query and store the result sequence in a
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
                let $cursor := lsp:eval($xquery, $base)
                return map {
                    "id": $cursor?cursor,
                    "count": $cursor?items,
                    "elapsed": $cursor?elapsed
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
    let $diagnostics := lsp:diagnostics($xquery, $base)
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
    return lsp:symbols($xquery, $base)
};

(:~
 : POST /api/query/completions — LSP-aware function completions.
 :
 : Calls lsp:completions() with the full document text so the server
 : compiler can see user-defined functions and imported modules, then
 : filters by $prefix and builds CM6 snippet templates.
 :)
declare function query:completions($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $prefix := ($body?prefix, "")[1]
    let $base := $body?base
    let $completions := lsp:completions($xquery, $base)
    return array {
        for $item in $completions?*
        let $name := replace($item?label, "#\d+$", "")
        where $prefix = "" or starts-with($name, $prefix)
        return map {
            "text":        $item?detail,
            "snippet":     query:make-snippet($item?detail),
            "description": $item?documentation
        }
    }
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
    let $hover := lsp:hover($xquery, $line, $column, $base)
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
    let $def := lsp:definition($xquery, $line, $column, $base)
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
    return lsp:references($xquery, $line, $column, $base)
};

(:~
 : GET /api/query/{id}/results — Paginated result items from cursor.
 :
 : Uses lsp:fetch() to retrieve a page of items from the server-side cursor.
 : Only the requested items are serialized; the rest remain as live references.
 : Each item includes: value (serialized), type, documentURI, nodeId.
 :)
declare function query:results($request as map(*)) {
    let $id := $request?parameters?id
    let $start := xs:integer(($request?parameters?start, 1)[1])
    let $count := xs:integer(($request?parameters?count, 10)[1])
    return
        try {
            let $page := lsp:fetch($id, $start, $count)
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
        "closed": lsp:close($id)
    }
};
