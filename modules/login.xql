xquery version "3.0";

module namespace login="http://exist-db.org/xquery/app/wiki/session";

import module namespace cache="http://exist-db.org/xquery/cache" at "java:org.exist.xquery.modules.cache.CacheModule";

declare %private function login:store-credentials($user as xs:string, $password as xs:string,
    $maxAge as xs:dayTimeDuration?) as xs:string {
    let $token := util:uuid($password)
    let $expires := if (empty($maxAge)) then () else util:system-dateTime() + $maxAge
    let $newEntry := map {
        "token" := $token, 
        "user" := $user, 
        "password" := $password, 
        "expires" := $expires
    }
    return (
        $token,
        cache:put("xquery.login.users", $token, $newEntry)
    )[1]
};

declare %private function login:is-valid($entry as map(*)) {
    empty($entry("expires")) or util:system-dateTime() < $entry("expires")
};

declare %private function login:with-login($user as xs:string, $password as xs:string, $func as function() as item()*) {
    let $loggedIn := xmldb:login("/db", $user, $password)
    return
        if ($loggedIn) then
            $func()
        else
            ()
};

declare %private function login:get-credentials($domain as xs:string, $token as xs:string) as element()* {
    let $entry := cache:get("xquery.login.users", $token)
    return
        if (exists($entry) and login:is-valid($entry)) then
            login:with-login($entry("user"), $entry("password"), function() {
                <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="xquery.user" value="{$entry('user')}"/>,
                <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="xquery.password" value="{$entry('password')}"/>,
                <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="{$domain}.user" value="{$entry('user')}"/>
            })
        else
            util:log("INFO", ("No login entry found for user hash: ", $token))
};

declare %private function login:create-login-session($domain as xs:string, $user as xs:string, $password as xs:string,
    $maxAge as xs:dayTimeDuration?) {
    login:with-login($user, $password, function() {
        let $token := login:store-credentials($user, $password, $maxAge)
        return (
            <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="{$domain}.user" value="{$user}"/>,
            <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="xquery.user" value="{$user}"/>,
            <set-attribute xmlns="http://exist.sourceforge.net/NS/exist" name="xquery.password" value="{$password}"/>,
            if (empty($maxAge)) then
                response:set-cookie($domain, $token)
            else
                response:set-cookie($domain, $token, $maxAge, false())
        )
    })
};

declare %private function login:clear-credentials($token as xs:string) {
    let $removed := cache:remove("xquery.login.users", $token)
    return
        ()
};

(:~
    Check if login parameters were passed in the request. If yes, try to authenticate
    the user and store credentials into the session. Clear the session if parameter
    "logout" is set.
    
    The function returns an XML fragment to be included into the dispatch XML or
    the empty set if the user could not be authenticated or the
    session is empty.
:)
declare function login:set-user($domain as xs:string, $maxAge as xs:dayTimeDuration?) as element()* {
    session:create(),
    let $user := request:get-parameter("user", ())
    let $password := request:get-parameter("password", ())
    let $logout := request:get-parameter("logout", ())
    let $durationParam := request:get-parameter("duration", ())
    let $duration :=
        if ($durationParam) then
            xs:dayTimeDuration($durationParam)
        else
            $maxAge
    let $cookie := request:get-cookie-value($domain)
    return
        if ($logout eq "logout") then
            login:clear-credentials($cookie)
        else if ($user) then
            login:create-login-session($domain, $user, $password, $duration)
        else if (exists($cookie)) then
            login:get-credentials($domain, $cookie)
        else
            ()
};