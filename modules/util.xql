xquery version "3.0";

module namespace apputil="http://exist-db.org/apps/eXide/apputil";

declare function apputil:get-app-root($collection as xs:string) {
    if (not(starts-with($collection, "/"))) then
        ()
    else if (doc(concat($collection, "/expath-pkg.xml"))) then
        $collection
    else if (not(matches($collection, "^/db/?$"))) then
        let $parent := replace($collection, "^(.*)/+[^/]+$", "$1")
        return
            apputil:get-app-root($parent)
    else
        ()
};