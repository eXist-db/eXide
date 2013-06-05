xquery version "3.0";

module namespace apputil="http://exist-db.org/apps/eXide/apputil";

declare namespace test="http://exist-db.org/xquery/xqsuite";

declare 
    %test:args("/db/apps/shared-resources/test/test2")
    %test:assertEquals("/db/apps/shared-resources")
    %test:args("/db/apps/shared-resources/")
    %test:assertEquals("/db/apps/shared-resources")
    %test:args("/db/apps/shared-resources/test/")
    %test:assertEquals("/db/apps/shared-resources")
    %test:args("/db/")
    %test:assertEmpty
    %test:args("/foo/")
    %test:assertEmpty
    %test:args("foo")
    %test:assertEmpty
function apputil:get-app-root($collection as xs:string) {
    if (not(starts-with($collection, "/"))) then
        ()
    else if (doc(concat($collection, "/expath-pkg.xml"))) then
        replace($collection, "/+$", "")
    else if (matches($collection, "^/db/+[^/]+")) then
        let $parent := replace($collection, "^(.*)/+[^/]+/*$", "$1")
        return
            apputil:get-app-root($parent)
    else
        ()
};