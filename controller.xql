xquery version "3.0";

declare namespace json="http://www.json.org";

import module namespace config="http://exist-db.org/xquery/apps/config" at "/db/apps/eXide/modules/config.xqm";

declare variable $exist:path external;
declare variable $exist:resource external;
declare variable $exist:prefix external;
declare variable $exist:controller external;

(: Determine if the persistent login module is available :)
declare variable $login :=
    let $tryImport :=
        try {
            util:import-module(xs:anyURI("http://exist-db.org/xquery/login"), "login", xs:anyURI("resource:org/exist/xquery/modules/persistentlogin/login.xql")),
            true()
        } catch * {
            false()
        }
    return
        if ($tryImport) then
            function-lookup(xs:QName("login:set-user"), 3)
        else
            local:fallback-login#3
;

(:~
    Fallback login function used when the persistent login module is not available.
    Stores user/password in the HTTP session.
 :)
declare function local:fallback-login($domain as xs:string, $maxAge as xs:dayTimeDuration?, $asDba as xs:boolean) {
    let $durationParam := request:get-parameter("duration", ())
    let $user := request:get-parameter("user", ())
    let $password := request:get-parameter("password", ())
    let $logout := request:get-parameter("logout", ())
    return
        if ($durationParam) then
            error(xs:QName("login"), "Persistent login module not enabled in this version of eXist-db")
        else if ($logout) then
            session:invalidate()
        else
            if ($user) then
                let $isLoggedIn := xmldb:login("/db", $user, $password, true())
                return
                    if ($isLoggedIn and (not($asDba) or xmldb:is-admin-user($user))) then (
                        session:set-attribute("eXide.user", $user),
                        session:set-attribute("eXide.password", $password),
                        request:set-attribute($domain || ".user", $user),
                        request:set-attribute("xquery.user", $user),
                        request:set-attribute("xquery.password", $password)
                    ) else
                        ()
            else
                let $user := session:get-attribute("eXide.user")
                let $password := session:get-attribute("eXide.password")
                return (
                    request:set-attribute($domain || ".user", $user),
                    request:set-attribute("xquery.user", $user),
                    request:set-attribute("xquery.password", $password)
                )
};

declare function local:user-allowed() {
    (
        request:get-attribute("org.exist.login.user") and
        request:get-attribute("org.exist.login.user") != "guest"
    ) or config:get-configuration()/restrictions/@guest = "yes"
};

declare function local:query-execution-allowed() {
    (
    config:get-configuration()/restrictions/@execute-query = "yes"
        and
    local:user-allowed()
    )
        or
    xmldb:is-admin-user((request:get-attribute("org.exist.login.user"),request:get-attribute("xquery.user"), 'nobody')[1])
};

if ($exist:path eq '') then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <redirect url="{request:get-uri()}/"/>
    </dispatch>

else if ($exist:path eq '/') then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
    {
        if(lower-case(request:get-uri()) = "/exist/apps/exide/" and lower-case(request:get-header("X-Forwarded-URI")) = "/apps/exide/") then
            <redirect url="/apps/eXide/index.html"/>
        else
            <redirect url="index.html"/>
    }
    </dispatch>

(:
 : Login a user via AJAX. Just returns a 401 if login fails.
 :)
else if ($exist:resource = 'login') then
    let $loggedIn := $login("org.exist.login", (), false())
    return
        try {
            util:declare-option("exist:serialize", "method=json"),
            if (local:user-allowed()) then
                <status>
                    <user>{request:get-attribute("org.exist.login.user")}</user>
                    <isAdmin json:literal="true">{ xmldb:is-admin-user((request:get-attribute("org.exist.login.user"),request:get-attribute("xquery.user"), 'nobody')[1]) }</isAdmin>
                </status>
            else 
                (
                    response:set-status-code(401),
                    <status>fail</status>
                )
        } catch * {
            response:set-status-code(401),
            <status>{$err:description}</status>
        }

else if (starts-with($exist:path, "/store/")) then
    let $resource := substring-after($exist:path, "/store")
    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <forward url="{$exist:controller}/modules/store.xql">
                <add-parameter name="path" value="{$resource}"/>
                {$login("org.exist.login", (), false())}
            </forward>
        </dispatch>

else if (starts-with($exist:path, "/check/")) then
    let $resource := substring-after($exist:path, "/validate")
    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <forward url="{$exist:controller}/modules/validate-xml.xql">
                <add-parameter name="validate" value="no"/>
                {$login("org.exist.login", (), false())}
            </forward>
        </dispatch>

