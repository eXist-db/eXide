xquery version "3.1";

declare namespace output = "http://www.w3.org/2010/xslt-xquery-serialization";

declare option output:method "json";
declare option output:media-type "application/json";

let $action := request:get-parameter("action", ())
return
    if (not(sm:is-dba(sm:id()//sm:real/sm:username/string()))) then
        <response>
            <error>DBA permissions required</error>
        </response>
    else if ($action = "kill") then
        let $id := request:get-parameter("id", ())
        return
            <response>
                <ok>{
                    if ($id) then
                        system:kill-running-xquery(xs:integer($id))
                    else
                        "no id"
                }</ok>
            </response>
    else if ($action = "token") then
        let $raw :=
            try {
                file:read(system:get-exist-home() || "/data/jmxservlet.token")
            } catch * {
                ()
            }
        let $token :=
            if ($raw) then
                let $line := tokenize($raw, "\n")[starts-with(., "token=")]
                return substring-after($line, "token=")
            else
                ()
        return
            <response>
                <token>{$token}</token>
            </response>
    else
        <response>
            <error>Unknown action</error>
        </response>
