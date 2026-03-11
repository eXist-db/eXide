(:
 :  eXide REST API — Editor intelligence handlers.
 :  Migrated from funcdoc.xq, find.xq, outline.xq, validate-xml.xq.
 :)
xquery version "3.1";

module namespace editor="http://exist-db.org/apps/eXide/api/editor";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "../dbutils.xqm";

declare namespace expath="http://expath.org/ns/pkg";

(:~
 : GET /api/editor/completions — Autocomplete for functions, variables, modules.
 : Migrated from funcdoc.xq.
 :)
declare function editor:completions($request as map(*)) {
    let $q := $request?parameters?prefix
    let $signature := $request?parameters?signature
    let $base := $request?parameters?base
    let $sources := $request?parameters?source
    let $uris := $request?parameters?uri
    let $mprefixes := $request?parameters?mprefix

    let $sources := if ($sources instance of xs:string) then $sources else if (exists($sources)) then $sources?* else ()
    let $uris := if ($uris instance of xs:string) then $uris else if (exists($uris)) then $uris?* else ()
    let $mprefixes := if ($mprefixes instance of xs:string) then $mprefixes else if (exists($mprefixes)) then $mprefixes?* else ()

    return array {
        if ($q) then editor:get-built-in-functions($q) else (),
        if ($signature) then
            let $desc := editor:get-by-signature($signature)
            return
                if (exists($desc)) then $desc
                else editor:get-imported-functions($q, $signature, $base, $sources, $uris, $mprefixes)
        else
            editor:get-imported-functions($q, $signature, $base, $sources, $uris, $mprefixes)
    }
};

(:~
 : GET /api/editor/symbols — Document outline for imported modules.
 : Migrated from outline.xq.
 :)
declare function editor:symbols($request as map(*)) {
    let $uris := $request?parameters?uri
    let $sources := $request?parameters?source
    let $prefixes := $request?parameters?prefix
    let $bases := $request?parameters?base

    let $uris := if ($uris instance of xs:string) then $uris else if (exists($uris)) then $uris?* else ()
    let $sources := if ($sources instance of xs:string) then $sources else if (exists($sources)) then $sources?* else ()
    let $prefixes := if ($prefixes instance of xs:string) then $prefixes else if (exists($prefixes)) then $prefixes?* else ()
    let $bases := if ($bases instance of xs:string) then $bases else if (exists($bases)) then $bases?* else ()

    return array {
        for $uri at $i in $uris
        let $source := $sources[$i]
        let $prefix := $prefixes[$i]
        let $base := $bases[$i]
        let $module-source :=
            if (matches($source, "^(/|\w+:)")) then $source
            else if (exists($base)) then concat($base, "/", $source)
            else $source
        return
            try {
                let $module := inspect:inspect-module($module-source)
                return map {
                    "source": $module-source,
                    "prefix": $prefix,
                    "functions": array {
                        for $fn in $module/function[not(annotation/@name = "private")]
                        let $name := if (contains($fn/@name, ':'))
                            then substring-after($fn/@name, ':') else string($fn/@name)
                        return map {
                            "name": $prefix || ":" || $name,
                            "signature": editor:generate-signature($fn, $prefix, $name, false()),
                            "visibility": if ($fn/annotation/@name = "private") then "private" else "public"
                        }
                    },
                    "variables": array {
                        for $var in $module/variable[not(annotation/@name = "private")]
                        return $prefix || ":" || substring-after($var/@name, ":")
                    }
                }
            } catch * { () }
    }
};

(:~
 : GET /api/editor/modules — Module registry (built-in + user).
 : Migrated from find.xq.
 :)
declare function editor:modules($request as map(*)) {
    let $prefix := $request?parameters?prefix
    return array {
        for $uri in (util:registered-modules(), util:mapped-modules())
        let $module :=
            try { inspect:inspect-module-uri(xs:anyURI($uri)) } catch * { () }
        where exists($module) and
            (empty($prefix) or starts-with($module/@prefix, $prefix))
        order by $module/@prefix
        return map {
            "prefix": $module/@prefix/string(),
            "uri": $uri,
            "at": $module/@location/string()
        }
    }
};

(:~
 : POST /api/editor/validate — XML validation.
 : Migrated from validate-xml.xq.
 :)
declare function editor:validate($request as map(*)) {
    let $xml := $request?body
    let $validate := ($request?parameters?validate, true())[1]
    return
        try {
            let $parsed :=
                if ($validate) then
                    validation:jaxp-parse($xml, true(),
                        doc("/db/apps/eXide/resources/schema/catalog.xml"))
                else
                    parse-xml($xml)
            return map { "status": "valid" }
        } catch * {
            map {
                "status": "invalid",
                "errors": array {
                    map {
                        "line": $err:line-number,
                        "message": $err:description
                    }
                }
            }
        }
};

(:~
 : GET /api/editor/docs/{name} — Function documentation by name#arity.
 :)
