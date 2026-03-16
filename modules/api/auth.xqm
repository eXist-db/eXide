(:
 :  eXide REST API — Authentication handlers.
 :)
xquery version "3.1";

module namespace auth="http://exist-db.org/apps/eXide/api/auth";

import module namespace login="http://exist-db.org/xquery/login"
    at "resource:org/exist/xquery/modules/persistentlogin/login.xql";
import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

declare variable $auth:LOGIN_DOMAIN := "org.exist.login";

declare function auth:get-user() as xs:string? {
    let $_ := login:set-user($auth:LOGIN_DOMAIN, xs:dayTimeDuration("P7D"), false())
    return request:get-attribute($auth:LOGIN_DOMAIN || ".user")
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
 :)
declare function auth:login($request as map(*)) {
    let $user := auth:get-user()
    return
        if (auth:is-allowed($user)) then
            map {
                "user": ($user, "guest")[1],
                "isAdmin": sm:is-dba(($user, "guest")[1])
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
    let $user := auth:get-user()
    let $conf := config:get-configuration()
    let $user-to-check := ($user, "guest")[1]
    return map {
        "user": $user-to-check,
        "isAdmin": sm:is-dba($user-to-check),
        "isLoggedIn": exists($user) and not($user = ("guest", "nobody")),
        "queryExecution": sm:is-dba($user-to-check) or (
            $conf/restrictions/@execute-query = "yes" and auth:is-allowed($user)
        )
    }
};
