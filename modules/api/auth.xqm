(:
 :  eXide REST API — Authentication handlers.
 :)
xquery version "3.1";

module namespace auth="http://exist-db.org/apps/eXide/api/auth";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace rauth="http://e-editiones.org/roaster/auth";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

(:~
 : Authentication is fully delegated to Roaster. The login/logout handlers below
 : mint and clear the session via Roaster's auth module (`login-user` /
 : `logout-user`); the controller no longer carries any login logic. The cookie
 : name is read from the OpenAPI spec (`components.securitySchemes.cookieAuth.name`
 : = `org.exist.login`) by `rauth:add-cookie-name`.
 :
 : For routes that DO require an established identity (logout, whoami), Roaster's
 : standard-authorization middleware populates `$request?user` via `sm:id()`. The
 : map shape is `{name, fullName, groups, dba}`, with `name` = "guest" when
 : unauthenticated.
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
 : Bypasses authorization (`security: []` in the spec) — the caller is not yet
 : authenticated. Credentials arrive in the request body as `user`/`password`
 : (the route accepts both application/json and form-encoded bodies, so the SPA's
 : fetch and login.html's form both work). `rauth:login-user` validates them and,
 : on success, sets the persistent-login cookie and HTTP session, returning the
 : username; on failure it returns the empty sequence.
 :)
declare function auth:login($request as map(*)) {
    let $user :=
        rauth:login-user(
            string($request?body?user),
            string($request?body?password),
            rauth:add-cookie-name($request, map {})
        )
    return
        (: empty -> bad credentials; not is-allowed -> a valid account the config
           bars (e.g. guest when restrictions/@guest = "no"). :)
        if (empty($user) or not(auth:is-allowed($user))) then
            roaster:response(401, "application/json",
                map { "error": "Invalid user or password" })
        else
            map {
                "user": $user,
                "isAdmin": sm:is-dba($user)
            }
};

(:~
 : DELETE /api/auth/session — Logout.
 :
 : `rauth:logout-user` invalidates the HTTP session and persistent-login token and
 : sets an expiring cookie.
 :)
declare function auth:logout($request as map(*)) {
    rauth:logout-user(rauth:add-cookie-name($request, map {})),
    map { "status": "ok" }
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
