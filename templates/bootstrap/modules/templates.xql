xquery version "3.0";

(:~
 : HTML templating module
 : 
 : @version 2.0
 : @author Wolfgang Meier
:)
module namespace templates="http://exist-db.org/xquery/templates";

import module namespace inspect="http://exist-db.org/xquery/inspection" at "java:org.exist.xquery.functions.inspect.InspectionModule";

declare namespace expath="http://expath.org/ns/pkg";

declare variable $templates:CONFIG_STOP_ON_ERROR := "stop-on-error";
declare variable $templates:CONFIG_APP_ROOT := "app-root";
declare variable $templates:CONFIG_ROOT := "root";

declare variable $templates:CONFIGURATION := "configuration";
declare variable $templates:CONFIGURATION_ERROR := QName("http://exist-db.org/xquery/templates", "ConfigurationError");
declare variable $templates:NOT_FOUND := QName("http://exist-db.org/xquery/templates", "NotFound");
declare variable $templates:TOO_MANY_ARGS := QName("http://exist-db.org/xquery/templates", "TooManyArguments");
declare variable $templates:PROCESSING_ERROR := QName("http://exist-db.org/xquery/templates", "ProcessingError");

(:~
 : Start processing the provided content. Template functions are looked up by calling the
 : provided function $resolver. The function should take a name as a string
 : and return the corresponding function item. The simplest implementation of this function could
 : look like this:
 : 
 : <pre>function($functionName as xs:string, $arity as xs:int) { function-lookup(xs:QName($functionName), $arity) }</pre>
 :
 : @param $content the sequence of nodes which will be processed
 : @param $resolver a function which takes a name and returns a function with that name
 : @param $model a sequence of items which will be passed to all called template functions. Use this to pass
 : information between templating instructions.
:)
declare function templates:apply($content as node()+, $resolver as function(xs:string, xs:int) as item()?, $model as map(*)?,
    $configuration as map(*)?) {
    let $model := if (exists($model)) then $model else map:new()
    let $configuration := 
        if (exists($configuration)) then 
            map:new(($configuration, map { "resolve" := $resolver }))
        else
            map { "resolve" := $resolver }
    let $model := map:new(($model, map:entry($templates:CONFIGURATION, $configuration)))
    for $root in $content
    return
        templates:process($root, $model)
};

declare function templates:apply($content as node()+, $resolver as function(xs:string, xs:int) as item()?, $model as map(*)?) {
    templates:apply($content, $resolver, $model, ())
};

(:~
 : Continue template processing on the given set of nodes. Call this function from
 : within other template functions to enable recursive processing of templates.
 :
 : @param $nodes the nodes to process
 : @param $model a sequence of items which will be passed to all called template functions. Use this to pass
 : information between templating instructions.
:)
declare function templates:process($nodes as node()*, $model as map(*)) {
    let $config := templates:get-configuration($model, "")
    for $node in $nodes
    return
        typeswitch ($node)
            case document-node() return
                for $child in $node/node() return templates:process($child, $model)
            case element() return
                let $instructions := templates:get-instructions($node/@class)
                return
                    if ($instructions) then
                        for $instruction in $instructions
                        return
                            templates:call($instruction, $node, $model)
                    else
                        element { node-name($node) } {
                            $node/@*, for $child in $node/node() return templates:process($child, $model)
                        }
            default return
                $node
};

declare %private function templates:get-instructions($class as xs:string?) as xs:string* {
    for $name in tokenize($class, "\s+")
    where templates:is-qname($name)
    return
        $name
};

declare %private function templates:get-configuration($model as map(*), $func as xs:string) {
    if (not(map:contains($model, $templates:CONFIGURATION))) then
        error($templates:CONFIGURATION_ERROR, "Configuration map not found in model. Tried to call: " || $func)
    else
        $model($templates:CONFIGURATION)
};

