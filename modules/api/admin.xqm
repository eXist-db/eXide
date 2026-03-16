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
            (: Use util:eval to read the JMX token file — the file module
               may be registered under different namespaces depending on
               the eXist-db version, so we try both dynamically. :)
            util:eval(``[
                let $path := system:get-exist-home() || "/data/jmxservlet.token"
                return
                    if ("http://expath.org/ns/file" = util:registered-modules()) then
                        util:eval("import module namespace f='http://expath.org/ns/file'; f:read-text('" || $path || "')")
                    else if ("http://exist-db.org/xquery/file" = util:registered-modules()) then
                        util:eval("import module namespace f='http://exist-db.org/xquery/file' at 'java:org.exist.xquery.modules.file.FileModule'; f:read('" || $path || "')")
                    else ()
            ]``)
        } catch * { () }
    let $token-line :=
        if (exists($token)) then
            let $line := tokenize($token, "\n")[starts-with(., "token=")]
            return substring-after($line, "token=")
        else ()
    return map {
        "version": system:get-version(),
        "revision": system:get-revision(),
        "build": system:get-build(),
        "uptime": system:get-uptime(),
        "jmxToken": ($token-line, "")[1],
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
 : GET /api/admin/accounts — List users and groups (for permissions dialogs).
 :)
declare function admin:accounts($request as map(*)) {
    map {
        "users": array {
            distinct-values(
                for $group in sm:list-groups()
                return
                    try { sm:get-group-members($group) }
                    catch * { () }
            )
        },
        "groups": array { sm:list-groups() }
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
