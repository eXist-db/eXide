(:
 :  eXide REST API — Authentication handlers.
 :)
xquery version "3.1";

module namespace auth="http://exist-db.org/apps/eXide/api/auth";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

(:~
 : Identity comes from `$request?user`, which Roaster's standard-authorization
 : middleware populates (via `rutil:getDBUser()` → `sm:id()`) for every route.
 :
 : These two auth routes previously carried a `security: []` override, which
 : opted them out of the middleware and forced the handlers to resolve identity
 : themselves. With the override removed they participate in the same
 : cookie/Basic authentication as every other route, so the handler just reads
 : `$request?user` — the single identity basis shared with existdb-openapi and
 : the rest of the stack. The map shape is `{name, fullName, groups, dba}`,
 : with `name` = "guest" when unauthenticated.
 :)
declare function auth:is-allowed($user as xs:string?) as xs:boolean {
    let $conf := config:get-configuration()
    return
        $conf/restrictions/@guest = "yes" or (
            exists($user) and not($user = ("guest", "nobody"))
        )
};

(:~
 : POST /api/auth/session — Login.
 :
 : The persistent-login cookie is minted by controller.xq's `login:set-user`,
 : which reads the `user` / `password` / `duration` form parameters before
 : forwarding here. By handler time Roaster has resolved the resulting subject
 : into `$request?user`; this handler reports it.
 :)
declare function auth:login($request as map(*)) {
    let $user := $request?user
    let $name := $user?name
    return
        if (auth:is-allowed($name)) then
            map {
                "user": $name,
                "isAdmin": $user?dba
            }
        else
            roaster:response(401, "application/json",
                map { "error": "unauthorized" })
};

(:~
 : DELETE /api/auth/session?logout=true — Logout.
 :
 : The persistent login cookie is cleared by controller.xq's login:set-user()
 : call, which runs before this handler and detects the "logout" request
 : parameter. This handler invalidates the HTTP session.
 :)
declare function auth:logout($request as map(*)) {
    let $_ := session:invalidate()
    return map { "status": "ok" }
};

(:~
 : GET /api/auth/whoami — Current user info.
 :)
declare function auth:whoami($request as map(*)) {
    let $user := $request?user
    let $name := $user?name
    let $conf := config:get-configuration()
    return map {
        "user": $name,
        "isAdmin": $user?dba,
        "isLoggedIn": not($name = ("guest", "nobody")),
        "queryExecution": $user?dba or (
            $conf/restrictions/@execute-query = "yes" and auth:is-allowed($name)
        )
    }
};
