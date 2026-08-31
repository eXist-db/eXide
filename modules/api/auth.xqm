(:
 :  eXide REST API — Authentication handlers.
 :)
xquery version "3.1";

module namespace auth="http://exist-db.org/apps/eXide/api/auth";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

(:~
 : The current request's identity, derived from the actual eXist subject
 : (`sm:id()`) rather than the persistent-login request attribute.
 :
 : This matters: the attribute (`org.exist.login.user`) is populated only by
 : the persistent-login flow (login form params or the remember-me cookie), so
 : a request authenticated by the HTTP Basic header reported as `guest` even
 : though it executed as the real user. `sm:id()` reflects whatever
 : authenticated the request — Basic header, the shared `org.exist.login`
 : cookie (processed by controller.xq before this handler runs), or a freshly
 : minted login session — uniformly. This is the same identity basis used by
 : Roaster's `rutil:getDBUser()` and by existdb-openapi, so eXide's notion of
 : "who" now matches the rest of the stack.
 :
 : `sm:effective` is preferred over `sm:real` because token/cookie logins set
 : the effective user (same reasoning as Roaster's getDBUser).
 :)
declare function auth:current-user() as map(*) {
    let $id := sm:id()/sm:id
    let $principal := ($id/sm:effective, $id/sm:real)[1]
    let $name := ($principal/sm:username/string(), "guest")[1]
    return map {
        "name": $name,
        "isAdmin": sm:is-dba($name),
        "isLoggedIn": not($name = ("guest", "nobody"))
    }
};

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
 : forwarding here. This handler reports the resulting identity.
 :)
declare function auth:login($request as map(*)) {
    let $user := auth:current-user()
    return
        if (auth:is-allowed($user?name)) then
            map {
                "user": $user?name,
                "isAdmin": $user?isAdmin
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
    let $user := auth:current-user()
    let $conf := config:get-configuration()
    return map {
        "user": $user?name,
        "isAdmin": $user?isAdmin,
        "isLoggedIn": $user?isLoggedIn,
        "queryExecution": $user?isAdmin or (
            $conf/restrictions/@execute-query = "yes" and auth:is-allowed($user?name)
        )
    }
};
