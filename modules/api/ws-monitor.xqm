(:
 : eXide REST API — WebSocket monitoring endpoint.
 :
 : Called periodically by the client to push a snapshot of server status
 : to all eXide WebSocket subscribers. Uses ws:send() to push JSON to
 : the "eXide" channel.
 :
 : This is a transitional approach: the client polls this endpoint
 : via HTTP, which triggers a WebSocket push. A future version could
 : use a server-side scheduled job instead.
 :)
xquery version "3.1";

module namespace wsmon="http://exist-db.org/apps/eXide/api/ws-monitor";

import module namespace roaster="http://e-editiones.org/roaster";

declare namespace ws="http://exist-db.org/xquery/websocket";

(:~
 : POST /api/ws/monitor — Push a monitoring snapshot to WebSocket subscribers.
 : Returns the data that was pushed (for HTTP clients as fallback).
 :)
declare function wsmon:push-status($request as map(*)) {
    let $running-queries :=
        try { system:get-running-xqueries() } catch * { () }
    let $mem := system:get-memory-max()
    let $mem-free := system:get-memory-free()
    let $mem-total := system:get-memory-total()
    let $data := map {
        "type": "exist/metrics",
        "version": system:get-version(),
        "uptime": system:get-uptime(),
        "memory": map {
            "max": $mem,
            "total": $mem-total,
            "free": $mem-free,
            "used": $mem-total - $mem-free
        },
        "runningQueries": count($running-queries//system:query),
        "queries": array {
            for $query in $running-queries//system:query
            return map {
                "id": string($query/@id),
                "sourceType": string($query/@sourceType),
                "started": string($query/@started),
                "terminating": string($query/@terminating),
                "sourceKey": string($query/system:sourceKey),
                "elapsed": string(
                    if ($query/@started castable as xs:dateTime) then
                        let $started := xs:dateTime($query/@started)
                        return round((current-dateTime() - $started) div xs:dayTimeDuration("PT0.001S"))
                    else 0
                )
            }
        }
    }
    (: Push to WebSocket if ws module is available :)
    let $ws-available := exists(function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2))
    let $_ :=
        if ($ws-available) then
            function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2)("eXide", $data)
        else ()
    return $data
};

(:~
 : POST /api/ws/diagnostics — Push diagnostics for a document via WebSocket.
 : Called after compilation; pushes errors/warnings to the eXide channel.
 :)
declare function wsmon:push-diagnostics($request as map(*)) {
    let $body := $request?body
    let $uri := $body?uri
    let $diagnostics := $body?diagnostics
    let $data := map {
        "type": "textDocument/publishDiagnostics",
        "uri": $uri,
        "diagnostics": $diagnostics
    }
    let $ws-available := exists(function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2))
    let $_ :=
        if ($ws-available) then
            function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2)("eXide", $data)
        else ()
    return $data
};
