(:
 :  eXide REST API — Query execution handlers.
 :  Migrated from controller.xq execute/results and compile.xq.
 :)
xquery version "3.1";

module namespace query="http://exist-db.org/apps/eXide/api/query";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

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
    return
        try {
            let $_ := util:compile-query($xquery, $base)
            return map { "errors": array {} }
        } catch * {
            map {
                "errors": array {
                    map {
                        "line": $err:line-number,
                        "column": $err:column-number,
                        "message": $err:description,
                        "code": string($err:code)
                    }
                }
            }
        }
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
