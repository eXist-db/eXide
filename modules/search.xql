xquery version "3.0";


import module namespace dbutil="http://exist-db.org/xquery/dbutil";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

declare option output:method "html5";
declare option output:media-type "text/html";

declare variable $local:SPECIAL_CHARS := "[\-\[\]\(\)\{\}\*\+\?\.\^\|\$]";

declare variable $local:MIME_MAP := map {
    "javascript" := ("text/javascript", "application/x-javascript"),
    "css" := ("text/css", "application/less"),
    "xquery" := "application/xquery"
};

declare variable $local:MIME_TYPES := (
    "application/x-javascript",
    "application/xquery",
    "text/css",
    "text/text",
    "application/less"
);

declare function local:escape-regex($str as xs:string?) {
    string-join(
        let $analyzed := analyze-string($str, $local:SPECIAL_CHARS)
        for $match in $analyzed/node()
        return
            typeswitch ($match)
                case element(fn:match) return
                    "\" || $match/text()
                default return
                    $match
    )
};

declare function local:search-resource($resource, $searchStr, $flags) {
	let $binary := util:binary-doc($resource)
    let $text := util:binary-to-string($binary)
    let $analyzed := analyze-string($text, "^(.*?" || $searchStr || ".*?)$", "m" || $flags)
    return
        if ($analyzed/fn:match) then
            for $match in $analyzed/fn:match
            let $line := count(analyze-string(string-join($match/preceding::text()), "\n")/fn:match) + 1
            return (
                <li class="sourceinfo">
                    <a class="resource" href="#" data-src="{$resource}" data-line="{$line}">
                    { replace($resource, "^.*/([^/]+)$", "$1") }
                    </a>
                    <span class="line">line {$line}</span>
                </li>,
                <li class="code">
                {
                    let $code := normalize-space($match/fn:group/string())
                    let $analyzed := analyze-string($code, $searchStr, $flags)
                    for $node in $analyzed/*
                    return
                        typeswitch($node)
                            case element(fn:match) return
                                <mark>{$node/text()}</mark>
                            default return
                                $node/text()
                }
                </li>
            )
        else
            ()
};

<html>
    <head>
        <link rel="stylesheet" type="text/css" href="../resources/css/search.css"/>
        <script type="text/javascript" src="$shared/resources/scripts/jquery/jquery-1.7.1.min.js"/>
    </head>
    <body>
    {
        let $useRegex := request:get-parameter("regex", ())
        let $case := request:get-parameter("case", ())
        let $flags := if ($case) then "" else "i"
        let $target := request:get-parameter("target", "all")
        let $collection := request:get-parameter("collection", ())
        let $type := request:get-parameter("type", ())
        let $root :=
            switch ($target)
                case "all" return "/db"
                case "collection" return $collection
                default return $target
        let $searchStr := 
            if ($useRegex) then 
                request:get-parameter("search", ())
            else
                local:escape-regex(request:get-parameter("search", ()))
        return
            if (empty($searchStr) or $searchStr = "") then
                <p>Empty search!</p>
            else
                <div>
                    <h3>Search Results for {$searchStr} in {$root}</h3>
                    <ul>
                    {
                        if ($type = "all") then
                            dbutil:scan(xs:anyURI($root), function($collection, $resource) {
                                if ($resource and xmldb:get-mime-type($resource) = $local:MIME_TYPES) then
                                    local:search-resource($resource, $searchStr, $flags)
                                else
                                    ()
                            })
                        else
                            let $mime := $local:MIME_MAP($type)
                            return
                                if (exists($mime)) then
                                    dbutil:find-by-mimetype(xs:anyURI($root), $mime, 
                                        local:search-resource(?, $searchStr, $flags)
                                    )
                                else
                                    <li>Unknown or unsupported type: {$type}.</li>
                    }
                    </ul>
                </div>
    }
        <script type="text/javascript">
            $(document).ready(function() {{
                $(".resource").click(function(ev) {{
                    var src = $(this).data("src");
                    var line = $(this).data("line");
                    parent.eXide.app.findDocument(src, line);
                }});
            }});
        </script>
    </body>
</html>