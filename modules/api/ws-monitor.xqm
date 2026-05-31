(:
 : eXide REST API — WebSocket monitoring endpoint.
 :
 : Gathers server metrics from eXist-db's JMX status endpoint and pushes
 : them to WebSocket subscribers on the "eXide" channel. This eliminates
 : the need for clients to obtain a JMX token and poll the /status endpoint
 : directly.
 :)
xquery version "3.1";

module namespace wsmon="http://exist-db.org/apps/eXide/api/ws-monitor";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace http="http://expath.org/ns/http-client";

declare namespace ws="http://exist-db.org/xquery/websocket";
declare namespace system="http://exist-db.org/xquery/system";

(:~
 : POST /api/ws/monitor — Push a monitoring snapshot to WebSocket subscribers.
 :)
declare function wsmon:push-status($request as map(*)) {
    (: Gather metrics from system functions :)
    let $running-queries :=
        try { system:get-running-xqueries() } catch * { () }
    let $mem-max := system:get-memory-max()
    let $mem-free := system:get-memory-free()
    let $mem-total := system:get-memory-total()

    (: Also try to get the JMX data for recent queries and broker info :)
    let $jmx-token := wsmon:get-jmx-token()
    let $jmx-data :=
        if ($jmx-token) then
            try {
                let $url := request:get-scheme() || "://localhost:" || request:get-server-port()
                    || request:get-context-path() || "/status?c=instances&amp;c=processes&amp;c=memory&amp;token=" || $jmx-token
                let $response := http:send-request(
                    <http:request method="GET" href="{$url}"/>
                )
                return $response[2]
            } catch * { () }
        else ()

    (: Extract recent queries from JMX data — nested as row/value/field :)
    let $recent :=
        if ($jmx-data) then
            for $row in $jmx-data//*[local-name() = 'RecentQueryHistory']/*[local-name() = 'row']
            let $v := $row/*[local-name() = 'value']
            let $src := string(($v/*[local-name() = 'sourceKey'])[1])
            where not(contains($src, '/apps/eXide/modules/api/'))
            return map {
                "sourceKey": string(($v/*[local-name() = 'sourceKey'])[1]),
                "recentInvocationCount": string(($v/*[local-name() = 'recentInvocationCount'])[1]),
                "mostRecentExecutionDuration": string(($v/*[local-name() = 'mostRecentExecutionDuration'])[1]),
                "sourceType": string(($v/*[local-name() = 'sourceType'])[1])
            }
        else ()

    (: Extract broker info from JMX data :)
    let $active-brokers :=
        if ($jmx-data) then
            string(($jmx-data//*[local-name() = 'ActiveBrokers'])[1])
        else "--"
    let $max-brokers :=
        if ($jmx-data) then
            string(($jmx-data//*[local-name() = 'MaxBrokers'])[1])
        else "--"

    let $data := map {
        "type": "exist/metrics",
        "version": system:get-version(),
        "uptime": system:get-uptime(),
        "memory": map {
            "max": $mem-max,
            "total": $mem-total,
            "free": $mem-free,
            "used": $mem-total - $mem-free
        },
        "db": map {
            "activeBrokers": $active-brokers,
            "maxBrokers": $max-brokers
        },
        "runningQueries":
            if ($jmx-data) then
                count($jmx-data//*[local-name() = 'RunningQueries']/*[local-name() = 'row']/*[local-name() = 'value'][not(*[local-name() = 'caller'] = 'true')][not(contains(string(*[local-name() = 'sourceKey']), '/apps/eXide/modules/api/'))])
            else count($running-queries//system:xquery[not(@caller = 'true')][not(contains(string(system:sourceKey), '/apps/eXide/modules/api/'))]),
        "queries": array {
            if ($jmx-data) then
                for $row in $jmx-data//*[local-name() = 'RunningQueries']/*[local-name() = 'row']
                let $v := $row/*[local-name() = 'value']
                let $src := string(($v/*[local-name() = 'sourceKey'])[1])
                where not($v/*[local-name() = 'caller'] = 'true')
                    and not(contains($src, '/apps/eXide/modules/api/'))
                return map {
                    "id": string(($v/*[local-name() = 'id'])[1]),
                    "sourceType": string(($v/*[local-name() = 'sourceType'])[1]),
                    "started": string(($v/*[local-name() = 'started'])[1]),
                    "terminating": string(($v/*[local-name() = 'terminating'])[1]),
                    "sourceKey": string(($v/*[local-name() = 'sourceKey'])[1]),
                    "elapsed": string(($v/*[local-name() = 'elapsed'])[1])
                }
            else
                for $query in $running-queries//system:xquery[not(@caller = 'true')]
                let $src := string($query/system:sourceKey)
                where not(contains($src, '/apps/eXide/modules/api/'))
                return map {
                    "id": string($query/@id),
                    "sourceType": string($query/@sourceType),
                    "started": string($query/@started),
                    "terminating": string($query/@terminating),
                    "sourceKey": $src,
                    "elapsed": "0"
                }
        },
        "recentQueries": array { $recent }
    }

    let $data := $data
    (: Push to WebSocket if ws module is available :)
    let $ws-send := function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2)
    let $_ :=
        if (exists($ws-send)) then
            $ws-send("eXide", $data)
        else ()
    return $data
};

(:~
 : Get the JMX servlet authentication token.
 :)
declare %private function wsmon:get-jmx-token() as xs:string? {
    try {
        let $file-read := function-lookup(QName("http://expath.org/ns/file", "read-text"), 1)
        let $file-exists := function-lookup(QName("http://expath.org/ns/file", "exists"), 1)
        return
            if (exists($file-read) and exists($file-exists)) then
                let $path := system:get-exist-home() || "/data/jmxservlet.token"
                return
                    if ($file-exists($path)) then
                        let $content := $file-read($path)
                        let $lines := tokenize($content, "\n")
                        for $line in $lines
                        let $trimmed := normalize-space($line)
                        where starts-with($trimmed, "token=")
                        return substring-after($trimmed, "token=")
                    else ()
            else ()
    } catch * { () }
};

(:~
 : POST /api/ws/diagnostics — Push diagnostics for a document via WebSocket.
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
    let $ws-send := function-lookup(QName("http://exist-db.org/xquery/websocket", "send"), 2)
    let $_ :=
        if (exists($ws-send)) then
            $ws-send("eXide", $data)
        else ()
    return $data
};
