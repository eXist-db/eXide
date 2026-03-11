(:
 :  eXide REST API — Admin and monitoring handlers.
 :  Migrated from monitor.xq.
 :)
xquery version "3.1";

module namespace admin="http://exist-db.org/apps/eXide/api/admin";

import module namespace roaster="http://e-editiones.org/roaster";

(:~
 : GET /api/admin/status — Server health and JMX metrics.
 :)
declare function admin:status($request as map(*)) {
    let $jmx :=
        try { system:get-running-xqueries() } catch * { () }
    let $token :=
        try {
            let $raw := file:read(system:get-exist-home() || "/data/jmxservlet.token")
            let $line := tokenize($raw, "\n")[starts-with(., "token=")]
            return substring-after($line, "token=")
        } catch * { () }
    return map {
        "version": system:get-version(),
        "revision": system:get-revision(),
        "build": system:get-build(),
        "uptime": system:get-uptime(),
        "jmxToken": ($token, "")[1],
        "runningQueries": count($jmx//system:query)
    }
};

(:~
 : GET /api/admin/queries — Running and recent queries.
 :)
declare function admin:queries($request as map(*)) {
    let $running := system:get-running-xqueries()
    return map {
        "queries": array {
            for $query in $running//system:query
            return map {
                "id": $query/@id/string(),
                "sourceType": $query/@sourceType/string(),
                "started": $query/@started/string(),
                "terminating": string($query/@terminating),
                "sourceKey": $query/system:sourceKey/string()
            }
        }
    }
};

(:~
 : DELETE /api/admin/queries/{id} — Kill a running query.
 :)
declare function admin:kill-query($request as map(*)) {
    let $id := $request?parameters?id
    return
        try {
            let $_ := system:kill-running-xquery(xs:integer($id))
            return map { "status": "ok" }
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};
