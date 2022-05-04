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

declare option exist:serialize "method=json indent=yes";

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

(:~
 : Resolve imported modules and return the signature of all functions and
 : variables to be displayed in the outline view
 :)
<functions xmlns:json='http://json.org'>
{
    let $uris := request:get-parameter("uri", ())
    let $sources := request:get-parameter("source", ())
    let $prefixes := request:get-parameter("prefix", ())
    let $base := request:get-parameter("base", ())
    for $uri at $i in $uris
    let $source := if (matches($sources[$i], "^(/|\w+:)")) then $sources[$i] else concat($base, "/", $sources[$i])
    return
            try {
                let $prefix := $prefixes[$i]
                let $module := inspect:inspect-module($source)
                return
                    <modules json:array='true' source='{$source}' prefix="{$prefix}">
                    {
                        for $desc in $module/function
                        let $name := $desc/@name/string()
                        (: fix namespace prefix to match the one in the import :)
                        let $name := concat($prefix, ":", substring-after($name, ":"))
                        return
                            <functions json:array="true">
								<name>{$name}</name>
								<signature>{local:generate-signature($desc)}</signature>
                                <visibility>
                                {
                                    if ($desc/annotation[@name="private"]) then
                                        "private"
                                    else
                                        "public"
                                }
                                </visibility>
							</functions>
                    }
                    {
                        for $var in $module/variable
                        (: fix namespace prefix to match the one in the import :)
                        let $name := concat($prefix, ":", substring-after($var/@name, ":"))
                        return
                            <variables json:array="true">{$name}</variables>
                    }
                    </modules>
            } catch * {
                ()
            }
}
</functions>
