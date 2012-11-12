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

declare namespace xqdoc="http://www.xqdoc.org/1.0";
declare namespace json="http://json.org/";

declare option exist:serialize "method=json media-type=application/json";

declare function local:builtin-modules() {
    let $prefix := request:get-parameter("prefix", ())
    for $module in util:registered-modules()
    let $funcs := inspect:module-functions-by-uri(xs:anyURI($module))
    let $matches := for $func in $funcs where matches(function-name($func), concat("^(\w+:)?", $prefix)) return $func
    for $func in $matches
    let $desc := inspect:inspect-function($func)
    order by function-name($func)
    return
        let $signature := local:generate-signature($desc)
        return
            <json:value json:array="true">
                <signature>{$signature}</signature>
                <help>{local:generate-help($desc)}</help>
                <type>function</type>
                <visibility>
                {
                    if ($desc/annotation[@name="private"]) then
                        "private"
                    else
                        "public"
                }
                </visibility>
            </json:value>
};

declare function local:generate-help($desc as element(function)) {
    let $help :=
        <div class="function-help">
            <p>{$desc/description/node()}</p>
            <dl>
            {
                for $arg in $desc/argument
                return (
                    <dt>${$arg/@var/string()} as {$arg/@type/string()}{local:cardinality($arg/@cardinality)}</dt>,
                    <dd>{$arg/node()}</dd>
                )
            }
            </dl>
            <dl>
                <dt>Returns: {$desc/returns/@type/string()}{local:cardinality($desc/returns/@cardinality)}</dt>
                <dd>{$desc/returns/node()}</dd>
            </dl>
        </div>
    return
        util:serialize($help, "method=html5")
};

declare function local:generate-signature($func as element(function)) {
    $func/@name/string() || "(" ||
    string-join(
        for $param in $func/argument
        return
            "$" || $param/@var/string() || " as " || $param/@type/string() || local:cardinality($param/@cardinality),
        ", "
    ) ||
    ")"
};

declare function local:cardinality($cardinality as xs:string) {
    switch ($cardinality)
        case "zero or one" return "?"
        case "zero or more" return "*"
        case "one or more" return "+"
        default return ()
};

<functions xmlns:json="http://json.org/">
{
    local:builtin-modules()
}
</functions>