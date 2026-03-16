(:
 :  eXide REST API — Query execution handlers.
 :  Migrated from controller.xq execute/results and compile.xq.
 :)
xquery version "3.1";

module namespace query="http://exist-db.org/apps/eXide/api/query";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(: Dynamic lookup for lsp:* functions — gracefully degrades when the
   lsp module is not available (e.g., eXist-db < 7.0 without PR #6130) :)
declare variable $query:lsp-ns := "http://exist-db.org/xquery/lsp";
declare variable $query:lsp-available := exists(
    function-lookup(QName($query:lsp-ns, "diagnostics"), 2)
);

(:~
 : POST /api/query — Execute XQuery and return results.
 :)
declare function query:execute($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $base := $body?base
    let $serialization := ($body?serialization, "adaptive")[1]

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
            let $start-time := util:system-time()
            return
                try {
                    let $result := util:eval($xquery, false(), (), false())
                    let $elapsed := seconds-from-duration(util:system-time() - $start-time)
                    let $count := count($result)

                    (: Store results in session for pagination :)
                    let $session-id := util:uuid()
                    let $_ := session:set-attribute("results_" || $session-id, $result)
                    let $_ := session:set-attribute("results_" || $session-id || "_count", $count)
                    let $_ := session:set-attribute("results_" || $session-id || "_serialization", $serialization)

                    return map {
                        "id": $session-id,
                        "count": $count,
                        "elapsed": $elapsed,
                        "items": array {
                            for $item at $i in subsequence($result, 1, 20)
                            return query:serialize-item($item, $serialization)
                        }
                    }
                } catch * {
                    let $elapsed := seconds-from-duration(util:system-time() - $start-time)
                    return roaster:response(400, "application/json", map {
                        "error": $err:description,
                        "code": $err:code,
                        "line": $err:line-number,
                        "column": $err:column-number,
                        "module": $err:module,
                        "elapsed": $elapsed
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
    let $diagnostics :=
        if ($query:lsp-available) then
            function-lookup(QName($query:lsp-ns, "diagnostics"), 2)($xquery, $base)
        else ()
    return
        map {
            "errors": array {
                for $d in $diagnostics?*
                return map {
                    "line": $d?line + 1,
                    "column": $d?column,
                    "message": $d?message,
                    "code": $d?code
                }
            }
        }
};

(:~
 : POST /api/query/symbols — Document symbol list for Navigate → Symbol.
 : Returns all declared functions and variables with their positions.
 :)
declare function query:symbols($request as map(*)) {
    let $body := $request?body
    let $xquery := $body?query
    let $base := $body?base
    return
        if ($query:lsp-available) then
            function-lookup(QName($query:lsp-ns, "symbols"), 2)($xquery, $base)
        else array {}
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
    let $completions :=
        if ($query:lsp-available) then
            function-lookup(QName($query:lsp-ns, "completions"), 2)($xquery, $base)
        else array {}
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
    let $hover :=
        if ($query:lsp-available) then
            function-lookup(QName($query:lsp-ns, "hover"), 4)($xquery, $line, $column, $base)
        else ()
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
    let $def :=
        if ($query:lsp-available) then
            function-lookup(QName($query:lsp-ns, "definition"), 4)($xquery, $line, $column, $base)
        else ()
    return
        if (exists($def)) then
            $def
        else
            map {}
};

(:~
 : GET /api/query/{id}/results — Paginated result items.
 : Replaces session.xq result retrieval.
 :)
declare function query:results($request as map(*)) {
    let $id := $request?parameters?id
    let $start := ($request?parameters?start, 1)[1]
    let $count := ($request?parameters?count, 20)[1]
    let $result := session:get-attribute("results_" || $id)
    let $total := session:get-attribute("results_" || $id || "_count")
    let $serialization := (session:get-attribute("results_" || $id || "_serialization"), "adaptive")[1]
    return
        if (empty($result) and empty($total)) then
            roaster:response(404, "application/json",
                map { "error": "Session expired or invalid query ID" })
        else map {
            "total": ($total, 0)[1],
            "start": $start,
            "count": $count,
            "items": array {
                for $item in subsequence($result, $start, $count)
                return query:serialize-item($item, $serialization)
            }
        }
};

(:~
 : Serialize a single result item to string for JSON transport.
 :)
declare %private function query:serialize-item($item, $serialization as xs:string) as xs:string {
    if ($item instance of node()) then
        serialize($item, <output:serialization-parameters>
            <output:method>{
                if ($serialization = ("html5", "xhtml", "xhtml5")) then $serialization
                else if ($serialization = "json") then "json"
                else if ($serialization = "text") then "text"
                else "xml"
            }</output:method>
            <output:indent>yes</output:indent>
        </output:serialization-parameters>)
    else
        string($item)
};
