(:
 :  eXide REST API — Application shell handler.
 :
 :  Serves the eXide HTML through Roaster so access is gated by Roaster's
 :  authorization rather than the controller. When the current user is not
 :  allowed (e.g. a guest while restrictions/@guest = "no"), the app is refused
 :  and the request is redirected to the login page — the hard guest gate.
 :)
xquery version "3.1";

module namespace view="http://exist-db.org/apps/eXide/api/view";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace auth="http://exist-db.org/apps/eXide/api/auth" at "auth.xqm";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 : GET /index.html — the eXide application shell.
 :
 : Identity comes from `$request?user` (Roaster's standard-authorization). The
 : guest gate is config-driven (restrictions/@guest), so it can't be a static
 : x-constraint; the handler checks auth:is-allowed and, when the user is not
 : allowed, redirects to login.html instead of serving the app.
 :)
declare function view:index($request as map(*)) {
    if (auth:is-allowed($request?user?name)) then
        roaster:response(200, "text/html",
            view:render(doc(concat($config:app-root, "/index.html"))/html))
    else
        roaster:response(302, "text/html", (), map { "Location": "login.html" })
};

(:~
 : Inject the runtime configuration into the page head (mirrors the former
 : modules/view.xq), then serialize as HTML5.
 :)
declare %private function view:render($html as element(html)) as xs:string {
    let $conf := config:get-configuration()
    let $execAllowed := $conf/restrictions/@execute-query = "yes"
    let $guestAllowed := $conf/restrictions/@guest = "yes"
    let $page :=
        <html>
            <head>
                { $html/head/* }
                <script type="text/javascript">
                    eXide.namespace("eXide.configuration");
                    eXide.configuration.allowExecution = { $execAllowed };
                    eXide.configuration.allowGuest = { $guestAllowed };
                    eXide.configuration.context = "{ request:get-context-path() }";
                </script>
            </head>
            { $html/body }
        </html>
    return
        serialize($page, <output:serialization-parameters>
            <output:method>html5</output:method>
            <output:media-type>text/html</output:media-type>
        </output:serialization-parameters>)
};
