xquery version "3.0";

import module namespace test="http://exist-db.org/xquery/xqsuite"
at "resource:org/exist/xquery/lib/xqsuite/xqsuite.xql";

declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";

declare option output:method "html5";
declare option output:media-type "text/html";
declare option output:indent "no";

let $source := request:get-parameter("source", ())
return
    if (util:binary-doc-available((xs:anyURI("xmldb:exist://" || $source)))) then 
        let $result := test:suite(inspect:module-functions(xs:anyURI("xmldb:exist://" || $source)))
        let $serialization-parameters :=
            <output:serialization-parameters>
                <output:method>xml</output:method>
                <output:indent>yes</output:indent>
            </output:serialization-parameters>
        return
            <div class="uneven">
                <div class="item">
                    <div class="content ace_editor ace-tomorrow" style="white-space: pre-wrap">
                        { serialize($result, $serialization-parameters) }
                    </div>
                </div>
            </div>
    else
        let $message := "To use XQuery > Run as test, the query must be saved in the database. Please save the test to a collection in the database and try XQuery > Run as test again."
        return
            error(QName("http://exist-db.org/apps/eXide", "eXide-error"), $message)