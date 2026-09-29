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
    let $token := admin:get-jmx-token()
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
 : Resolve the JMX servlet token.
 :
 : Prefers the built-in system:get-jmx-token() accessor, looked up
 : dynamically via function-lookup() -- a static call would be an
 : uncatchable XPST0017 on eXist-db versions that predate it (e.g.
 : 7.0.0-beta3, the version originally reported against below), which would
 : break every function in this module, not just this one.
 :
 : Falls back to reading the token file directly for those versions.
 : get-exist-home() is used to locate it, but on some installs (notably
 : outside Docker) it returns "", which used to make this the ONLY path and
 : always fail silently. The file module may also be registered under
 : different namespaces depending on the eXist-db version, so we try both
 : dynamically.
 :
 : @return the JMX token, or the empty sequence if it can't be resolved
 : @see http://exist-db.org/apps/eXide/api/ws-monitor;wsmon:get-jmx-token equivalent resolver used by the WebSocket push endpoint
 : @see https://github.com/eXist-db/eXide/issues/821
 : @see https://github.com/eXist-db/exist/issues/6582 get-exist-home() returning "" on non-Docker installs
 :)
declare %private function admin:get-jmx-token() as xs:string? {
    let $get-token := function-lookup(QName("http://exist-db.org/xquery/system", "get-jmx-token"), 0)
    return
        if (exists($get-token)) then
            try { $get-token() } catch * { () }
        else
            try {
                let $text := util:eval(``[
                    let $path := system:get-exist-home() || "/data/jmxservlet.token"
                    return
                        if ("http://expath.org/ns/file" = util:registered-modules()) then
                            util:eval("import module namespace f='http://expath.org/ns/file'; f:read-text('" || $path || "')")
                        else if ("http://exist-db.org/xquery/file" = util:registered-modules()) then
                            util:eval("import module namespace f='http://exist-db.org/xquery/file' at 'java:org.exist.xquery.modules.file.FileModule'; f:read('" || $path || "')")
                        else ()
                ]``)
                return
                    if (exists($text)) then
                        let $line := tokenize($text, "\n")[starts-with(., "token=")]
                        return substring-after($line, "token=")
                    else ()
            } catch * { () }
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
