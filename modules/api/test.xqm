(:
 :  eXide REST API — XQSuite test runner.
 :  Migrated from run-test.xq.
 :)
xquery version "3.1";

module namespace test="http://exist-db.org/apps/eXide/api/test";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace xqsuite="http://exist-db.org/xquery/xqsuite"
    at "resource:org/exist/xquery/lib/xqsuite/xqsuite.xql";

declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 : POST /api/test — Run XQSuite tests on a module.
 :)
declare function test:run($request as map(*)) {
    let $source := $request?body?source
    let $db-uri := xs:anyURI("xmldb:exist://" || $source)
    return
        if (not(util:binary-doc-available($db-uri))) then
            roaster:response(400, "application/json", map {
                "error": "Module not found or not saved in database. Save the test module to a database collection first.",
                "source": $source
            })
        else
            try {
                let $result := xqsuite:suite(inspect:module-functions($db-uri))
                let $serialized := serialize($result, <output:serialization-parameters>
                    <output:method>xml</output:method>
                    <output:indent>yes</output:indent>
                </output:serialization-parameters>)

                (: xqsuite:suite() returns <testsuites><testsuite>...</testsuite></testsuites>;
                 : earlier code looked at $result/self::testsuite (singular), which never
                 : matched, so @tests/@failures/@time/@pending all fell back to 0 or ""
                 : even when XQSuite reported real values. Walk one level down. :)
                let $testsuite := $result/testsuite
                return map {
                    "source": $source,
                    "tests": xs:integer(($testsuite/@tests, count($result//testcase))[1]),
                    "failures": xs:integer(($testsuite/@failures, count($result//failure))[1]),
                    "errors": xs:integer(($testsuite/@errors, count($result//error))[1]),
                    "pending": xs:integer(($testsuite/@pending, 0)[1]),
                    "time": string(($testsuite/@time, "")[1]),
                    "testcases": array {
                        for $tc in $result//testcase
                        return map {
                            "name": string($tc/@name),
                            "class": string($tc/@class),
                            "line": xs:integer(($tc/@line, 0)[1]),
                            "time": string(($tc/@time, "")[1]),
                            (: XQSuite emits the *expected* value as the body of <failure>
                             : and the *actual* value as a sibling <output> element. Surfacing
                             : only one half left users wondering "expected what?" or
                             : "actual what?"; merge both into the failure map. :)
                            "failure": if ($tc/failure) then map {
                                "message": string($tc/failure/@message),
                                "type": string($tc/failure/@type),
                                "expected": string($tc/failure),
                                "actual": string($tc/output),
                                "detail": string($tc/failure)
                            } else (),
                            "error": if ($tc/error) then map {
                                "message": string($tc/error/@message),
                                "type": string($tc/error/@type),
                                "detail": string($tc/error)
                            } else ()
                        }
                    },
                    "xml": $serialized
                }
            } catch * {
                roaster:response(400, "application/json", map {
                    "error": $err:description,
                    "code": string($err:code),
                    "source": $source
                })
            }
};
