(:
 :  eXide - web-based XQuery IDE
 :  
 :  Copyright (C) 2011-13 Wolfgang Meier
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

declare namespace json="http://json.org/";
declare namespace xqdoc="http://www.xqdoc.org/1.0";

declare option exist:serialize "method=json media-type=application/json";

(: Search for functions matching the supplied query string.
 : Logic for different kinds of query strings:
 :   1. Module namespace prefix only (e.g., "kwic:", "fn:"): show all functions 
 :        in the module
 :   2. Module namespace prefix + exact function name (e.g., "math:pow"): show 
 :        just this function
 :   3. Module namespace prefix + partial function name (e.g., "ngram:con"): 
 :        show matching functions from the module
 :   4. No module namespace prefix + partial or complete function name (e.g., 
 :        "con"): show matching functions from all modules
 : Note: We give special handling to default XPath functions:
 :   1. Since the "fn" namespace prefix is the default function namespace, 
 :        its functions are included in searches when no namespace prefix is
 :        supplied. Functions from this namespace appear at the top of the list 
 :        of results. The results also omit the "fn" namespace prefix if it 
 :        was omitted in the query string. 
 :   2. If the "fn" namespace prefix is supplied in the query string, we limit 
 :        searches to the default XPath functions, and the results show the 
 :        prefix.
 : :)
declare function local:get-matching-functions($q as xs:string) {
    let $supplied-module-namespace-prefix := if (contains($q, ':')) then substring-before($q, ':') else ()
    let $function-name-fragment := if (contains($q, ':')) then substring-after($q, ':') else $q
    (: If the user supplies the "fn" prefix, we should preserve it :)
    let $show-fn-prefix := exists($supplied-module-namespace-prefix) and $supplied-module-namespace-prefix eq 'fn'
    let $modules :=
        if ($supplied-module-namespace-prefix eq 'fn') then
            inspect:inspect-module-uri(xs:anyURI('http://www.w3.org/2005/xpath-functions'))
        else
            let $all-modules := (util:registered-modules(), util:mapped-modules()) ! inspect:inspect-module-uri(xs:anyURI(.))
            return
                if ($supplied-module-namespace-prefix) then
                    $all-modules[starts-with(@prefix, $supplied-module-namespace-prefix)] 
                else 
                    $all-modules
    let $functions := $modules/function[not(deprecated)]
    for $function in $functions
    let $function-name := 
        (: Functions in some modules contain the module namespace prefix in 
         : the name attribtue, e.g., @name="map:merge". :)
        if (contains($function/@name, ':')) then 
            substring-after($function/@name, ':')
        (: Functions in others *do not*, e.g., math:pow > @name="pow" :)
        else 
            $function/@name
    let $module-namespace-prefix := 
        (: All modules have a @prefix attribute, except the default XPath 
         : function namespace, whose @prefix is an empty string. (Even though
         : its prefix is conventionally given as "fn" in the spec.) :)
        $function/parent::module/@prefix
    let $complete-function-name := if ($show-fn-prefix) then ('fn:' || $function-name) else ($module-namespace-prefix || ':' || $function-name)
    where 
        (
            starts-with($complete-function-name, $function-name-fragment)
            or
            starts-with($function-name, $function-name-fragment)
        )
    (: Ensure functions in "fn" namespace, or default function namespace, 
     : appear at the top of the list :)
    order by ($module-namespace-prefix, '')[1], lower-case($function-name)
    return
        local:describe-function($function, $module-namespace-prefix, $function-name, $show-fn-prefix)
};

declare function local:describe-function($function as element(function), $module-namespace-prefix as xs:string, $function-name as xs:string, $show-fn-prefix as xs:boolean) {
    let $signature := local:generate-signature($function, $module-namespace-prefix, $function-name, $show-fn-prefix)
    let $template := local:generate-template($signature)
    let $help := local:generate-help($function)
    let $visibility := 
        if ($function/annotation[@name="private"]) then
            "private"
        else
            "public"
    return
        <json:value xmlns:json="http://json.org/" json:array="true">
            <signature>{$signature}</signature>
            <template>{$template}</template>
            <help>{$help}</help>
            <type>function</type>
            <visibility>{$visibility}</visibility>
        </json:value>
};

declare function local:generate-signature($function as element(function), $module-namespace-prefix as xs:string, $function-name as xs:string, $show-fn-prefix as xs:boolean) {
    (
        if ($module-namespace-prefix ne '') then
            ($module-namespace-prefix || ":")
        else if ($show-fn-prefix) then
            "fn:"
        else
            ()
    ) || 
    $function-name ||
    "(" ||
    string-join(
        $function/argument !
            ("$" || ./@var || " as " || ./@type || local:cardinality(./@cardinality)),
        ", "
    ) ||
    ")"
};

declare function local:generate-template($signature as xs:string) {
    string-join(
        for $token in analyze-string($signature, "\$([^\s,\)]+)")/*
        return
            typeswitch($token)
                case element(fn:match) return
                    "$${" || count($token/preceding-sibling::fn:match) + 1 || ":" || $token/fn:group || "}"
                default return
                    $token/node()
    )
};

declare function local:generate-help($function as element(function)) {
    let $help :=
        <div class="function-help">
            <p>{$function/description/node()}</p>
            <dl>
                {
                    $function/argument !
                        (
                            <dt>${./@var/string()} as {./@type/string()}{local:cardinality(./@cardinality)}</dt>,
                            <dd>{./node()}</dd>
                        )
                }
            </dl>
            <dl>
                <dt>Returns: {$function/returns/@type/string()}{local:cardinality($function/returns/@cardinality)}</dt>
                <dd>{$function/returns/node()}</dd>
            </dl>
        </div>
    return
        util:serialize($help, "method=xml omit-xml-declaration=yes")
};

declare function local:cardinality($cardinality as xs:string) {
    switch ($cardinality)
        case "zero or one" return "?"
        case "zero or more" return "*"
        case "one or more" return "+"
        default return ()
};

let $q := request:get-parameter("prefix", ())
return
    <functions xmlns:json="http://json.org/">
        {
            local:get-matching-functions($q)
        }
    </functions>