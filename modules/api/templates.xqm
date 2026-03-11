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
    let $templates-col := $config:app-root || "/templates"
    return
        if (xmldb:collection-available($templates-col)) then
            let $files := xmldb:get-child-resources($templates-col)
            let $groups := map:merge(
                for $file in $files
                where not($file = "namespaces.json")
                let $ext := replace($file, "^.*\.", "")
                let $lang :=
                    switch ($ext)
                        case "xq" case "xql" case "xqm" return "xquery"
                        case "xml" return "xml"
                        case "html" return "html"
                        case "css" return "css"
                        case "js" return "javascript"
                        default return $ext
                let $name := replace($file, "\.[^.]+$", "")
                group by $lang
                return map:entry($lang, array {
                    for $n at $i in $name
                    return map { "name": $n[$i], "file": $file[$i] }
                })
            )
            return $groups
        else
            map {}
};

(:~
 : GET /api/templates/{name} — Retrieve template source code.
 :)
declare function templates:get($request as map(*)) {
    let $name := $request?parameters?name
    let $templates-col := $config:app-root || "/templates"
    (: Try common extensions :)
    let $candidates := ($name, $name || ".xq", $name || ".xml", $name || ".html",
                        $name || ".css", $name || ".js", $name || ".xql", $name || ".xqm")
    let $found :=
        for $candidate in $candidates
        where util:binary-doc-available($templates-col || "/" || $candidate)
        return $candidate
    return
        if (exists($found)) then
            let $path := $templates-col || "/" || $found[1]
            return roaster:response(200, "text/plain",
                util:binary-to-string(util:binary-doc($path)))
        else
            roaster:response(404, "application/json",
                map { "error": "Template not found: " || $name })
};
