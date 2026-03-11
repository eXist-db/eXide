(:
 :  eXide - web-based XQuery IDE
 :
 :  Copyright (C) 2011-13 Wolfgang Meier
 :
 :  This program is free software: you can redistribute it and/or modify
 :  it under the terms of the GNU General Public License as published by
 :  the Free Software Foundation, either version 3 of the License, or
 :  (at your option) any later version.
 :
 :  This program is distributed in the hope that it will be useful,
 :  but WITHOUT ANY WARRANTY; without even the implied warranty of
 :  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 :  GNU General Public License for more details.
 :
 :  You should have received a copy of the GNU General Public License
 :  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 :)

(:~
 : Function documentation and autocomplete endpoint.
 :
 : Adapted from exist-db/atom-editor-support's atom-autocomplete.xql
 : (Wolfgang Meier, Joe Wicentowski). Returns structured JSON with
 : per-argument descriptions, return types, and snippet templates —
 : richer than the older docs.xq which pre-rendered HTML blobs.
 :
 : Supports:
 :   - Built-in function lookup by prefix
 :   - Exact function lookup by signature (name#arity)
 :   - Imported module function/variable lookup
 :)
xquery version "3.1";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

declare option output:method "json";
declare option output:media-type "application/json";

(:~
 : Look up a single function by its name#arity signature.
 : Used for hover/function doc on a known function call.
 :)
declare function local:get-by-signature($signature as xs:string) {
    let $name := substring-before($signature, '#')
    let $arity := substring-after($signature, '#')
    let $prefix := substring-before($signature, ':')
    let $fn :=
        try {
            function-lookup(xs:QName(if ($prefix) then $name else 'fn:' || $name), xs:integer($arity))
        } catch * {
            ()
        }
    return
        if (exists($fn)) then
            let $desc := inspect:inspect-function($fn)
            let $function-name :=
                if (contains($desc/@name, ':')) then
                    substring-after($desc/@name, ':')
                else
                    $desc/@name
            return
                local:describe-function($desc, $prefix, $function-name, true(), '')
        else
            ()
};

(:~
 : Search built-in (registered + mapped) modules for functions matching
 : a prefix string. Handles namespace-qualified and unqualified lookups.
 :)
declare function local:get-built-in-functions($q as xs:string) {
    let $supplied-module-namespace-prefix := if (contains($q, ':')) then substring-before($q, ':') else ()
    let $function-name-fragment := if (contains($q, ':')) then substring-after($q, ':') else $q
    let $show-fn-prefix := exists($supplied-module-namespace-prefix) and $supplied-module-namespace-prefix eq 'fn'
    let $modules :=
        if ($supplied-module-namespace-prefix eq 'fn') then
            inspect:inspect-module-uri(xs:anyURI('http://www.w3.org/2005/xpath-functions'))
        else
            let $all-modules := (util:registered-modules(), util:mapped-modules()) !
                (try { inspect:inspect-module-uri(xs:anyURI(.)) } catch * { () })
            return
                if ($supplied-module-namespace-prefix) then
                    $all-modules[starts-with(@prefix, $supplied-module-namespace-prefix)]
                else
                    $all-modules
    let $functions := $modules/function[not(annotation/@name = "private") and not(deprecated)]
    for $function in $functions
    let $function-name :=
        if (contains($function/@name, ':')) then
            substring-after($function/@name, ':')
        else
            $function/@name
    let $module-namespace-prefix := $function/parent::module/@prefix
    let $complete-function-name :=
        if ($show-fn-prefix) then ('fn:' || $function-name)
        else ($module-namespace-prefix || ':' || $function-name)
    where
        starts-with($complete-function-name, $function-name-fragment)
        or starts-with($function-name, $function-name-fragment)
    order by ($module-namespace-prefix, '')[1], lower-case($function-name)
    return
        local:describe-function($function, $module-namespace-prefix, $function-name, $show-fn-prefix, $q)
};

(:~
 : Search imported modules for matching functions and variables.
 :)
declare function local:get-imported-functions(
    $q as xs:string?,
    $signature as xs:string?,
    $base as xs:string?,
    $imported-module-source-urls as xs:string*,
    $imported-module-namespace-uris as xs:string*,
    $imported-module-prefixes as xs:string*
) {
    let $supplied-module-namespace-prefix :=
        if (empty($signature)) then
            replace($q, "^\$?([^:]+):?.*$", "$1")
        else
            replace($signature, "^\$?([^:]+):?.*$", "$1")
    for $imported-module-prefix at $i in $imported-module-prefixes
    where matches($imported-module-prefix, "^" || $supplied-module-namespace-prefix)
    let $imported-module-source-url :=
        if (matches($imported-module-source-urls[$i], "^(/|\w+:)")) then
            $imported-module-source-urls[$i]
        else if (exists($base)) then
            concat($base, "/", $imported-module-source-urls[$i])
        else
            $imported-module-source-urls[$i]
    return
        try {
            let $module := inspect:inspect-module($imported-module-source-url)
            return (
                if (not(starts-with($q, "$")) and not(starts-with($signature, "$"))) then
                    let $function-name-fragment := replace($q, "^\$?[^:]+:(.*)$", "$1")
                    for $function in $module/function[not(annotation/@name = "private")]
                    let $function-name :=
                        if (contains($function/@name, ':')) then
                            substring-after($function/@name, ':')
                        else
                            $function/@name
                    let $arity := count($function/argument)
                    let $complete-function-name := concat($imported-module-prefix, ":", $function-name)
                    return
                        if (
                            (empty($signature) or $signature = $complete-function-name || "#" || $arity) and
                            (empty($q) or matches($complete-function-name, "^" || $q || "|:" || $q))
                        ) then
                            map {
                                "text": local:generate-signature($function, $imported-module-prefix, $function-name, false()),
                                "name": $function/@name || "#" || $arity,
                                "leftLabel": $function/returns/@type || local:cardinality($function/returns/@cardinality),
                                "snippet": local:generate-template($function, $imported-module-prefix, $function-name, false()),
                                "type": "function",
                                "replacementPrefix": $q,
                                "description": $function/description/string(),
                                "arguments": local:describe-arguments($function),
                                "path": $imported-module-source-url
                            }
                        else
                            ()
                else
                    let $signature := substring-after($signature, "$")
                    let $q := substring-after($q, "$")
                    for $variable in $module/variable[not(annotation/@name = "private")]
                    let $variable-name := concat($imported-module-prefix, ":", substring-after($variable/@name, ":"))
                    return
                        if (
                            (not($signature) or $signature = $variable-name) and
                            (not($q) or matches($variable-name, "^" || $q || "|:" || $q))
                        ) then
                            map {
                                "text": "$" || $variable-name,
                                "name": $variable-name,
                                "replacementPrefix": "$" || $q,
                                "type": "variable",
                                "path": $imported-module-source-url,
                                "snippet": $variable-name
                            }
                        else
                            ()
            )
        } catch * {
            ()
        }
};

declare function local:describe-function(
    $function as element(function),
    $module-namespace-prefix as xs:string,
    $function-name as xs:string,
    $show-fn-prefix as xs:boolean,
    $q as xs:string
) {
    map {
        "text": local:generate-signature($function, $module-namespace-prefix, $function-name, $show-fn-prefix),
        "snippet": local:generate-template($function, $module-namespace-prefix, $function-name, $show-fn-prefix),
        "type": "function",
        "description": $function/description/string(),
        "arguments": local:describe-arguments($function),
        "leftLabel": $function/returns/@type || local:cardinality($function/returns/@cardinality),
        "replacementPrefix": $q
    }
};

declare function local:describe-arguments($function as element(function)) {
    array {
        for $arg in $function/argument
        return
            map {
                "name": $arg/@var/string(),
                "type": $arg/@type/string() || local:cardinality($arg/@cardinality),
                "description": $arg/string()
            }
    }
};

declare function local:generate-signature(
    $function as element(function),
    $module-namespace-prefix as xs:string,
    $function-name as xs:string,
    $show-fn-prefix as xs:boolean?
) {
    (
        if ($module-namespace-prefix ne '') then
            ($module-namespace-prefix || ":")
        else if ($show-fn-prefix) then
            "fn:"
        else
            ()
    ) ||
    $function-name ||
    "(" ||
    string-join(
        $function/argument !
            ("$" || ./@var || " as " || ./@type || local:cardinality(./@cardinality)),
        ", "
    ) ||
    ")"
};

declare function local:generate-template(
    $function as element(function),
    $module-namespace-prefix as xs:string,
    $function-name as xs:string,
    $show-fn-prefix as xs:boolean?
) {
    (
        if ($module-namespace-prefix ne '') then
            ($module-namespace-prefix || ":")
        else if ($show-fn-prefix) then
            "fn:"
        else
            ()
    ) ||
    $function-name ||
    "(" ||
    string-join(
        for $param at $p in $function/argument
        return
            "${" || $p || ":$" || $param/@var || "}",
        ", "
    ) ||
    ")"
};

declare function local:cardinality($cardinality as xs:string) {
    switch ($cardinality)
        case "zero or one" return "?"
        case "zero or more" return "*"
        case "one or more" return "+"
        default return ()
};

let $q := request:get-parameter("prefix", ())
let $signature := request:get-parameter("signature", ())
let $base := request:get-parameter("base", ())
let $imported-module-source-urls := request:get-parameter("source", ())
let $imported-module-namespace-uris := request:get-parameter("uri", ())
let $imported-module-prefixes := request:get-parameter("mprefix", ())
return
    array {
        if ($q) then local:get-built-in-functions($q) else (),
        if ($signature) then
            let $desc := local:get-by-signature($signature)
            return
                if (exists($desc)) then
                    $desc
                else
                    local:get-imported-functions($q, $signature, $base,
                        $imported-module-source-urls, $imported-module-namespace-uris,
                        $imported-module-prefixes)
        else
            local:get-imported-functions($q, $signature, $base,
                $imported-module-source-urls, $imported-module-namespace-uris,
                $imported-module-prefixes)
    }
