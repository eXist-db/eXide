xquery version "3.1";

import module namespace config="http://exist-db.org/xquery/apps/config" at "modules/config.xqm";

declare namespace json="http://www.json.org";
declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";
declare namespace sm="http://exist-db.org/xquery/securitymanager";

declare variable $exist:path external;
declare variable $exist:resource external;
declare variable $exist:prefix external;
declare variable $exist:controller external;

declare variable $local:config := config:get-configuration();
declare variable $local:method := request:get-method() => lower-case();
declare variable $local:uri := request:get-uri();
declare variable $local:forwarded-for := request:get-header("X-Forwarded-URI");

(:~
 : Authentication and login are handled entirely by Roaster on the /api/* routes
 : (see modules/api/auth.xqm) — the controller carries no login logic. It still
 : derives the current identity from sm:id() to authorize the one privileged
 : non-Roaster route it serves, /execute.
 :)
declare function local:current-user() as xs:string? {
    let $name := sm:id()//sm:real/sm:username/string()
    return if (empty($name) or $name = "") then () else $name
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

(: public :)

if ($exist:path eq '') then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <redirect url="{$local:uri}/"/>
    </dispatch>

else if ($exist:path eq '/') then
    let $path :=
        if (
            lower-case($local:uri) = "/exist/apps/exide/" and
            lower-case($local:forwarded-for) = "/apps/exide/"
        )
        then "/apps/eXide/"
        else ""
    return
        <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
            <redirect url="{$path}index.html"/>
        </dispatch>

else if ($local:method = 'get' and $exist:resource = "backdrop.svg") then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="resources/images/backdrop.svg">
            <set-header name="Cache-Control" value="max-age=73600; must-revalidate;"/>
        </forward>
    </dispatch>

(: REST API — all /api/* requests are handled by Roaster, including authentication. :)
else if (starts-with($exist:path, "/api/")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="{$exist:controller}/modules/api/router.xq"/>
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
    let $user := local:current-user()
    let $user-is-dba := sm:is-dba(($user, 'nobody')[1])
    let $xquery-execution-allowed := local:query-execution-allowed($user, $user-is-dba)
    let $query := request:get-parameter("qu", ())
    let $base := request:get-parameter("base", ())
    let $output := request:get-parameter("output", "xml")
    let $startTime := util:system-time()
    return
        if (not($xquery-execution-allowed)) then (
            response:set-status-code(403),
            response:set-header("Content-Type", "application/json; charset=UTF-8"),
            util:declare-option("exist:serialize", "method=json media-type=application/json"),
            <status><error>Query execution is not permitted for this user.</error></status>
        )
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

(: Block abandoned/non-functional modules :)
else if ($exist:resource = ("debuger.xq", "git.xq")) then (
    response:set-status-code(410),
    <gone>{ $exist:resource } is no longer available.</gone>
)

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
