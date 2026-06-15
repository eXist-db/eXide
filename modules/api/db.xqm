(:
 :  eXide REST API — Database resource handlers.
 :
 :  Thin ADAPTER over existdb-openapi's roaster-independent db-core module: the
 :  /api/storage surface and eXide's response shapes are kept identical (the
 :  frontend is untouched), but all resource CRUD + naming correctness is
 :  delegated in-process to db-core (imported by namespace; existdb-openapi is a
 :  declared dependency). No HTTP hop, no re-auth — db-core runs as the current
 :  request user. This makes existdb-openapi the single audited implementation of
 :  db resource handling; eXide stops carrying its own xmldb:store/doc()/encode
 :  logic.
 :
 :  What stays eXide-side for now (progressively migrating as db-core grows):
 :   - binary load + ?download raw streaming (db-core's binary handling is cruder;
 :     full transport is existdb-openapi#38, the Roaster streaming track);
 :   - externalPath, computed eXide's way (context-path aware). db-core no longer
 :     returns a runPath; the executable URL is client-derived, and eXide keeps its
 :     own context-path-aware computation rather than the generic /exist form.
 :
 :  Naming convention: this adapter speaks DECODED paths to db-core, which applies
 :  fn:iri-to-uri internally — so it adopts existdb-openapi's resource-naming
 :  convention (sub-delims left literal, e.g. it's.xml) rather than eXide's former
 :  full-encode (it%27s.xml). The cutover of this convention is gated on the
 :  resource-naming contract decision.
 :)
xquery version "3.1";

module namespace db="http://exist-db.org/apps/eXide/api/db";

import module namespace roaster="http://e-editiones.org/roaster";
(: db-core: imported by namespace — existdb-openapi is a declared dependency
 : (expath-pkg.xml) and registers db-core as a public XQuery module. :)
import module namespace dbc="http://exist-db.org/api/db-core";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";
declare namespace sm="http://exist-db.org/xquery/securitymanager";
declare namespace response="http://exist-db.org/xquery/response";

(:~
 : Map a typed db-core error to an eXide HTTP response. db-core signals failures
 : as typed errors in http://exist-db.org/api/db-core/error; the local-name picks
 : the status, $err:description becomes the message, $err:value (a map) adds any
 : extra fields (move/copy partial-state hints). Unknown codes fall through to 500.
 :)
declare %private function db:error-response(
    $code as xs:QName, $description as xs:string?, $value as item()*
) {
    let $status :=
        (map {
            "bad-request": 400,
            "forbidden": 403,
            "not-found": 404,
            "conflict": 409,
            "server-error": 500
        }(local-name-from-QName($code)), 500)[1]
    let $extra := if ($value instance of map(*)) then $value else map {}
    return roaster:response($status, "application/json",
        map:merge((map { "error": $description }, $extra)))
};

(:~ The decoded wire path for a {path} route parameter. :)
declare %private function db:wire($request as map(*)) as xs:string {
    "/" || $request?parameters?path
};

(:~
 : GET /api/storage/{path} — Browse collection or load document.
 :)
declare function db:get($request as map(*)) {
    let $wire := db:wire($request)
    let $stored := dbc:to-stored($wire)
    return
        try {
            if (xmldb:collection-available($stored)) then
                db:browse($wire, $request)
            else if (doc-available($stored) or util:binary-doc-available($stored)) then
                db:load($wire, $stored, $request)
            else
                roaster:response(404, "application/json",
                    map { "error": "Not found: " || dbc:to-display($stored) })
        } catch * {
            db:error-response($err:code, $err:description, $err:value)
        }
};

(:~
 : PUT /api/storage/{path} — Create or update document. Body is the raw content.
 :)
declare function db:put($request as map(*)) {
    try {
        (: mime omitted -> db-core lets eXist infer from the name (3-arg xmldb:store) :)
        let $r := dbc:store(db:wire($request), $request?body, ())
        return map { "status": "ok", "path": $r?stored }
    } catch * {
        db:error-response($err:code, $err:description, $err:value)
    }
};

(:~
 : POST /api/storage/{path} — Create subcollection or batch copy/move/rename.
 : Body: { "action": "create" | "copy" | "move" | "rename", … }
 :)
declare function db:post($request as map(*)) {
    let $wire := db:wire($request)
    let $body := $request?body
    let $action := $body?action
    return
        try {
            switch ($action)
                case "create" return
                    let $r := dbc:create-collection($wire || "/" || $body?name)
                    return map { "status": "ok", "path": $r?created }
                case "copy" return
                    let $_ :=
                        for $source in $body?sources?*
                        return dbc:copy(map { "source": $source, "parent": $wire })
                    return map { "status": "ok" }
                case "move" return
                    let $_ :=
                        for $source in $body?sources?*
                        return dbc:move(map { "source": $source, "parent": $wire })
                    return map { "status": "ok" }
                case "rename" return
                    let $_ := dbc:move(map { "source": $wire, "newName": $body?target })
                    return map { "status": "ok" }
                default return
                    roaster:response(400, "application/json",
                        map { "error": "Unknown action: " || $action })
        } catch * {
            db:error-response($err:code, $err:description, $err:value)
        }
};

(:~
 : DELETE /api/storage/{path} — Delete resource or collection.
 :)
declare function db:delete($request as map(*)) {
    try {
        let $wire := db:wire($request)
        let $stored := dbc:to-stored($wire)
        let $_ :=
            if (xmldb:collection-available($stored))
            (: force=true mirrors eXide's recursive delete; db-core also guards the
             : protected paths (/db, /db/apps, /db/system) with a 403. :)
            then dbc:remove-collection($wire, true())
            else dbc:remove-resource($wire)
        return map { "status": "ok" }
    } catch * {
        db:error-response($err:code, $err:description, $err:value)
    }
};

(:~
 : PATCH /api/storage/{path} — Modify permissions, owner, group, MIME type.
 : Body: { "owner": …, "group": …, "mode": "rwxr-x---", "mime": … }
 : db-core classifies failures: chown/chgrp/chmod -> 403, set-mime -> 400.
 :)
declare function db:patch($request as map(*)) {
    try {
        let $body := $request?body
        let $_ := dbc:set-permissions(map {
            "path": db:wire($request),
            "owner": $body?owner,
            "group": $body?group,
            "mode": $body?mode,
            "mime": $body?mime
        })
        return map { "status": "ok" }
    } catch * {
        db:error-response($err:code, $err:description, $err:value)
    }
};

(: ── Internal helpers ─────────────────────────────────────── :)

(:~
 : Browse a collection: db-core:list -> eXide's browse envelope/items shape.
 : db-core does the pagination (start/count) and per-item writable; the adapter
 : remaps key names (mode->permissions, children->items, type->isCollection,
 : modified->lastModified, mime-type->mime). eXide's default page size is 50.
 :)
declare %private function db:browse($wire as xs:string, $request as map(*)) as map(*) {
    let $r := dbc:list($wire, map {
        "recursive": false(),
        "depth": 0,
        "collections-only": false(),
        "start": ($request?parameters?start, 1)[1],
        "count": ($request?parameters?count, 50)[1]
    })
    return map {
        "path": $r?path,
        "total": $r?total,
        "start": $r?start,
        "count": $r?count,
        "writable": $r?writable,
        "permissions": $r?mode,
        "owner": $r?owner,
        "group": $r?group,
        "items": array { for $c in $r?children?* return db:to-exide-item($c) }
    }
};

declare %private function db:to-exide-item($c as map(*)) as map(*) {
    let $base := map {
        "name": $c?name,
        "isCollection": $c?type eq "collection",
        "path": $c?path,
        "writable": $c?writable,
        "permissions": $c?mode,
        "owner": $c?owner,
        "group": $c?group
    }
    return
        if ($c?type eq "collection")
        then $base
        else map:merge(($base, map {
            "mime": $c?("mime-type"),
            "lastModified": $c?modified
        }))
};

(:~
 : Load a document. XML (non-download) delegates to db-core:get-resource for the
 : serialized content (method/indent/omit-xml-declaration via #48, folded into
 : db-core) and to db-core:properties for owner/perms/timestamps — the
 : consolidated db-core (existdb-openapi#59) no longer bundles metadata in
 : get-resource, which returns just { path, binary, content, mime-type }. Binary
 : load and ?download raw streaming stay eXide-side until existdb-openapi#38's
 : Roaster transport lands. externalPath is computed eXide's way (context-path
 : aware); db-core no longer returns a runPath.
 :
 : eXide's serialization param names are translated to db-core's: omit-xml-decl
 : -> omit-xml-declaration. expand-xincludes is intentionally not forwarded — it
 : cannot be honored for node-to-string serialization in eXist 7.0.0-beta3
 : (eXist-db/exist#3446); db-core omits it rather than give a false guarantee.
 :)
declare %private function db:load($wire as xs:string, $stored as xs:string, $request as map(*)) {
    let $download := ($request?parameters?download, false())[1]
    let $mime := xmldb:get-mime-type(xs:anyURI($stored))
    return
        if (not(sm:has-access(xs:anyURI($stored), "r"))) then
            roaster:response(404, "application/json",
                map { "error": "Not found or no read access" })
        else if ($download) then
            (: Download streams raw bytes with response:stream-binary — the path
               roaster's own test app uses. roaster:response(…) would run the value
               through the serializer: for a binary value it emits base64 TEXT
               (corrupting the file), and for a serialized-XML STRING under an xml
               mime it escapes the angle brackets a second time. So in both cases we
               stream bytes: binary docs directly, XML/text via db-core's serialized
               string (which honors indent/omit-xml-decl) converted to bytes. :)
            if (util:binary-doc-available($stored)) then
                util:binary-doc($stored) => response:stream-binary($mime, ())
            else
                let $r := dbc:get-resource($wire, db:ser-opts($request))
                return util:string-to-binary($r?content) => response:stream-binary($mime, ())
        else if (util:binary-doc-available($stored)) then
            db:load-binary($stored, $mime)
        else
            let $r := dbc:get-resource($wire, db:ser-opts($request))
            let $props := dbc:properties($wire)
            return map {
                "path": $r?path,
                "mime": $r?("mime-type"),
                "binary": false(),
                "externalPath": db:get-run-path($stored),
                "content": $r?content,
                "lastModified": $props?("last-modified"),
                "permissions": $props?mode,
                "owner": $props?owner,
                "group": $props?group
            }
};

(:~ db-core serialization options translated from eXide's request parameters. :)
declare %private function db:ser-opts($request as map(*)) as map(*) {
    map:merge((
        if (exists($request?parameters?indent))
            then map { "indent": $request?parameters?indent } else (),
        if (exists($request?parameters?("omit-xml-decl")))
            then map { "omit-xml-declaration": $request?parameters?("omit-xml-decl") } else ()
    ))
};

(:~
 : Binary load (non-download): include decoded content only for text-based binary
 : types (matching eXide's editor behavior); never base64-decode true binaries.
 : Stays eXide-side until db-core gains real binary transport (#38).
 :)
declare %private function db:load-binary($stored as xs:string, $mime as xs:string) as map(*) {
    let $uri := xs:anyURI($stored)
    let $collection := replace($stored, "/[^/]+$", "")
    let $resource := replace($stored, "^.*/", "")
    let $is-text := matches($mime, "^(text/|application/(xquery|javascript|json|xml|xslt\+xml|xsl-fo|css|less))")
    let $content :=
        if ($is-text)
        then try { util:binary-to-string(util:binary-doc($stored)) } catch * { () }
        else ()
    return map:merge((
        map {
            "path": dbc:to-display($stored),
            "mime": $mime,
            "binary": true(),
            "externalPath": db:get-run-path($stored),
            "size": xmldb:size($collection, $resource),
            "lastModified": string(xmldb:last-modified($collection, $resource)),
            "permissions": sm:get-permissions($uri)/sm:permission/string(@mode),
            "owner": sm:get-permissions($uri)/sm:permission/string(@owner),
            "group": sm:get-permissions($uri)/sm:permission/string(@group)
        },
        if ($content) then map { "content": $content } else ()
    ))
};

(:~
 : Run path (URL to execute a stored resource) — eXide's context-path-aware
 : computation, kept rather than db-core's hardcoded /exist form.
 :)
declare %private function db:get-run-path($path as xs:string) as xs:string {
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
