(:
 :  eXide REST API — Database resource handlers.
 :  Migrated from collections.xq, load.xq, store.xq.
 :)
xquery version "3.1";

module namespace db="http://exist-db.org/apps/eXide/api/db";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "../dbutils.xqm";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

(: Handle difference between 4.x.x and 5.x.x releases of eXist :)
declare variable $db:copy-collection :=
    let $fnNew := function-lookup(xs:QName("xmldb:copy-collection"), 2)
    return
        if (exists($fnNew)) then $fnNew else function-lookup(xs:QName("xmldb:copy"), 2);

declare variable $db:copy-resource :=
    let $fnNew := function-lookup(xs:QName("xmldb:copy-resource"), 4)
    return
        if (exists($fnNew)) then $fnNew
        else
            let $fnOld := function-lookup(xs:QName("xmldb:copy"), 3)
            return function($sourceCol, $sourceName, $targetCol, $targetName) {
                $fnOld($sourceCol, $targetCol, $sourceName)
            };

(:~
 : GET /api/storage/{path} — Browse collection or load document.
 :)
declare function db:get($request as map(*)) {
    let $path := db:encode-path("/" || $request?parameters?path)
    let $user := (request:get-attribute("org.exist.login.user"), "guest")[1]
    return
        if (xmldb:collection-available($path)) then
            db:browse-collection($path, $request, $user)
        else if (doc-available($path) or util:binary-doc-available($path)) then
            db:load-document($path, $request, $user)
        else
            roaster:response(404, "application/json",
                map { "error": "Not found: " || $path })
};

(:~
 : PUT /api/storage/{path} — Create or update document.
 :)
