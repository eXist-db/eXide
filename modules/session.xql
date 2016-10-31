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

(:~
	Post-processes query results for the sandbox application. The
	controller first sends the user-supplied query to XQueryServlet
	for evaluation. The result is then passed to this script, which
	stores the result set into the HTTP session and returns the number
	of hits and time elapsed.

	Subsequent requests from the sandbox application may retrieve single
	items from the result set stored in the session (see controller).
:)

import module namespace pretty="http://exist-db.org/eXide/deploy" at "pretty-print.xql";

declare namespace sandbox="http://exist-db.org/xquery/sandbox";

declare option exist:serialize "method=xml media-type=text/xml omit-xml-declaration=yes indent=no";

(:~ Retrieve a single query result. :)
declare function sandbox:retrieve($num as xs:integer) as element() {
    let $output := request:get-parameter("output", "xml")
    let $auto-expand-matches := request:get-parameter("auto-expand-matches", true())
    let $cached := session:get-attribute("cached")
    let $cached-item := $cached[$num]
    let $result := 
        if ($output = ("xml", "adaptive")) then
            if ($cached-item instance of node()) then
                $cached-item
            else
                (: preserve eXide's traditional behavior: return an "empty" result in the case of maps, arrays, etc. :)
                try { serialize($cached-item) } catch * { () }
        else
            $cached-item
    let $documentURI :=if ($cached-item instance of node()) then document-uri(root($cached-item)) else ()
    return
        <div class="{if ($num mod 2 eq 0) then 'even' else 'uneven'}">
            <div class="pos">
            {
                if (string-length($documentURI) > 0) then
                    <a href="{$documentURI}#{util:node-id($cached-item)}" data-path="{$documentURI}"
                        title="Click to load source document">{$num}</a>
                else
                    $num
            }
            </div>
            <div class="item">
            { if (exists($result)) then pretty:pretty-print($result, (), $output, $auto-expand-matches) else () }
            </div>
        </div>
};

(:~ Take the query results and store them into the HTTP session. :)
declare function sandbox:store-in-session($results as item()*) as element(result) {
	let $null := session:set-attribute('cached', $results)
    let $startTime := request:get-attribute("start-time")
    let $elapsed := 
      if ($startTime) then
	let $current-time := current-time()
	let $hours :=  hours-from-duration($current-time - xs:time($startTime))
	let $minutes :=  minutes-from-duration($current-time - xs:time($startTime))
	let $seconds := seconds-from-duration($current-time - xs:time($startTime))
	return ($hours * 3600) + ($minutes * 60) + $seconds
      else 0
	return
		<result hits="{count($results)}" elapsed="{$elapsed}"/>
};

(: 	When a query has been executed, its results will be passed into
	this script in the request attribute 'results'. The result is then
	stored into the HTTP session. Subsequent requests from the sandbox
	can reference a result item in the session by passing parameter 'num'.
:)
session:create(),
let $input := request:get-data()
let $results := request:get-attribute("results")
let $pos := xs:integer(request:get-parameter("num", ()))
return
    if (string-length($input) gt 0) then
        $input
	else if ($pos) then
		sandbox:retrieve($pos)
	else
		sandbox:store-in-session($results)