else if ($exist:resource = "index.html") then
    if (local:user-allowed()) then 
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <view>
                <forward url="modules/view.xql">
                    <set-header name="Cache-Control" value="max-age=3600"/>
                </forward>
            </view>
        </dispatch>
    else 
        (
            response:set-status-code(401),
            <status>fail</status>
        )

(: Documentation :)
else if (matches($exist:path, "/docs/.*\.html")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <view>
            <!-- pass the results through documentation.xql -->
    		<forward url="{$exist:controller}/modules/documentation.xql">
            </forward>
        </view>
    </dispatch>

else if ($exist:resource eq 'execute') then
    let $query := request:get-parameter("qu", ())
    let $base := request:get-parameter("base", ())
    let $output := request:get-parameter("output", "xml")
    let $startTime := util:system-time()
    let $doLogin := $login("org.exist.login", (), false())
    let $userAllowed := local:query-execution-allowed()
    return
        if ($userAllowed) then
            switch ($output)
                case "adaptive"
                case "html5"
                case "xhtml"
                case "xhtml5"
                case "text"
                case "microxml"
                case "json"
                case "xml" return
                    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
                        <!-- Query is executed by XQueryServlet -->
                        <forward servlet="XQueryServlet">
                            {$login("org.exist.login", (), false())}
                            <set-header name="Cache-Control" value="no-cache"/>
                            <!-- Query is passed via the attribute 'xquery.source' -->
                            <set-attribute name="xquery.source" value="{$query}"/>
                            <!-- Results should be written into attribute 'results' -->
                            <set-attribute name="xquery.attribute" value="results"/>
            		        <set-attribute name="xquery.module-load-path" value="{$base}"/>
                            <clear-attribute name="results"/>
                            <!-- Errors should be passed through instead of terminating the request -->
                            <set-attribute name="xquery.report-errors" value="yes"/>
                            <set-attribute name="start-time" value="{util:system-time()}"/>
                        </forward>
                        <view>
                            <!-- Post process the result: store it into the HTTP session
                               and return the number of hits only. -->
                            <forward url="modules/session.xql">
                               <clear-attribute name="xquery.source"/>
                               <clear-attribute name="xquery.attribute"/>
                               <set-attribute name="elapsed"
                                   value="{string(seconds-from-duration(util:system-time() - $startTime))}"/>
                            </forward>
            	        </view>
                    </dispatch>
                default return
                    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
                        <!-- Query is executed by XQueryServlet -->
                        <forward servlet="XQueryServlet">
                            {$login("org.exist.login", (), false())}
                            <set-header name="Cache-Control" value="no-cache"/>
                            <!-- Query is passed via the attribute 'xquery.source' -->
                            <set-attribute name="xquery.source" value="{$query}"/>
                	        <set-attribute name="xquery.module-load-path" value="{$base}"/>
                            <!-- Errors should be passed through instead of terminating the request -->
                            <set-attribute name="xquery.report-errors" value="yes"/>
                            <set-attribute name="start-time" value="{util:system-time()}"/>
                        </forward>
                    </dispatch>
        else
            response:set-status-code(401)

(: Retrieve an item from the query results stored in the HTTP session. The
 : format of the URL will be /sandbox/results/X, where X is the number of the
 : item in the result set :)
else if (starts-with($exist:path, '/results/')) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="../modules/session.xql">
            {$login("org.exist.login", (), false())}
            <set-header name="Cache-Control" value="no-cache"/>
            <add-parameter name="num" value="{$exist:resource}"/>
        </forward>
    </dispatch>

else if ($exist:resource eq "outline") then
    let $query := request:get-parameter("qu", ())
    let $base := request:get-parameter("base", ())
	return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
	        <!-- Query is executed by XQueryServlet -->
            <forward url="modules/outline.xql">
                {$login("org.exist.login", (), false())}
                <set-header name="Cache-Control" value="no-cache"/>
	            <set-attribute name="xquery.module-load-path" value="{$base}"/>
            </forward>
    </dispatch>

else if ($exist:resource eq "debug") then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <!-- Query is executed by XQueryServlet -->
        <forward url="modules/debuger.xql">
            {$login("org.exist.login", (), false())}
            <set-header name="Cache-Control" value="no-cache"/>
        </forward>
    </dispatch>

else if (ends-with($exist:path, ".xql")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        {$login("org.exist.login", (), false())}
        <set-header name="Cache-Control" value="no-cache"/>
        <set-attribute name="app-root" value="{$exist:prefix}{$exist:controller}"/>
    </dispatch>

else if (contains($exist:path, "/$shared/")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="/shared-resources/{substring-after($exist:path, '/$shared/')}"/>
    </dispatch>
else
    (: everything else is passed through :)
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <cache-control cache="yes"/>
    </dispatch>
