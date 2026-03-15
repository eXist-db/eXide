(:
 :  eXide REST API — Search handler.
 :  Migrated from search.xq (HTML → JSON).
 :)
xquery version "3.1";

module namespace search="http://exist-db.org/apps/eXide/api/search";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "../dbutils.xqm";

declare variable $search:MIME_MAP := map {
    "javascript": ("text/javascript", "application/x-javascript", "application/javascript"),
    "css": ("text/css", "application/less"),
    "xquery": "application/xquery"
};

declare variable $search:ALL_MIME_TYPES := (
    "application/x-javascript", "application/javascript", "text/javascript",
    "application/xquery", "text/css", "text/text", "application/less"
);

declare %private function search:escape-regex($str as xs:string?) {
    replace($str, "([\-\[\]\(\)\{\}\*\+\?\.\^\|\$\\])", "\\$1")
};

(:~
 : POST /api/search — Full-text search across binary resources.
 :)
declare function search:search($request as map(*)) {
    let $body := $request?body
    let $query-str := $body?query
    let $collection := ($body?collection, "/db")[1]
    let $type := ($body?type, "all")[1]
    let $use-regex := ($body?regex, false())[1]
    let $case-sensitive := ($body?caseSensitive, false())[1]

    let $flags := if ($case-sensitive) then "" else "i"
    let $search-str :=
        if ($use-regex) then $query-str
        else search:escape-regex($query-str)

    return
        if (empty($search-str) or $search-str = "") then
            roaster:response(400, "application/json",
                map { "error": "Empty search query" })
        else
            let $hits :=
                if ($type = "all") then
                    dbutil:scan(xs:anyURI($collection), function($col, $resource) {
                        if ($resource and xmldb:get-mime-type($resource) = $search:ALL_MIME_TYPES) then
                            search:search-resource($resource, $search-str, $flags)
                        else ()
                    })
                else
                    let $mime := $search:MIME_MAP($type)
                    return
                        if (exists($mime)) then
                            dbutil:find-by-mimetype(xs:anyURI($collection), $mime,
                                search:search-resource(?, $search-str, $flags))
                        else ()
            return map {
                "query": $query-str,
                "collection": $collection,
                "hits": array { $hits }
            }
};

declare %private function search:search-resource($resource, $search-str, $flags) {
    let $binary := util:binary-doc($resource)
    let $text := util:binary-to-string($binary)
    let $analyzed := analyze-string($text, "^(.*?" || $search-str || ".*?)$", "m" || $flags)
    return
        if ($analyzed/fn:match) then
            for $match in $analyzed/fn:match
            let $line := count(analyze-string(string-join($match/preceding::text()), "\n")/fn:match) + 1
            return map {
                "resource": string($resource),
                "name": replace($resource, "^.*/([^/]+)$", "$1"),
                "line": $line,
                "text": normalize-space($match/fn:group/string())
            }
        else ()
};
