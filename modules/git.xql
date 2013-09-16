xquery version "3.0";

import module namespace process="http://exist-db.org/xquery/process" at "java:org.exist.xquery.modules.process.ProcessModule";
import module namespace apputil="http://exist-db.org/apps/eXide/apputil" at "util.xql";
 
declare namespace git="http://exist-db.org/eXide/git";

declare function git:branch($param) {
    ()
};
declare function git:process($command as xs:string, $option as xs:string?, $workingDir as xs:string) {
    let $process-option := <option>
        <workingDir>{$workingDir}</workingDir>
    </option>

    return
    (util:declare-option("exist:serialize", "method=json media-type=application/json"),
    if($command ='branch') then
        process:execute(("git", "branch"), $process-option)
    else if ($command = 'checkout') then
        process:execute(("git", "checkout", $option), $process-option)
    else if ($command = 'commit') then
        process:execute(("git", "commit", "-a", "-m", $option), $process-option)
    else ())
};

let $target := request:get-parameter("target", ())
let $collectionParam := request:get-parameter("collection", ())
let $collection :=
    if ($collectionParam) then
        let $root := apputil:get-app-root($collectionParam)
        return
            if ($root) then $root else $collectionParam 
    else
        $target
let $workingDir := apputil:get-info-from-descriptor($collection)/workingDir/string()

let $command := request:get-parameter("git-command", ())
let $option := request:get-parameter("git-option", ())
return
(:    try {:)
        if ($command) then
            git:process($command, $option, $workingDir)
        else ()
(:    } catch * {:)
(:        response:set-status-code(500),:)
(:        <span>an error occured while processing git command</span>:)
(:    }:)