declare function editor:docs($request as map(*)) {
    let $signature := $request?parameters?name
    let $result := editor:get-by-signature($signature)
    return
        if (exists($result)) then $result
        else roaster:response(404, "application/json",
            map { "error": "Function not found: " || $signature })
};


(:~
 : GET /api/editor/imports — Discover importable modules.
 : Migrated from atom-editor-support/module-import.xql.
 :
 : Returns modules available for import from two sources:
 : 1. Package-local: scans the XAR package containing the file for library modules
 : 2. Global: all registered and mapped modules in eXist-db
 : Already-imported namespace URIs (passed via `uri` parameter) are excluded.
 :)
declare function editor:imports($request as map(*)) {
    let $path := $request?parameters?path
    let $prefix := $request?parameters?prefix
    let $imported := $request?parameters?uri
    let $imported :=
        if ($imported instance of xs:string) then $imported
        else if (exists($imported)) then $imported?*
        else ()

    let $path :=
        if (starts-with($path, "xmldb:exist://")) then substring-after($path, "xmldb:exist://")
        else $path

    (: Find the package root for this file :)
    let $pkg-root := editor:get-package-root($path)
    let $scan-root := if (exists($pkg-root)) then $pkg-root else $path

    (: Package-local modules :)
    let $local-modules := editor:sort-modules(
        dbutil:find-by-mimetype($scan-root, "application/xquery", function($script) {
            for $info in editor:get-module-info($script)
            return
                if ($info?namespace = $imported) then ()
                else if (empty($prefix) or $info?prefix = $prefix) then $info
                else ()
        })
    )

    (: Global registered/mapped modules :)
    let $global-modules := editor:sort-modules(
        for $uri in (util:registered-modules(), util:mapped-modules())
        where not($uri = $imported)
        return
            try {
                let $module := inspect:inspect-module-uri(xs:anyURI($uri))
                return
                    if (empty($prefix) or $module/@prefix = $prefix) then
                        map {
                            "prefix": string($module/@prefix),
                            "namespace": string($module/@uri),
                            "source": string($module/@location),
                            "ref": "global"
                        }
                    else ()
            } catch * { () }
    )

    return array { $local-modules, $global-modules }
};


(: ── Internal helpers (migrated from funcdoc.xq) ─────────── :)

declare %private function editor:get-by-signature($signature as xs:string) {
    let $name := substring-before($signature, '#')
    let $arity := substring-after($signature, '#')
    let $prefix := substring-before($signature, ':')
    let $fn :=
        try {
            function-lookup(xs:QName(if ($prefix) then $name else 'fn:' || $name), xs:integer($arity))
        } catch * { () }
    return
        if (exists($fn)) then
            let $desc := inspect:inspect-function($fn)
            let $function-name :=
                if (contains($desc/@name, ':'))
                then substring-after($desc/@name, ':')
                else $desc/@name
            return editor:describe-function($desc, $prefix, $function-name, true(), '')
        else ()
};

declare %private function editor:get-built-in-functions($q as xs:string) {
    let $supplied-prefix := if (contains($q, ':')) then substring-before($q, ':') else ()
    let $name-fragment := if (contains($q, ':')) then substring-after($q, ':') else $q
    let $show-fn := exists($supplied-prefix) and $supplied-prefix eq 'fn'
    let $modules :=
        if ($supplied-prefix eq 'fn') then
            inspect:inspect-module-uri(xs:anyURI('http://www.w3.org/2005/xpath-functions'))
        else
            let $all := (util:registered-modules(), util:mapped-modules()) !
                (try { inspect:inspect-module-uri(xs:anyURI(.)) } catch * { () })
            return
                if ($supplied-prefix) then $all[starts-with(@prefix, $supplied-prefix)]
                else $all
    let $functions := $modules/function[not(annotation/@name = "private") and not(deprecated)]
    for $function in $functions
    let $function-name :=
        if (contains($function/@name, ':')) then substring-after($function/@name, ':')
        else $function/@name
    let $module-prefix := $function/parent::module/@prefix
    let $complete-name :=
        if ($show-fn) then ('fn:' || $function-name)
        else ($module-prefix || ':' || $function-name)
    where starts-with($complete-name, $name-fragment) or starts-with($function-name, $name-fragment)
    order by ($module-prefix, '')[1], lower-case($function-name)
    return editor:describe-function($function, $module-prefix, $function-name, $show-fn, $q)
};

