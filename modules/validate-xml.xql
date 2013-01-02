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

declare namespace catalog="urn:oasis:names:tc:entity:xmlns:xml:catalog";

import module namespace config="http://exist-db.org/xquery/apps/config" at "config.xqm";

declare option exist:serialize "method=json media-type=text/javascript";

declare variable $catalog := doc($config:app-root || "/resources/schema/catalog.xml")/catalog:catalog;

declare function local:validate($doc as document-node(), $schema as xs:string) {
    let $report := validation:validate-report($doc, doc($schema))
    return
        if ($report/message[@level = "Error"]) then
            <report status="invalid">
                {
                    for $message in $report/message[@level = "Error"]
                    group by $line := $message/@line
                    return
                        <message line="{$line}">
                            {$message/text()}
                        </message>
                }
            </report>
        else
            <report status="valid"/>
};

declare function local:get-schema($doc as document-node(), $validate as xs:boolean) as xs:string? {
    if ($validate) then
        let $namespace := namespace-uri($doc/*)
        let $schema := $catalog/catalog:uri[@name = $namespace]/@uri/string()
        return
            if (exists($schema)) then
                $config:app-root || "/resources/schema/" || $schema
            else
                ()
    else
        ()
};

let $xml := request:get-parameter("xml", ())
let $validate := request:get-parameter("validate", "yes") = "yes"
return
	try {
		let $doc := util:parse($xml)
        let $schema := local:get-schema($doc, $validate)
        return
            if ($schema) then
                local:validate($doc, $schema)
            else
                <report status="valid"/>
	} catch exerr:EXXQDY0002  {
		$err:value
	}