xquery version "3.1";


import module namespace config="http://exist-db.org/xquery/apps/config" at "config.xqm";
import module namespace templates="http://exist-db.org/xquery/templates";

(: The following modules provide functions which will be called by the templating :)
import module namespace site="http://exist-db.org/apps/site-utils";

declare option exist:serialize "method=html5 media-type=text/html";

let $config := map {
    $templates:CONFIG_APP_ROOT : $config:app-root,
    $templates:CONFIG_STOP_ON_ERROR : true()
}
let $lookup := function($functionName as xs:string, $arity as xs:int) {
    try {
        function-lookup(xs:QName($functionName), $arity)
    } catch * {
        ()
    }
}
let $content := request:get-data()
return
    templates:apply($content, $lookup, (), $config)