declare %private function editor:get-imported-functions(
    $q as xs:string?,
    $signature as xs:string?,
    $base as xs:string?,
    $sources as xs:string*,
    $uris as xs:string*,
    $prefixes as xs:string*
) {
    let $supplied-prefix :=
        if (empty($signature)) then replace($q, "^\$?([^:]+):?.*$", "$1")
        else replace($signature, "^\$?([^:]+):?.*$", "$1")
    for $prefix at $i in $prefixes
    where matches($prefix, "^" || $supplied-prefix)
    let $source-url :=
        if (matches($sources[$i], "^(/|\w+:)")) then $sources[$i]
        else if (exists($base)) then concat($base, "/", $sources[$i])
        else $sources[$i]
    return
        try {
            let $module := inspect:inspect-module($source-url)
            return (
                if (not(starts-with($q, "$")) and not(starts-with($signature, "$"))) then
                    let $name-fragment := replace($q, "^\$?[^:]+:(.*)$", "$1")
                    for $fn in $module/function[not(annotation/@name = "private")]
                    let $fn-name := if (contains($fn/@name, ':')) then substring-after($fn/@name, ':') else string($fn/@name)
                    let $arity := count($fn/argument)
                    let $complete-name := concat($prefix, ":", $fn-name)
                    return
                        if ((empty($signature) or $signature = $complete-name || "#" || $arity) and
                            (empty($q) or matches($complete-name, "^" || $q || "|:" || $q)))
                        then map {
                            "text": editor:generate-signature($fn, $prefix, $fn-name, false()),
                            "name": string($fn/@name) || "#" || $arity,
                            "leftLabel": string($fn/returns/@type) || editor:cardinality($fn/returns/@cardinality),
                            "snippet": editor:generate-template($fn, $prefix, $fn-name, false()),
                            "type": "function",
                            "replacementPrefix": $q,
                            "description": $fn/description/string(),
                            "arguments": editor:describe-arguments($fn),
                            "path": $source-url
                        }
                        else ()
                else
                    let $sig := substring-after($signature, "$")
                    let $q2 := substring-after($q, "$")
                    for $var in $module/variable[not(annotation/@name = "private")]
                    let $var-name := concat($prefix, ":", substring-after($var/@name, ":"))
                    return
                        if ((not($sig) or $sig = $var-name) and
                            (not($q2) or matches($var-name, "^" || $q2 || "|:" || $q2)))
                        then map {
                            "text": "$" || $var-name,
                            "name": $var-name,
                            "replacementPrefix": "$" || $q2,
                            "type": "variable",
                            "path": $source-url,
                            "snippet": $var-name
                        }
                        else ()
            )
        } catch * { () }
};

declare %private function editor:describe-function($function, $prefix, $name, $show-fn, $q) {
    map {
        "text": editor:generate-signature($function, $prefix, $name, $show-fn),
        "snippet": editor:generate-template($function, $prefix, $name, $show-fn),
        "type": "function",
        "description": $function/description/string(),
        "arguments": editor:describe-arguments($function),
        "leftLabel": string($function/returns/@type) || editor:cardinality($function/returns/@cardinality),
        "replacementPrefix": $q
    }
};

declare %private function editor:describe-arguments($function) {
    array {
        for $arg in $function/argument
        return map {
            "name": $arg/@var/string(),
            "type": $arg/@type/string() || editor:cardinality($arg/@cardinality),
            "description": $arg/string()
        }
    }
};

declare %private function editor:generate-signature($function, $prefix, $name, $show-fn) {
    (if ($prefix ne '') then ($prefix || ":") else if ($show-fn) then "fn:" else ()) ||
    $name || "(" ||
    string-join(
        $function/argument ! ("$" || ./@var || " as " || ./@type || editor:cardinality(./@cardinality)),
        ", "
    ) || ")"
};

declare %private function editor:generate-template($function, $prefix, $name, $show-fn) {
    (if ($prefix ne '') then ($prefix || ":") else if ($show-fn) then "fn:" else ()) ||
    $name || "(" ||
    string-join(
        for $param at $p in $function/argument
        return "${" || $p || ":$" || $param/@var || "}",
        ", "
    ) || ")"
};

declare %private function editor:cardinality($c as xs:string) {
    switch ($c)
        case "zero or one" return "?"
        case "zero or more" return "*"
        case "one or more" return "+"
        default return ()
};


(: ── Internal helpers (migrated from module-import.xql) ──── :)

declare %private function editor:get-package-root($path as xs:string) as xs:string? {
    (for $pkg in collection(repo:get-root())/expath:package[starts-with($path, util:collection-name(.))]
     return util:collection-name($pkg))[1]
};

declare %private function editor:get-module-info($script as xs:anyURI) {
    let $data := util:binary-doc($script)
    let $source := util:base64-decode($data)
    where matches($source, "^module\s+namespace", "m")
    return
        let $match :=
            analyze-string($source, "^module\s+namespace\s+([^\s=]+)\s*=\s*['""]([^'""]+)['""]", "m")//fn:match
        return
            map {
                "prefix": $match/fn:group[1]/string(),
                "namespace": $match/fn:group[2]/string(),
                "source": string($script),
                "ref": "package"
            }
};

declare %private function editor:sort-modules($modules as map(*)*) {
    for $module in $modules
    order by $module?prefix, $module?namespace
    return $module
};
