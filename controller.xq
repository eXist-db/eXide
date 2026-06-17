xquery version "3.1";

declare variable $exist:path external;
declare variable $exist:resource external;
declare variable $exist:prefix external;
declare variable $exist:controller external;

declare variable $local:method := request:get-method() => lower-case();
declare variable $local:uri := request:get-uri();
declare variable $local:forwarded-for := request:get-header("X-Forwarded-URI");

(: Authentication, login, and authorization are handled entirely by Roaster — on
 : the /api/* routes and on the app-shell route (view:index serves index.html and
 : enforces the guest gate). The controller carries no auth logic; it routes those
 : requests to Roaster and otherwise serves static resources. :)

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

(: REST API and the app shell are handled by Roaster (router.xq), including
 : authentication and the guest gate. :)
else if (starts-with($exist:path, "/api/") or ($local:method = 'get' and $exist:resource = "index.html")) then
    <dispatch xmlns="http://exist.sourceforge.net/NS/exist">
        <forward url="{$exist:controller}/modules/api/router.xq"/>
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
