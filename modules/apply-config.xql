xquery version "3.0";

declare namespace json="http://www.json.org";

declare option exist:serialize "method=json media-type=application/json";

declare function local:mkcol-recursive($collection, $components) {
    if (exists($components)) then
        let $newColl := concat($collection, "/", $components[1])
        return (
            xmldb:create-collection($collection, $components[1]),
            local:mkcol-recursive($newColl, tail($components))
        )
    else
        ()
};

(: Helper function to recursively create a collection hierarchy. :)
declare function local:mkcol($collection, $path) {
    local:mkcol-recursive($collection, tokenize($path, "/"))
};

let $collection := request:get-parameter("collection", ())
let $xconf := request:get-parameter("config", ())
let $target := "/db/system/config" || $collection
return
    if (xmldb:is-admin-user(xmldb:get-current-user())) then
        try {
            (
                <response json:literal="true">true</response>,
                if (not(starts-with($collection, "/db/system/config/"))) then (
                    local:mkcol("/db/system/config", $collection),
                    let $config := doc($collection || "/" || $xconf)
                    return
                        xmldb:store($target, $xconf, $config)
                ) else
                    (),
                let $reindex :=
                    if (starts-with($collection, "/db/system/config")) then
                        substring-after($collection, "/db/system/config")
                    else
                        $collection
                return
                    xmldb:reindex($reindex)
            )[1]
        } catch * {
            <response>
                <error>{ $err:description }</error>
            </response>
        }
    else
        <response>
            <error>You need to have dba rights</error>
        </response>