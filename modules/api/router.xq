(:
 :  eXide REST API — Roaster router entry point.
 :
 :  All /api/* requests are forwarded here by controller.xq.
 :  Routing is driven by ../api.json (OpenAPI 3.0 spec).
 :)
xquery version "3.1";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

import module namespace roaster="http://e-editiones.org/roaster";

(: Handler modules — each provides functions referenced by operationId in api.json :)
import module namespace auth="http://exist-db.org/apps/eXide/api/auth" at "auth.xqm";
import module namespace db="http://exist-db.org/apps/eXide/api/db" at "db.xqm";
import module namespace query="http://exist-db.org/apps/eXide/api/query" at "query.xqm";
import module namespace editor="http://exist-db.org/apps/eXide/api/editor" at "editor.xqm";
import module namespace templates="http://exist-db.org/apps/eXide/api/templates" at "templates.xqm";
import module namespace packages="http://exist-db.org/apps/eXide/api/packages" at "packages.xqm";
import module namespace search="http://exist-db.org/apps/eXide/api/search" at "search.xqm";
import module namespace admin="http://exist-db.org/apps/eXide/api/admin" at "admin.xqm";
import module namespace test="http://exist-db.org/apps/eXide/api/test" at "test.xqm";
import module namespace sync="http://exist-db.org/apps/eXide/api/sync" at "sync.xqm";

declare variable $local:definitions := "modules/api.json";

declare function local:lookup($name as xs:string) {
    function-lookup(xs:QName($name), 1)
};

roaster:route($local:definitions, local:lookup#1)
