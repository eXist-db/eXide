(:
 :  eXide REST API — Filesystem synchronization handler.
 :  Migrated from synchronize.xq.
 :)
xquery version "3.1";

module namespace sync="http://exist-db.org/apps/eXide/api/sync";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace file="http://exist-db.org/xquery/file"
    at "java:org.exist.xquery.modules.file.FileModule";

declare namespace expath="http://expath.org/ns/pkg";
declare namespace repo="http://exist-db.org/xquery/repo";
declare namespace git="http://exist-db.org/eXide/git";

(:~
 : POST /api/sync — Synchronize filesystem directory with database collection.
 :)
declare function sync:sync($request as map(*)) {
    let $body := $request?body
    let $collection := $body?collection
    let $dir := ($body?dir, sync:working-dir-from-descriptor($collection))[1]
    let $after :=
        if (exists($body?after) and $body?after ne "") then
            xs:dateTime($body?after)
        else ()
    let $indent := ($body?indent, true())[1]
    let $expand-xincludes := ($body?expandXincludes, false())[1]
    let $omit-xml-declaration := ($body?omitXmlDeclaration, true())[1]

    return
        if (empty($dir) or $dir = "") then
            roaster:response(400, "application/json",
                map { "error": "No working directory specified and none found in git.xml descriptor" })
        else
            try {
                let $sync-params := map {
                    "after": $after,
                    "indent": $indent,
                    "expand-xincludes": $expand-xincludes,
                    "omit-xml-declaration": $omit-xml-declaration
                }
                let $output := file:sync($collection, $dir, $sync-params)
                let $updates := $output//file:update
                return map {
                    "status": "ok",
                    "collection": $collection,
                    "dir": $dir,
                    "updated": count($updates),
                    "files": array {
                        for $update in $updates
                        return map {
                            "collection": string($update/@collection),
                            "name": string($update/@name),
                            "error": string($update/file:error)
                        }
                    }
                }
            } catch * {
                roaster:response(400, "application/json",
                    map { "error": $err:description })
            }
};

(: ── Internal helpers ─────────────────────────────────────── :)

declare %private function sync:working-dir-from-descriptor($collection as xs:string) as xs:string? {
    let $root := sync:get-app-root($collection)
    return
        if (exists($root)) then
            doc($root || "/git.xml")/git:git/git:workingDir/string()
        else ()
};

declare %private function sync:get-app-root($collection as xs:string) as xs:string? {
    if (not(starts-with($collection, "/"))) then ()
    else if (doc-available($collection || "/expath-pkg.xml")) then
        replace($collection, "/+$", "")
    else if (matches($collection, "^/db/+[^/]+")) then
        sync:get-app-root(replace($collection, "^(.*)/+[^/]+/*$", "$1"))
    else ()
};
