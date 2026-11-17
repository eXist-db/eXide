xquery version "3.0";

module namespace apputil="http://exist-db.org/apps/eXide/apputil";

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
