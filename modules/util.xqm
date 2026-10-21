xquery version "3.0";

module namespace apputil="http://exist-db.org/apps/eXide/apputil";

declare namespace git="http://exist-db.org/eXide/git";
declare namespace expath="http://expath.org/ns/pkg";
declare namespace repo="http://exist-db.org/xquery/repo";

declare namespace test="http://exist-db.org/xquery/xqsuite";

(:~
 : Namespaces of eXide's own helper modules that are imported with an `at`
 : location but are not part of the editor's module catalogue. They must never
 : be passed to inspect:inspect-module-uri(): for a namespace eXist cannot
 : resolve to a source it falls back to fetching the namespace URI over HTTP,
 : with no timeout, while holding a broker — a slow remote host then exhausts
 : the broker pool and hangs every request.
 :)
declare variable $apputil:INTERNAL_NAMESPACES := (
    "http://exist-db.org/xquery/apps/config",
    "http://exist-db.org/xquery/template",
    "http://exist-db.org/xquery/xqsuite"
);

(:~
 : Registered and mapped module namespaces that are safe to inspect.
 :)
declare function apputil:inspectable-modules() as xs:string* {
    distinct-values((util:registered-modules(), util:mapped-modules()))
        [not(starts-with(., "http://exist-db.org/apps/eXide/"))]
        [not(. = $apputil:INTERNAL_NAMESPACES)]
};

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

declare function apputil:get-info-from-descriptor($collection as xs:string) {
    let $expathConf := doc(concat($collection, "/expath-pkg.xml"))/expath:package
    let $repoConf := doc(concat($collection, "/repo.xml"))/repo:meta
    let $gitConf := doc(concat($collection, "/git.xml"))/git:git
    let $user := sm:id()//sm:real/sm:username/string()
    let $auth := if ($user) then sm:is-dba($user) else false()
    return
        <info xmlns:json="http://json.org" root="{$collection}" abbrev="{$expathConf/@abbrev}">
            <target>{$repoConf/repo:target/string()}</target>
            <deployed>{$repoConf/repo:deployed/string()}</deployed>
            <isAdmin json:literal="true">{$auth}</isAdmin>
            <url>{ request:get-attribute("$exist:prefix") || "/" || substring-after($collection, repo:get-root()) }</url>
            <git>{exists($gitConf)}</git>
            <workingDir>{$gitConf/git:workingDir/string()}</workingDir>
        </info>
};

declare function apputil:get-info($collection as xs:string) {
    let $null := util:declare-option("exist:serialize", "method=json media-type=application/json")
    let $root := apputil:get-app-root($collection)
    return
        if ($root) then
            apputil:get-info-from-descriptor($root)
        else
            <info/>
};
