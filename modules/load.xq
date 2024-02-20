(:
 :  eXide - web-based XQuery IDE
 :
 :  Copyright (C) 2011 Wolfgang Meier
 :
 :  This program is free software: you can redistribute it and/or modify
 :  it under the terms of the GNU General Public License as published by
 :  the Free Software Foundation, either version 3 of the License, or
 :  (at your option) any later version.
 :
 :  This program is distributed in the hope that it will be useful,
 :  but WITHOUT ANY WARRANTY; without even the implied warranty of
 :  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 :  GNU General Public License for more details.
 :
 :  You should have received a copy of the GNU General Public License
 :  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 :)
xquery version "3.0";

import module namespace config="http://exist-db.org/xquery/apps/config" at "config.xqm";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "dbutils.xqm";

declare function local:get-run-path($path) {
    let $appRoot := repo:get-root()
    return
        replace(
            if (starts-with($path, $appRoot)) then
                request:get-context-path() || "/" || request:get-attribute("$exist:prefix") || "/" ||
                substring-after($path, $appRoot)
            else
                request:get-context-path() || "/rest" || $path,
            "/{2,}", "/"
        )
};

let $path := request:get-parameter("path", ())
let $download := request:get-parameter("download", false()) cast as xs:boolean
let $indent := request:get-parameter("indent", true()) cast as xs:boolean
let $expand-xincludes := request:get-parameter("expand-xincludes", false()) cast as xs:boolean
let $omit-xml-declaration := request:get-parameter("omit-xml-decl", true()) cast as xs:boolean
let $isBinary := util:binary-doc-available($path)
let $isCollection := xmldb:collection-available($path)
let $name := replace($path, "^.+/([^/]+)$", "$1")
(: Disable betterFORM filter :)
let $attribute := request:set-attribute("betterform.filter.ignoreResponseBody", "true")
return
    if (config:access-allowed($path, sm:id()//sm:real/sm:username)) then
        if ($isCollection and $download) then
            let $entries :=
                (: compression:zip uses default serialization parameters, so we'll construct entries manually :)
                dbutil:scan(xs:anyURI($path), function($coll as xs:anyURI, $res as xs:anyURI?) {
                    (: compression:zip doesn't seem to store empty collections, so we'll scan for only resources :)
                    if (exists($res)) then
                        let $relative-path := $name || "/" || substring-after($res, $path || "/")
                        return
                            if (util:binary-doc-available($res)) then
                                <entry type="uri" name="{$relative-path}">{$res}</entry>
                            else
                                <entry type="xml" name="{$relative-path}">{
                                    util:declare-option(
                                        "exist:serialize", 
                                        "expand-xincludes=" 
                                        || (if ($expand-xincludes) then "yes" else "no")
                                        || " indent=" 
                                        || (if ($indent) then "yes" else "no")
                                        || " omit-xml-declaration=" 
                                        || (if ($omit-xml-declaration) then "yes" else "no")
                                    ),
                                    doc($res)
                                }</entry>
                    else
                        ()
                })
            let $archive := compression:zip($entries, true())
            let $archive-name := $name || ".zip"
            return 
                (
                    response:set-header("Content-Disposition", concat("attachment; filename=", $archive-name)),
                    response:stream-binary($archive, "application/zip", $archive-name)
                )
        else
            let $mime := xmldb:get-mime-type($path)
            let $headers := 
                (
                    response:set-header("Content-Type", if (exists($mime)) then $mime else "application/binary"),
                    response:set-header("X-Link", local:get-run-path($path)),
                    if ($download) then
                        response:set-header("Content-Disposition", concat("attachment; filename=", $name))
                    else
                        ()
                )
            return
                if ($isBinary) then
                    let $data := util:binary-doc($path)
                    return
                        response:stream-binary($data, $mime, $name)
                else
                    (
                        util:declare-option(
                            "exist:serialize", 
                            "expand-xincludes=" 
                            || (if ($expand-xincludes) then "yes" else "no")
                            || " indent=" 
                            || (if ($indent) then "yes" else "no")
                            || " omit-xml-declaration=" 
                            || (if ($omit-xml-declaration) then "yes" else "no")
                        ),
                        doc($path)
                    )
    else
        response:set-status-code(404)
