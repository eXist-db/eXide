xquery version "3.0";

import module namespace test="http://exist-db.org/xquery/xqsuite"
at "resource:org/exist/xquery/lib/xqsuite/xqsuite.xql";

import module namespace pretty="http://exist-db.org/eXide/deploy" at "pretty-print.xql";

declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";

declare option output:method "html5";
declare option output:media-type "text/html";
declare option output:indent "no";

let $source := request:get-parameter("source", ())
let $result := test:suite(inspect:module-functions(xs:anyURI("xmldb:exist://" || $source)))
return
    <div class="uneven">
        <div class="item">{pretty:pretty-print($result, ())}</div>
    </div>
    