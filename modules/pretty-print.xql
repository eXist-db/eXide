(:
 :  eXide - web-based XQuery IDE
 :  
 :  Copyright (C) 2013 Wolfgang Meier
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

module namespace pretty="http://exist-db.org/eXide/deploy";

(:~
 :  Check which namespace declarations have to be output.
 :)
declare function pretty:namespace-decls($elem as element(), $namespaces as xs:string*) {
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
declare function pretty:pretty-print($node as item(), $namespaces as xs:string*) {
	typeswitch ($node)
		case $elem as element(exist:match) return
			<span class="ace_constant">{$elem/node()}</span>
		case $elem as element() return
            let $nsDecls := pretty:namespace-decls($elem, $namespaces)
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
								pretty:pretty-print($child, $newNamespaces),
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