declare function db:put($request as map(*)) {
    let $path := db:encode-path("/" || $request?parameters?path)
    let $data := $request?body
    let $collection := replace($path, "/[^/]+$", "")
    let $resource := replace($path, "^.*/", "")
    return
        try {
            let $stored := xs:anyURI(xmldb:store($collection, $resource, $data))
            (: Fix permissions for XQuery files :)
            let $mime := xmldb:get-mime-type($stored)
            let $_ :=
                if ($mime = "application/xquery") then
                    sm:chmod($stored, "rwxr-xr-x")
                else ()
            return map {
                "status": "ok",
                "path": $stored
            }
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};

(:~
 : POST /api/storage/{path} — Create subcollection or batch operations.
 : Body: { "action": "create" | "copy" | "move" | "rename", ... }
 :)
declare function db:post($request as map(*)) {
    let $path := db:encode-path("/" || $request?parameters?path)
    let $body := $request?body
    let $action := $body?action
    return
        switch ($action)
            case "create" return
                try {
                    let $name := $body?name
                    let $created := xmldb:create-collection($path, $name)
                    return map { "status": "ok", "path": $created }
                } catch * {
                    roaster:response(400, "application/json",
                        map { "error": $err:description })
                }
            case "copy" return
                try {
                    let $sources := $body?sources?*
                    let $_ :=
                        for $source in $sources
                        let $enc-source := db:encode-path($source)
                        return
                            if (xmldb:collection-available($enc-source)) then
                                $db:copy-collection($enc-source, $path)
                            else
                                let $name := replace($enc-source, "^.*/", "")
                                let $src-col := replace($enc-source, "/[^/]+$", "")
                                return $db:copy-resource($src-col, $name, $path, $name)
                    return map { "status": "ok" }
                } catch * {
                    roaster:response(400, "application/json",
                        map { "error": $err:description })
                }
            case "move" return
                try {
                    let $sources := $body?sources?*
                    for $source in $sources
                    let $enc-source := db:encode-path($source)
                    return
                        if (xmldb:collection-available($enc-source)) then
                            xmldb:move($enc-source, $path)
                        else
                            let $name := replace($enc-source, "^.*/", "")
                            let $src-col := replace($enc-source, "/[^/]+$", "")
                            return xmldb:move($src-col, $path, $name)
                    ,
                    map { "status": "ok" }
                } catch * {
                    roaster:response(400, "application/json",
                        map { "error": $err:description })
                }
            case "rename" return
                try {
                    let $target := $body?target
                    return
                        if (xmldb:collection-available($path)) then (
                            xmldb:rename($path, $target),
                            map { "status": "ok" }
                        )
                        else
                            let $col := replace($path, "/[^/]+$", "")
                            let $name := replace($path, "^.*/", "")
                            return (
                                xmldb:rename($col, $name, $target),
                                map { "status": "ok" }
                            )
                } catch * {
                    roaster:response(400, "application/json",
                        map { "error": $err:description })
                }
            default return
                roaster:response(400, "application/json",
                    map { "error": "Unknown action: " || $action })
};

(:~
 : DELETE /api/storage/{path} — Delete resource or collection.
 :)
declare function db:delete($request as map(*)) {
    let $path := db:encode-path("/" || $request?parameters?path)
    return
        try {
            if (xmldb:collection-available($path)) then (
                xmldb:remove($path),
                map { "status": "ok" }
            )
            else
                let $col := replace($path, "/[^/]+$", "")
                let $name := replace($path, "^.*/", "")
                return (
                    xmldb:remove($col, $name),
                    map { "status": "ok" }
                )
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};

(:~
 : PATCH /api/storage/{path} — Modify permissions, owner, group, MIME type.
 : Body: { "owner": "...", "group": "...", "mode": "rwxr-x---", "mime": "..." }
 :)
declare function db:patch($request as map(*)) {
    let $path := db:encode-path("/" || $request?parameters?path)
    let $body := $request?body
    return
        try {
            if (exists($body?owner)) then sm:chown($path, $body?owner) else (),
            if (exists($body?group)) then sm:chgrp($path, $body?group) else (),
            if (exists($body?mode)) then sm:chmod($path, $body?mode) else (),
            if (exists($body?mime)) then xmldb:set-mime-type($path, $body?mime) else (),
            map { "status": "ok" }
        } catch * {
            roaster:response(403, "application/json",
                map { "error": $err:description })
        }
};


(:~
 : Encode each segment of a path for eXist-db internal use.
 : Converts /db/AéB → /db/A%C3%A9B while preserving path separators.
 :)
declare %private function db:encode-path($path as xs:string) as xs:string {
    string-join(
        for $segment in tokenize($path, "/")
        return
            if ($segment = "") then ""
            else xmldb:encode($segment),
        "/"
    )
};

(: ── Internal helpers ─────────────────────────────────────── :)

(: A degraded child entry for a collection/resource whose metadata can't be read
   — typically guest hitting sm:get-permissions() on an unreadable sibling such as
   /db/system/security (rwxrwx---). Carries the fields known without reading the
   child's permissions, plus accessible=false and the error, so one locked child
   can't 500 the whole listing. Mirrors existdb-openapi#72's inaccessible-entry. :)
declare %private function db:inaccessible-entry($name, $is-collection, $path, $error) {
    map {
        "name": $name,
        "isCollection": $is-collection,
        "path": $path,
        "accessible": false(),
        "error": $error
    }
};

declare %private function db:browse-collection($path, $request, $user) {
    let $start := ($request?parameters?start, 1)[1]
    let $count := ($request?parameters?count, 50)[1]
    let $filter := $request?parameters?filter
    let $children := xmldb:get-child-collections($path)
    let $resources := xmldb:get-child-resources($path)
    let $all-items := (
        for $child in $children
        where empty($filter) or contains($child, $filter)
        order by lower-case($child)
        return
            let $child-path := $path || "/" || $child
            let $child-uri := xs:anyURI($child-path)
            let $name := xmldb:decode-uri(xs:anyURI($child))
            let $disp-path := xmldb:decode-uri(xs:anyURI($child-path))
            return
                try {
                    map {
                        "name": $name,
                        "isCollection": true(),
                        "path": $disp-path,
                        "accessible": sm:has-access($child-uri, "r"),
                        "writable": sm:has-access($child-uri, "w"),
                        "permissions": sm:get-permissions($child-uri)/sm:permission/string(@mode),
                        "owner": sm:get-permissions($child-uri)/sm:permission/string(@owner),
                        "group": sm:get-permissions($child-uri)/sm:permission/string(@group)
                    }
                } catch * {
                    db:inaccessible-entry($name, true(), $disp-path, $err:description)
                },
        for $res in $resources
        where empty($filter) or contains($res, $filter)
        order by lower-case($res)
        return
            let $res-path := $path || "/" || $res
            let $res-uri := xs:anyURI($res-path)
            let $name := xmldb:decode-uri(xs:anyURI($res))
            let $disp-path := xmldb:decode-uri(xs:anyURI($res-path))
            return
                try {
                    map {
                        "name": $name,
                        "isCollection": false(),
                        "path": $disp-path,
                        "mime": xmldb:get-mime-type($res-path),
                        "accessible": sm:has-access($res-uri, "r"),
                        "writable": sm:has-access($res-uri, "w"),
                        "lastModified": string(xmldb:last-modified($path, $res)),
                        "permissions": sm:get-permissions($res-uri)/sm:permission/string(@mode),
                        "owner": sm:get-permissions($res-uri)/sm:permission/string(@owner),
                        "group": sm:get-permissions($res-uri)/sm:permission/string(@group)
                    }
                } catch * {
                    db:inaccessible-entry($name, false(), $disp-path, $err:description)
                }
    )
    let $total := count($all-items)
    let $path-uri := xs:anyURI($path)
    return map {
        "path": $path,
        "total": $total,
        "start": $start,
        "count": $count,
        "writable": sm:has-access($path-uri, "w"),
        "permissions": sm:get-permissions($path-uri)/sm:permission/string(@mode),
        "owner": sm:get-permissions($path-uri)/sm:permission/string(@owner),
        "group": sm:get-permissions($path-uri)/sm:permission/string(@group),
        "items": array { subsequence($all-items, $start, $count) }
    }
};

declare %private function db:get-run-path($path) {
    let $appRoot := repo:get-root()
    return
        replace(
            if (starts-with($path, $appRoot)) then
                request:get-context-path() || "/" || request:get-attribute("$exist:prefix") || "/" ||
                substring-after($path, $appRoot)
            else
                request:get-context-path() || "/rest" || $path,
            "/{2,}", "/"
        )
};

declare %private function db:load-document($path, $request, $user) {
    let $download := ($request?parameters?download, false())[1]
    let $indent := ($request?parameters?indent, "true")[1] = "true"
    let $expand-xincludes := ($request?parameters?("expand-xincludes"), "false")[1] = "true"
    let $omit-xml-decl := ($request?parameters?("omit-xml-decl"), "true")[1] = "true"
    let $mime := xmldb:get-mime-type($path)
    let $externalPath := db:get-run-path($path)
    return
        if (not(sm:has-access(xs:anyURI($path), "r"))) then
            roaster:response(404, "application/json",
                map { "error": "Not found or no read access" })
        else if (util:binary-doc-available($path)) then
            if ($download) then
                roaster:response(200, $mime, util:binary-doc($path))
            else
                let $uri := xs:anyURI($path)
                (: Text-based binary types: include content for editor :)
                let $is-text := matches($mime, "^(text/|application/(xquery|javascript|json|xml|xslt\+xml|xsl-fo|css|less))")
                let $content :=
                    if ($is-text) then
                        try { util:binary-to-string(util:binary-doc($path)) }
                        catch * { () }
                    else ()
                return map:merge((
                    map {
                        "path": $path,
                        "mime": $mime,
                        "binary": true(),
                        "externalPath": $externalPath,
                        "size": xmldb:size(replace($path, "/[^/]+$", ""), replace($path, "^.*/", "")),
                        "lastModified": string(xmldb:last-modified(
                            replace($path, "/[^/]+$", ""), replace($path, "^.*/", ""))),
                        "permissions": sm:get-permissions($uri)/sm:permission/string(@mode),
                        "owner": sm:get-permissions($uri)/sm:permission/string(@owner),
                        "group": sm:get-permissions($uri)/sm:permission/string(@group)
                    },
                    if ($content) then map { "content": $content } else ()
                ))
        else
            let $content := serialize(doc($path), map {
                "method": "xml",
                "indent": $indent,
                "omit-xml-declaration": $omit-xml-decl,
                QName("http://exist.sourceforge.net/NS/exist", "expand-xincludes"): $expand-xincludes
            })
            return
                if ($download) then
                    roaster:response(200, $mime, $content)
                else
                    let $uri := xs:anyURI($path)
                    return map {
                        "path": $path,
                        "mime": $mime,
                        "binary": false(),
                        "externalPath": $externalPath,
                        "content": $content,
                        "lastModified": string(xmldb:last-modified(
                            replace($path, "/[^/]+$", ""), replace($path, "^.*/", ""))),
                        "permissions": sm:get-permissions($uri)/sm:permission/string(@mode),
                        "owner": sm:get-permissions($uri)/sm:permission/string(@owner),
                        "group": sm:get-permissions($uri)/sm:permission/string(@group)
                    }
};
