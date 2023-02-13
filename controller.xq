xquery version "3.1";

import module namespace login="http://exist-db.org/xquery/login"
  at "resource:org/exist/xquery/modules/persistentlogin/login.xql";
import module namespace config="http://exist-db.org/xquery/apps/config" at "modules/config.xqm";

declare namespace json="http://www.json.org";
declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";

declare variable $exist:path external;
declare variable $exist:resource external;
declare variable $exist:prefix external;
declare variable $exist:controller external;

declare variable $local:login-domain := 'org.exist.login';
declare variable $local:config := config:get-configuration();
declare variable $local:method := request:get-method() => lower-case();
declare variable $local:uri := request:get-uri();
declare variable $local:forwarded-for := request:get-header("X-Forwarded-URI");
declare variable $local:wants-json := tokenize(request:get-header('Accept'), ', ?') = 'application/json';

declare function local:get-user () as xs:string? {
    let $login := login:set-user($local:login-domain, "P7D", false())
    let $user-id := request:get-attribute($local:login-domain || ".user")
    return $user-id
};

declare function local:user-allowed($user as xs:string?) as xs:boolean {
    $local:config/restrictions/@guest = "yes" or (
        not(empty($user)) and
        not($user = ('guest', 'nobody'))
    )
};

declare function local:query-execution-allowed($user as xs:string?, $is-dba as xs:boolean) as xs:boolean {
    $is-dba or (
        $local:config/restrictions/@execute-query = "yes" and
        local:user-allowed($user)
    )
};

let $user := local:get-user()
let $user-to-check := ($user, request:get-attribute("xquery.user"), 'nobody')[1]
let $user-is-dba := sm:is-dba($user-to-check)
let $user-allowed := local:user-allowed($user)
let $xquery-execution-allowed := local:query-execution-allowed($user, $user-is-dba)

(: let $_ := util:log('debug', map{
    'request': map {
        'method': $local:method,
        'forward': $local:forwarded-for,
        'uri': $local:uri
    },
    'exist': map {
        'resource': $exist:resource,
        'path': $exist:path,
        'prefix': $exist:prefix,
        'controller': $exist:controller
    },
    'user': map {
        'name': $user,
        'allowed': $user-allowed,
        'dba': $user-is-dba
    }
}) :)

return

(: public :)

if ($exist:path eq '') then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <redirect url="{$local:uri}/"/>
    </dispatch>

else if ($exist:path eq '/' and $user-allowed) then
    let $path := 
        if (
            lower-case($local:uri) = "/exist/apps/exide/" and 
            lower-case($local:forwarded-for) = "/apps/exide/"
        )
        then "/apps/eXide/"
        else ""
    
    let $resource := 
        if ($user-allowed)
        then "index.html"
        else "login.html"

    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <redirect url="{$path}{$resource}"/>
        </dispatch>

else if ($local:method = 'get' and $exist:resource = "login.html" and not($user-allowed)) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="login.html">
            <set-header name="Cache-Control" value="max-age=3600; must-revalidate;"/>
        </forward>
    </dispatch>
else if ($local:method = 'get' and $exist:resource = "backdrop.svg") then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="resources/images/backdrop.svg">
            <set-header name="Cache-Control" value="max-age=73600; must-revalidate;"/>
        </forward>
    </dispatch>

(:
 : Login a user via AJAX. Just returns a 401 if login fails.
 :)
else if (
    $local:wants-json and
    $local:method = ('post') and
    $exist:resource = 'login' and
    $user-allowed
)
then (
    util:declare-option("output:method", "json"),
    <status>
        <user>{$user}</user>
        <isAdmin json:literal="true">{$user-is-dba}</isAdmin>
    </status>
)

(: handle unauthorized request :)

else if (not($user-allowed))
then (
    if ($local:wants-json)
    then (
        util:declare-option("output:method", "json"),
        response:set-status-code(401),
        <status>
            <error>unauthorized</error>
        </status>
    )
    else
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <redirect method="get" url="login.html"/> <!-- maybe add additional parameters -->
        </dispatch>
)

(: restricted resources :)

else if ($local:method = ('get', 'post') and $exist:resource = ('login.html', 'login'))
then (
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <redirect url="index.html"/> <!-- maybe add additional parameters -->
    </dispatch>
)
else if (starts-with($exist:path, "/store/")) then
    let $resource := substring-after($exist:path, "/store")
    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <forward url="{$exist:controller}/modules/store.xq">
                <add-parameter name="path" value="{$resource}"/>
            </forward>
        </dispatch>

else if (starts-with($exist:path, "/check/")) then
    let $resource := substring-after($exist:path, "/validate")
    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <forward url="{$exist:controller}/modules/validate-xml.xq">
                <add-parameter name="validate" value="no"/>
            </forward>
        </dispatch>

else if ($local:method = 'get' and $exist:resource = "index.html") then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <view>
            <forward url="modules/view.xq">
                <set-header name="Cache-Control" value="max-age=3600"/>
            </forward>
        </view>
    </dispatch>

else if ($exist:resource eq 'execute') then
    let $query := request:get-parameter("qu", ())
    let $base := request:get-parameter("base", ())
    let $output := request:get-parameter("output", "xml")
    let $startTime := util:system-time()
    return
        if (not($xquery-execution-allowed)) then
            response:set-status-code(403)
        else
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
                            <forward url="modules/session.xq">
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
                            <set-header name="Cache-Control" value="no-cache"/>
                            <!-- Query is passed via the attribute 'xquery.source' -->
                            <set-attribute name="xquery.source" value="{$query}"/>
                	        <set-attribute name="xquery.module-load-path" value="{$base}"/>
                            <!-- Errors should be passed through instead of terminating the request -->
                            <set-attribute name="xquery.report-errors" value="yes"/>
                            <set-attribute name="start-time" value="{util:system-time()}"/>
                        </forward>
                    </dispatch>

(: Retrieve an item from the query results stored in the HTTP session. The
 : format of the URL will be /sandbox/results/X, where X is the number of the
 : item in the result set :)
else if ($local:method = 'get' and starts-with($exist:path, '/results/')) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="../modules/session.xq">
            <set-header name="Cache-Control" value="no-cache"/>
            <add-parameter name="num" value="{$exist:resource}"/>
        </forward>
    </dispatch>

else if ($local:method = 'get' and $exist:resource eq "outline") then
    let $query := request:get-parameter("qu", ())
    let $base := request:get-parameter("base", ())
	return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
	        <!-- Query is executed by XQueryServlet -->
            <forward url="modules/outline.xq">
                <set-header name="Cache-Control" value="no-cache"/>
	            <set-attribute name="xquery.module-load-path" value="{$base}"/>
            </forward>
    </dispatch>

else if ($exist:resource eq "debug") then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <!-- Query is executed by XQueryServlet -->
        <forward url="modules/debuger.xq">
            <set-header name="Cache-Control" value="no-cache"/>
        </forward>
    </dispatch>

else if (ends-with($exist:path, ".xq")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <set-header name="Cache-Control" value="no-cache"/>
        <set-attribute name="app-root" value="{$exist:prefix}{$exist:controller}"/>
    </dispatch>

else
    (: everything else is passed through :)
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <cache-control cache="yes"/>
    </dispatch>
