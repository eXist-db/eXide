(:
 :  eXide REST API — Template handlers.
 :  Migrated from get-template.xq.
 :)
xquery version "3.1";

module namespace templates="http://exist-db.org/apps/eXide/api/templates";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

(:~
 : GET /api/templates — Template catalog grouped by language.
 :)
declare function templates:list($request as map(*)) {
    let $doc-path := $config:app-root || "/templates/documents.xml"
    return
        if (doc-available($doc-path)) then
            let $templates := doc($doc-path)//template
            return map:merge(
                for $template in $templates
                let $mode := string($template/@mode)
                group by $mode
                return map:entry($mode, array {
                    for $t in $template
                    return map {
                        "name": string($t/@name),
                        "description": string($t/description)
                    }
                })
            )
        else
            map {}
};

(:~
 : GET /api/templates/{name} — Retrieve template source code.
 :)
declare function templates:get($request as map(*)) {
    let $name := $request?parameters?name
    let $doc-path := $config:app-root || "/templates/documents.xml"
    let $code :=
        if (doc-available($doc-path)) then
            let $text := doc($doc-path)//template[@name = $name]/code/text()
            return if ($text) then replace($text, "^\s+", "") else ()
        else ()
    return
        if ($code) then
            roaster:response(200, "text/plain", $code)
        else
            roaster:response(404, "application/json",
                map { "error": "Template not found: " || $name })
};