declare %private function templates:call($class as xs:string, $node as element(), $model as map(*)) {
    let $paramStr := substring-after($class, "?")
    let $parameters := templates:parse-parameters($paramStr)
    let $func := if ($paramStr) then substring-before($class, "?") else $class
    let $config := templates:get-configuration($model, $func)
    let $call := templates:resolve($func, $config("resolve"))
    return
        if (exists($call)) then
            templates:call-by-introspection($node, $parameters, $model, $call)
        else if ($model($templates:CONFIGURATION)("stop-on-error")) then
            error($templates:NOT_FOUND, "No template function found for call " || $func)
        else
            (: Templating function not found: just copy the element :)
            element { node-name($node) } {
                $node/@*, for $child in $node/node() return templates:process($child, $model)
            }
};

declare %private function templates:call-by-introspection($node as element(), $parameters as map(xs:string, xs:string), $model as map(*), 
    $fn as function(*)) {
    let $inspect := inspect:inspect-function($fn)
    let $args := templates:map-arguments($inspect, $parameters)
    return
        templates:process-output(
            $node,
            $model,
            templates:call-with-args($fn, $args, $node, $model),
            $inspect
        )
};

declare %private function templates:call-with-args($fn as function(*), $args as (function() as item()*)*, 
    $node as element(), $model as map(*)) {
    switch (count($args))
        case 0 return
            $fn($node, $model)
        case 1 return
            $fn($node, $model, $args[1]())
        case 2 return
            $fn($node, $model, $args[1](), $args[2]())
        case 3 return
            $fn($node, $model, $args[1](), $args[2](), $args[3]())
        case 4 return
            $fn($node, $model, $args[1](), $args[2](), $args[3](), $args[4]())
        case 5 return
            $fn($node, $model, $args[1](), $args[2](), $args[3](), $args[4](), $args[5]())
        case 6 return
            $fn($node, $model, $args[1](), $args[2](), $args[3](), $args[4](), $args[5](), $args[6]())
        case 7 return
            $fn($node, $model, $args[1](), $args[2](), $args[3](), $args[4](), $args[5](), $args[6](), $args[7]())
        case 8 return
            $fn($node, $model, $args[1](), $args[2](), $args[3](), $args[4](), $args[5](), $args[6](), $args[7](), $args[8]())
        default return
            error($templates:TOO_MANY_ARGS, "Too many arguments to function " || function-name($fn))
};

declare %private function templates:process-output($node as element(), $model as map(*), $output as item()*, 
    $inspect as element(function)) {
    let $wrap := 
        $inspect/annotation[ends-with(@name, ":wrap")]
            [@namespace = "http://exist-db.org/xquery/templates"]
    return
        if ($wrap) then
            element { node-name($node) } {
                $node/@*,
                templates:process-output($node, $model, $output)
            }
        else
            templates:process-output($node, $model, $output)
};

declare %private function templates:process-output($node as element(), $model as map(*), $output as item()*) {
    typeswitch($output)
        case map(*) return
            templates:process($node/node(), map:new(($model, $output)))
        default return
            $output
};

declare %private function templates:map-arguments($inspect as element(function), $parameters as map(xs:string, xs:string)) {
    let $args := $inspect/argument
    return
        if (count($args) > 2) then
            for $arg in subsequence($args, 3)
            return
                templates:map-argument($arg, $parameters)
        else
            ()
};

declare %private function templates:map-argument($arg as element(argument), $parameters as map(xs:string, xs:string)) 
    as function() as item()* {
    let $var := $arg/@var
    let $type := $arg/@type/string()
    let $reqParam := request:get-parameter($var, ())
    let $sessionParam := session:get-attribute($var)
    let $paramFromContext :=
        if (exists($reqParam)) then
            $reqParam
        else if (exists($sessionParam)) then
            $sessionParam
        else
            $parameters($var)
    let $param :=
        if (exists($paramFromContext)) then
            $paramFromContext
        else
            templates:arg-from-annotation($var, $arg)
    let $data :=
        try {
            templates:cast($param, $type)
        } catch * {
            error($templates:TYPE_ERROR, "Failed to cast parameter value '" || $param || "' to the required target type for " ||
                "template function parameter $" || $name || " of function " || ($arg/../@name) || ". Required type was: " ||
                $type || ". " || $err:description)
        }
    return
        function() {
            $data
        }
};

