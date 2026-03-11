(:
 :  eXide REST API — Database resource handlers.
 :  Migrated from collections.xq, load.xq, store.xq.
 :)
xquery version "3.1";

module namespace db="http://exist-db.org/apps/eXide/api/db";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "../dbutils.xqm";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 : GET /api/db/{path} — Browse collection or load document.
 :)
declare function db:get($request as map(*)) {
    let $path := "/" || $request?parameters?path
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
 : PUT /api/db/{path} — Create or update document.
 :)
declare function db:put($request as map(*)) {
    let $path := "/" || $request?parameters?path
    let $data := $request?body
    let $collection := replace($path, "/[^/]+$", "")
    let $resource := replace($path, "^.*/", "")
    return
        try {
            let $stored := xmldb:store($collection, $resource, $data)
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
 : POST /api/db/{path} — Create subcollection or batch operations.
 : Body: { "action": "create" | "copy" | "move" | "rename", ... }
 :)
declare function db:post($request as map(*)) {
    let $path := "/" || $request?parameters?path
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
                    for $source in $sources
                    let $name := replace($source, "^.*/", "")
                    return xmldb:copy-resource(
                        replace($source, "/[^/]+$", ""), $name, $path, $name)
                    ,
                    map { "status": "ok" }
                } catch * {
                    roaster:response(400, "application/json",
                        map { "error": $err:description })
                }
            case "move" return
                try {
                    let $sources := $body?sources?*
                    for $source in $sources
                    let $name := replace($source, "^.*/", "")
                    let $src-col := replace($source, "/[^/]+$", "")
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
 : DELETE /api/db/{path} — Delete resource or collection.
 :)
declare function db:delete($request as map(*)) {
    let $path := "/" || $request?parameters?path
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
 : PATCH /api/db/{path} — Modify permissions, owner, group, MIME type.
 : Body: { "owner": "...", "group": "...", "mode": "rwxr-x---", "mime": "..." }
 :)
declare function db:patch($request as map(*)) {
    let $path := "/" || $request?parameters?path
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


(: ── Internal helpers ─────────────────────────────────────── :)

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
        return map {
            "name": $child,
            "isCollection": true(),
            "path": $path || "/" || $child,
            "writable": sm:has-access(xs:anyURI($path || "/" || $child), "w")
        },
        for $res in $resources
        where empty($filter) or contains($res, $filter)
        order by lower-case($res)
        return
            let $res-path := $path || "/" || $res
            return map {
                "name": $res,
                "isCollection": false(),
                "path": $res-path,
                "mime": xmldb:get-mime-type($res-path),
                "writable": sm:has-access(xs:anyURI($res-path), "w"),
                "lastModified": string(xmldb:last-modified($path, $res))
            }
    )
    let $total := count($all-items)
    return map {
        "path": $path,
        "total": $total,
        "start": $start,
        "count": $count,
        "writable": sm:has-access(xs:anyURI($path), "w"),
        "items": array { subsequence($all-items, $start, $count) }
    }
};

declare %private function db:load-document($path, $request, $user) {
    let $download := ($request?parameters?download, false())[1]
    let $mime := xmldb:get-mime-type($path)
    return
        if (not(sm:has-access(xs:anyURI($path), "r"))) then
            roaster:response(404, "application/json",
                map { "error": "Not found or no read access" })
        else if (util:binary-doc-available($path)) then
            if ($download) then
                roaster:response(200, $mime, util:binary-doc($path))
            else
                (: Return metadata for binary docs unless downloading :)
                map {
                    "path": $path,
                    "mime": $mime,
                    "binary": true(),
                    "size": xmldb:size(replace($path, "/[^/]+$", ""), replace($path, "^.*/", "")),
                    "lastModified": string(xmldb:last-modified(
                        replace($path, "/[^/]+$", ""), replace($path, "^.*/", "")))
                }
        else
            let $content := serialize(doc($path), <output:serialization-parameters>
                <output:method>xml</output:method>
                <output:indent>yes</output:indent>
                <output:omit-xml-declaration>yes</output:omit-xml-declaration>
            </output:serialization-parameters>)
            return
                if ($download) then
                    roaster:response(200, $mime, $content)
                else
                    map {
                        "path": $path,
                        "mime": $mime,
                        "binary": false(),
                        "content": $content,
                        "lastModified": string(xmldb:last-modified(
                            replace($path, "/[^/]+$", ""), replace($path, "^.*/", "")))
                    }
};
