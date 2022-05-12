xquery version "3.0";

declare namespace find="http://exist-db.org/xquery/eXide/find";

declare option exist:serialize "method=json media-type=text/javascript";

declare function find:xquery-scripts($root as xs:string) {
    for $resource in xmldb:get-child-resources($root)
    let $path := concat($root, "/", $resource)
    where xmldb:get-mime-type($path) eq "application/xquery"
    return
        $path,
    
    for $child in xmldb:get-child-collections($root)
    let $path := concat($root, "/", $child)
    where sm:has-access($path, "r-x")
    return
        find:xquery-scripts($path)
};

declare function find:registered-scripts($prefix as xs:string?) {
    for $uri in (util:registered-modules(), util:mapped-modules())
    let $module := inspect:inspect-module-uri($uri)
    where empty($prefix) or contains($module/@prefix, $prefix)
    return
        <json:value xmlns:json="http://www.json.org" json:array="true"
            prefix="{$module/@prefix}" uri="{$module/@uri}">
        {
            if ($module/@location) then
                attribute at { $module/@location }
            else
                ()
        }
        </json:value>
};

declare function find:modules($root as xs:string, $callback as function(xs:string, xs:string, xs:string) as item()*) {
    for $script in find:xquery-scripts($root)
    let $data := util:binary-doc($script)
    let $source := util:base64-decode($data)
    where matches($source, "^module\s+namespace", "m")
    return
        let $match := analyze-string($source, "^module\s+namespace\s+([^\s=]+)\s*=\s*['""]([^'""]+)['""]", "m")//fn:match
        return
            $callback($match/fn:group[1], $match/fn:group[2], $script)
};

let $prefixParam := request:get-parameter("prefix", ())
let $modules := find:modules("/db", function($prefix, $uri, $source) {
    if (empty($prefixParam) or contains($prefix, $prefixParam)) then
        <json:value xmlns:json="http://www.json.org" json:array="true"
            prefix="{$prefix}" uri="{$uri}" at="{$source}"/>
    else
        ()
})
return
    <json:value xmlns:json="http://www.json.org">
    { 
        for $module in find:registered-scripts($prefixParam) order by $module/@at return $module,
        for $module in $modules order by $module/@at return $module
    }
    </json:value>