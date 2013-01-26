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
xquery version "1.0";

(:~
	Post-processes query results for the sandbox application. The
	controller first sends the user-supplied query to XQueryServlet
	for evaluation. The result is then passed to this script, which
	stores the result set into the HTTP session and returns the number
	of hits and time elapsed.

	Subsequent requests from the sandbox application may retrieve single
	items from the result set stored in the session (see controller).
:)

declare namespace sandbox="http://exist-db.org/xquery/sandbox";

declare option exist:serialize "method=xml media-type=text/xml omit-xml-declaration=no indent=no";

(:~
 :  Check which namespace declarations have to be output.
 :)
declare function sandbox:namespace-decls($elem as element(), $namespaces as xs:string*) {
    for $node in ($elem, $elem/@*)
    let $name := node-name($node)
    let $ns := namespace-uri-from-QName($name)
    let $prefix := prefix-from-QName($name)
    return
        if ($ns and empty(index-of($namespaces, $ns))) then
            <ns prefix="{$prefix}" uri="{$ns}"/>
        else
            ()
};

(:~
	Pretty print an XML fragment. Returns HTML to highlight the XML syntax.
:)
declare function sandbox:pretty-print($node as item(), $namespaces as xs:string*) {
	typeswitch ($node)
		case $elem as element(exist:match) return
			<span class="ace_constant">{$elem/node()}</span>
		case $elem as element() return
            let $nsDecls := sandbox:namespace-decls($elem, $namespaces)
            let $newNamespaces := 
                if (empty($nsDecls)) then
                    $namespaces
                else
                    ($namespaces, $nsDecls/@uri/string())
            return
			<div class="xml-element">
				<span>&lt;</span>
				<span class="ace_keyword">{node-name($elem)}</span>
                {
                    for $nsDecl in $nsDecls
                    return (
                        ' ', 
                        <span class="ace_keyword">
                        {
                            if ($nsDecl/@prefix != '') then 
                                concat("xmlns:", $nsDecl/@prefix/string())
                            else
                                "xmlns"
                                
                        }
                        </span>, '="',
                        <span class="ace_string">{$nsDecl/@uri/string()}</span>,
                        '"'
                    )
                }
				{
					for $attr in $elem/@*
					return (
						' ', <span class="ace_keyword">{node-name($attr)}</span>,
						'="', <span class="ace_string">{$attr/string()}</span>, '"'
					)
				}
				{
					let $children := $elem/node()
					return
						if (count($children) gt 0) then (
							<span>&gt;</span>,
							for $child in $children
							return
								sandbox:pretty-print($child, $newNamespaces),
							<span>&lt;/</span>,
							<span class="ace_keyword">{node-name($elem)}</span>,
							<span>&gt;</span>
						) else
							<span>/&gt;</span>
				}
			</div>
		case $text as text() return
			<span class="ace_identifier">{$text}</span>
		case $comment as comment() return
			<div class="ace_comment">&lt;-- {$comment/string()} --&gt;</div>
		case $pi as processing-instruction() return
			<div style="color: darkred">&lt;?{$pi/string()}?&gt;</div>
		default return
			$node
};

(:~ Retrieve a single query result. :)
declare function sandbox:retrieve($num as xs:integer) as element() {
    let $cached := session:get-attribute("cached")
    let $node := $cached[$num]
    let $item := 
    	if ($node instance of node()) then
    		util:expand($node, 'indent=yes')
    	else
    		$node
    let $documentURI :=if ($node instance of node()) then document-uri(root($node)) else ()
    return
        <div class="{if ($num mod 2 eq 0) then 'even' else 'uneven'}">
            {
                if (string-length($documentURI) > 0) then
                    <div class="pos">
                    {
                        if (string-length($documentURI) > 0) then
                            <a href="{$documentURI}#{util:node-id($node)}" data-path="{$documentURI}"
                                title="Click to load source document">{$num}</a>
                        else
                            ()
                    }
                    </div>
                else
                    ()
            }
            <div class="item">
            { sandbox:pretty-print($item, ()) }
            </div>
        </div>
};

(:~ Take the query results and store them into the HTTP session. :)
declare function sandbox:store-in-session($results as item()*) as element(result) {
	let $null := session:set-attribute('cached', $results)
    let $startTime := request:get-attribute("start-time")
    let $elapsed := if ($startTime) then seconds-from-duration(current-time() - xs:time($startTime)) else 0
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