declare %private function templates:arg-from-annotation($var as xs:string, $arg as element(argument)) {
    let $anno := 
        $arg/../annotation[ends-with(@name, ":default")]
            [@namespace = "http://exist-db.org/xquery/templates"]
            [value[1] = $var]
    for $value in subsequence($anno/value, 2)
    return
        string($value)
};

declare %private function templates:resolve($func as xs:string, $resolver as function(xs:string, xs:int) as function(*)) {
    templates:resolve(2, $func, $resolver)
};

declare %private function templates:resolve($arity as xs:int, $func as xs:string, 
    $resolver as function(xs:string, xs:int) as function(*)) {
    if ($arity > 10) then
        ()
    else
        let $fn := $resolver($func, $arity)
        return
            if (exists($fn)) then
                $fn
            else
                templates:resolve($arity + 1, $func, $resolver)
};

declare %private function templates:parse-parameters($paramStr as xs:string?) as map(xs:string, xs:string) {
    map:new(
        for $param in tokenize($paramStr, "&amp;")
        let $key := substring-before($param, "=")
        let $value := substring-after($param, "=")
        where $key
        return
            map:entry($key, $value)
    )
};

declare %private function templates:is-qname($class as xs:string) as xs:boolean {
    matches($class, "^[^:]+:[^:]+")
};

