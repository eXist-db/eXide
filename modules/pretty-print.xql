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
xquery version "3.1";

module namespace pretty="http://exist-db.org/eXide/deploy";

declare namespace json = "http://www.w3.org/2013/XSL/json";
declare namespace output="http://www.w3.org/2010/xslt-xquery-serialization";

(:~
 :  Check which namespace declarations have to be output.
 :)
declare function pretty:namespace-decls($elem as element(), $namespaces as xs:string*) {
    for $node in ($elem, $elem/@*)
    let $name := node-name($node)
    let $ns := namespace-uri-from-QName($name)
    let $prefix := prefix-from-QName($name)
    return
        if ($ns and (empty($prefix) or $prefix != "xml") and empty(index-of($namespaces, $ns))) then
            <ns prefix="{$prefix}" uri="{$ns}"/>
        else
            ()
};

declare function pretty:pretty-print($item as item(), $namespaces as xs:string*, $output as xs:string) {
    if ($output = "xml") then 
        pretty:pretty-print-xml($item, $namespaces)
    else if ($output = "json") then 
        pretty:pretty-print-json($item, $namespaces)
    else
        (: if ($output = "adaptive") return :)
        pretty:pretty-print-adaptive($item, $namespaces)
};

(:~
    Pretty print an XML fragment. Returns HTML to highlight the XML syntax.
    TODO If adaptive becomes the default, we may wish to constrain $node to type node()? item() let other types through in the days before adaptive.
:)
declare function pretty:pretty-print-xml($node as item(), $namespaces as xs:string*) {
	typeswitch ($node)
		case $elem as element(exist:match) return
			<span class="ace_variable ace_entity ace_other ace_attribute-name exist-match">{$elem/node()}</span>
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
								pretty:pretty-print-xml($child, $newNamespaces),
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
			<div class="ace_comment">&lt;!-- {$comment/string()} --&gt;</div>
		case $pi as processing-instruction() return
			<div style="color: darkred">&lt;?{node-name($pi)}{if ($pi/string()) then " " || $pi/string() else ()}?&gt;</div>
		default return
			$node
};

(:~
    Pretty print an item using adaptive serialization rules. 
    @see https://www.w3.org/TR/xslt-xquery-serialization-31/#adaptive-output
    TODO extend to handle xs:double (format-number with spec's picture string returns an error) and xs:NOTATION (huh?)
:)
declare function pretty:pretty-print-adaptive($item as item(), $namespaces as xs:string*) {
	typeswitch ($item)
	    (: pass normal XML nodes to pretty-print-xml() - which has slightly different formatting, but works :)
	    case element() | comment() | processing-instruction() | text() return pretty:pretty-print-xml($item, $namespaces)
	    case $attr as attribute() return
	        (
			    <span class="ace_keyword">{node-name($attr)}</span>,
			    '="', 
			    <span class="ace_string">{$attr/string()}</span>, 
			    '"'
			)
	    case $map as map(*) return 
            <div class="xml-element">
                <span class="ace_identifier">map </span>
                <span class="ace_paren ace_lparen">{{</span>
                {
                let $objects := 
                    map:for-each-entry(
                        $map, 
                        function($object-name, $object-value) {
                            <div class="xml-element">
                                <span class="ace_variable">"{$object-name}"</span>
                                <span class="ace_identifier"> : </span>
                                { pretty:pretty-print-adaptive($object-value, $namespaces) }
                            </div>
                        }
                    )
                let $object-count := count($objects)
                for $object at $n in $objects
                return
                    (
                        $object,
                        if ($n lt $object-count) then <div class="xml-element"><span class="ace_identifier" style="display: inline">, </span></div> else ()
                    )
                }
                <span class="ace_paren ace_rparen">}} </span>
            </div>
        case $array as array(*) return 
	        (
	            <span class="ace_paren ace_lparen">[ </span>,
	            for $array-member at $n in $array?*
                return 
                    (
                        pretty:pretty-print-adaptive($array-member, $namespaces),
                        if ($n lt array:size($array)) then <span class="ace_identifier">, </span> else ()
                    )
                ,
                <span class="ace_paren ace_rparen"> ] </span>
	        )
        case $function as function(*) return
            let $name := function-name($function)
            let $arity := function-arity($function)
            return
                (
                if (empty($name)) then 
                    (
                        <span class="ace_paren ace_lparen">(</span>,
                        'anonymous',
                        <span class="ace_paren ace_rparen">)</span>
                    )
                else 
                    <span class="ace_support ace_function">{$name}</span>
                ,
				'#' || $arity
                )
		case $boolean as xs:boolean return
		    (
    		    <span class="ace_support ace_function">{ if ($boolean) then 'true' else 'false' }</span>,
    		    <span class="ace_paren ace_lparen">(</span>,
                <span class="ace_paren ace_rparen">)</span>
		    )
	    case $string as xs:string | xs:untypedAtomic return
	        <span class="ace_string">"{$string}"</span>
        case $qname as xs:QName return 
            (
                <span class="ace_identifier">{"Q"}</span>,
                <span class="ace_paren ace_lparen">{{</span>,
                <span class="ace_string">{namespace-uri-from-QName($qname)}</span>,
                <span class="ace_paren ace_rparen">}}</span>,
                <span class="ace_keyword">{local-name-from-QName($qname)}</span>
            )
        case $number as xs:integer | xs:decimal return
            <span class="ace_constant ace_numeric">{string($item)}</span>
        default return 
    		(: handles any other type :)
    		<span class="ace_constant">{string($item)}</span>
};

(:~
    Pretty print an item using JSON serialization rules. 
    @see https://www.w3.org/TR/xslt-xquery-serialization-31/#json-output
:)
declare function pretty:pretty-print-json($item as item(), $namespaces as xs:string*) {
    let $serialization-parameters := 
        <output:serialization-parameters>
            <output:method>json</output:method>
            <output:indent>yes</output:indent>
        </output:serialization-parameters>
    return
        <pre>{serialize($item, $serialization-parameters)}</pre>
};