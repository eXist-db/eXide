(:
 :  eXide REST API — Filesystem synchronization handler.
 :  Migrated from synchronize.xq.
 :)
xquery version "3.1";

module namespace sync="http://exist-db.org/apps/eXide/api/sync";

import module namespace roaster="http://e-editiones.org/roaster";

declare namespace expath="http://expath.org/ns/pkg";
declare namespace repo="http://exist-db.org/xquery/repo";
declare namespace git="http://exist-db.org/eXide/git";

(:~
 : POST /api/sync — Synchronize filesystem directory with database collection.
 :
 : Uses the eXist-specific file:sync() function if available. On systems where
 : only the EXPath File module is registered, returns an error.
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
        else if (not(sync:has-legacy-file-module())) then
            roaster:response(501, "application/json",
                map { "error": "Filesystem sync requires eXist-db's file:sync() function, which is not available on this server." })
        else
            try {
                (: Call file:sync() dynamically since it may not be in the
                   statically imported EXPath file module :)
                let $output := util:eval(``[
                    import module namespace file="http://exist-db.org/xquery/file"
                        at "java:org.exist.xquery.modules.file.FileModule";
                    file:sync("`{$collection}`", "`{$dir}`",
                        `{if (exists($after)) then '"' || $after || '"' else '()'}`)]``)
                return map {
                    "status": "ok",
                    "collection": $collection,
                    "dir": $dir,
                    "updated": count($output//*[local-name() = 'update']),
                    "files": array {
                        for $update in $output//*[local-name() = 'update']
                        return map {
                            "collection": string($update/@collection),
                            "name": string($update/@name)
                        }
                    }
                }
            } catch * {
                roaster:response(400, "application/json",
                    map { "error": $err:description })
            }
};

(:~
 : Check whether the legacy eXist-specific file module is available.
 :)
declare %private function sync:has-legacy-file-module() as xs:boolean {
    "http://exist-db.org/xquery/file" = util:registered-modules()
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
