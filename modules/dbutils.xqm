xquery version "3.0";

module namespace dbutil="http://exist-db.org/xquery/dbutil";

import module namespace sm="http://exist-db.org/xquery/securitymanager";
import module namespace xmldb="http://exist-db.org/xquery/xmldb";

(:~ Scan a collection tree recursively starting at $root. Call $func once for each collection found :)
declare function dbutil:scan-collections($root as xs:anyURI, $func as function(xs:anyURI) as item()*) {
    $func($root),
    if (sm:has-access($root, "rx")) then
        for $child in xmldb:get-child-collections($root)
        return
            dbutil:scan-collections(xs:anyURI($root || "/" || $child), $func)
    else
        ()
};

(:~
 : List all resources contained in a collection and call the supplied function once for each
 : resource with the complete path to the resource as parameter.
 :)
declare function dbutil:scan-resources($collection as xs:anyURI, $func as function(xs:anyURI) as item()*) {
    if (sm:has-access($collection, "rx")) then
        for $child in xmldb:get-child-resources($collection)
        return
            $func(xs:anyURI($collection || "/" || $child))
    else
        ()
};

(:~ 
 : Scan a collection tree recursively starting at $root. Call the supplied function once for each
 : resource encountered. The first parameter to $func is the collection URI, the second the resource
 : path (including the collection part).
 :)
declare function dbutil:scan($root as xs:anyURI, $func as function(xs:anyURI, xs:anyURI?) as item()*) {
    dbutil:scan-collections($root, function($collection as xs:anyURI) {
        $func($collection, ()),
        (:  scan-resources expects a function with one parameter, so we use a partial application
            to fill in the collection parameter :)
        dbutil:scan-resources($collection, $func($collection, ?))
    })
};

declare function dbutil:find-by-mimetype($collection as xs:anyURI, $mimeType as xs:string+) {
    dbutil:scan($collection, function($collection, $resource) {
        if (exists($resource) and xmldb:get-mime-type($resource) = $mimeType) then
            $resource
        else
            ()
    })
};

declare function dbutil:find-by-mimetype($collection as xs:anyURI, $mimeType as xs:string+, $func as function(xs:anyURI) as item()*) {
    dbutil:scan($collection, function($collection, $resource) {
        if (exists($resource) and xmldb:get-mime-type($resource) = $mimeType) then
            $func($resource)
        else
            ()
    })
};