declare %private function templates:cast($values as item()*, $targetType as xs:string) {
    for $value in $values
    return
        if ($targetType != "xs:string" and string-length($value) = 0) then
            (: treat "" as empty sequence :)
            ()
        else
            switch ($targetType)
                case "xs:string" return
                    string($value)
                case "xs:integer" case "xs:int" case "xs:long" return
                    xs:integer($value)
                case "xs:decimal" return
                    xs:decimal($value)
                case "xs:float" case "xs:double" return
                    xs:double($value)
                case "xs:date" return
                    xs:date($value)
                case "xs:dateTime" return
                    xs:dateTime($value)
                case "xs:time" return
                    xs:time($value)
                case "element()" return
                    util:parse($value)/*
                case "text()" return
                    text { string($value) }
                default return
                    $value
};

declare function templates:get-app-root($model as map(*)) as xs:string? {
    $model($templates:CONFIGURATION)($templates:CONFIG_APP_ROOT)
};

declare function templates:get-root($model as map(*)) as xs:string? {
    let $appRoot := templates:get-app-root($model)
    let $root := $model($templates:CONFIGURATION)($templates:CONFIG_ROOT)
    return
        if ($root) then $root else $appRoot
};

(:-----------------------------------------------------------------------------------
 : Standard templates
 :-----------------------------------------------------------------------------------:)
 
declare function templates:include($node as node(), $model as map(*), $path as xs:string) {
    let $appRoot := templates:get-app-root($model)
    let $root := templates:get-root($model)
    let $path := 
        if (starts-with($path, "/")) then
            (: Search template relative to app root :)
            concat($appRoot, "/", $path)
        else
            (: Locate template relative to HTML file :)
            concat($root, "/", $path)
    return
        templates:process(doc($path), $model)
};

declare function templates:surround($node as node(), $model as map(*), $with as xs:string, $at as xs:string?, $using as xs:string?) {
    let $appRoot := templates:get-app-root($model)
    let $root := templates:get-root($model)
    let $path :=
        if (starts-with($with, "/")) then
            (: Search template relative to app root :)
            concat($appRoot, $with)
        else
            (: Locate template relative to HTML file :)
            concat($root, "/", $with)
    let $content :=
        if ($using) then
            doc($path)//*[@id = $using]
        else
            doc($path)
    let $merged := templates:process-surround($content, $node, $at)
    return
        templates:process($merged, $model)
};

declare %private function templates:process-surround($node as node(), $content as node(), $at as xs:string) {
    typeswitch ($node)
        case document-node() return
            for $child in $node/node() return templates:process-surround($child, $content, $at)
        case element() return
            if ($node/@id eq $at) then
                element { node-name($node) } {
                    $node/@*, $content/node()
                }
            else
                element { node-name($node) } {
                    $node/@*, for $child in $node/node() return templates:process-surround($child, $content, $at)
                }
        default return
            $node
};

declare 
    %templates:wrap
function templates:each($node as node(), $model as map(*), $from as xs:string, $to as xs:string) {
    for $item in $model($from)
    return
        element { node-name($node) } {
            $node/@*, templates:process($node/node(), map:new(($model, map:entry($to, $item))))
        }
};

declare function templates:if-parameter-set($node as node(), $model as map(*), $param as xs:string) as node()* {
    let $param := request:get-parameter($param, ())
    return
        if ($param and string-length($param) gt 0) then
            templates:process($node/node(), $model)
        else
            ()
};

declare function templates:if-parameter-unset($node as node(), $model as item()*, $param as xs:string) as node()* {
    let $param := request:get-parameter($param, ())
    return
        if (not($param) or string-length($param) eq 0) then
            $node
        else
            ()
};

declare function templates:if-attribute-set($node as node(), $model as map(*), $attribute as xs:string) {
    let $isSet :=
        (exists($attribute) and request:get-attribute($attribute))
    return
        if ($isSet) then
            templates:process($node/node(), $model)
        else
            ()
};

declare function templates:if-module-missing($node as node(), $model as map(*), $uri as xs:string, $at as xs:string) {
    try {
        util:import-module($uri, "testmod", $at)
    } catch * {
        (: Module was not found: process content :)
        templates:process($node/node(), $model)
    }
};

declare function templates:load-source($node as node(), $model as map(*)) as node()* {
    let $href := $node/@href/string()
    let $link := templates:link-to-app("http://exist-db.org/apps/eXide", "index.html?open=" || templates:get-app-root($model) || "/" || $href)
    return
        element { node-name($node) } {
            attribute href { $link },
            attribute target { "_new" },
            $node/node()
        }
};

(:~
 : Locates the package identified by $uri and returns a path which can be used to link
 : to this package from within the HTML view of another package.
 : 
 : $uri the unique name of the package to locate
 : $relLink a relative path to be added to the returned path
 :)
declare function templates:link-to-app($uri as xs:string, $relLink as xs:string?) as xs:string {
    let $app := templates:resolve($uri)
    let $path := string-join((request:get-attribute("$exist:prefix"), $app, $relLink), "/")
    return
        replace($path, "/+", "/")
};

declare function templates:resolve($uri as xs:string) as xs:string {
    let $path := collection(repo:get-root())//expath:package[@name = $uri]
    return
        if ($path) then
            substring-after(util:collection-name($path), repo:get-root())
        else
            ()
};

(:~
    Processes input and select form controls, setting their value/selection to
    values found in the request - if present.
 :)
declare function templates:form-control($node as node(), $model as map(*)) as node()* {
    typeswitch ($node)
        case element(input) return
            let $name := $node/@name
            let $value := request:get-parameter($name, ())
            return
                if ($value) then
                    element { node-name($node) } {
                        $node/@* except $node/@value,
                        attribute value { $value },
                        $node/node()
                    }
                else
                    $node
        case element(select) return
            let $value := request:get-parameter($node/@name/string(), ())
            return
                element { node-name($node) } {
                    $node/@* except $node/@class,
                    for $option in $node/option
                    return
                        <option>
                        {
                            $option/@*,
                            if ($option/@value = $value) then
                                attribute selected { "selected" }
                            else
                                (),
                            $option/node()
                        }
                        </option>
                }
        default return
            $node
};

declare function templates:error-description($node as node(), $model as map(*)) {
    let $input := request:get-attribute("org.exist.forward.error")
    return
        element { node-name($node) } {
            $node/@*,
            util:parse($input)//message/string()
        }
};

declare function templates:copy-node($node as element(), $model as item()*) {
    element { node-name($node) } {
        $node/@*,
        templates:process($node/*, $model)
    }
};