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
xquery version "3.1";

import module namespace config="http://exist-db.org/xquery/apps/config" at "config.xqm";

declare namespace json="http://www.json.org";

declare option exist:serialize "method=json media-type=text/javascript";

declare function local:sub-collections($root as xs:string, $children as xs:string*, $user as xs:string) {
        for $child in $children
        let $processChild := 
    		local:collections(concat($root, '/', $child), $child, $user)
		where exists($processChild)
		order by $child ascending
        return
            <children json:array="true">
			    { $processChild }
			</children>
};

declare function local:collections($root as xs:string, $child as xs:string, 
	$user as xs:string) {
    if (sm:has-access(xs:anyURI($root), "x")) then
        let $children := xmldb:get-child-collections($root)
        let $canWrite := 
            (: local:canWrite($root, $user) :)
            sm:has-access(xs:anyURI($root), "w")
        return
            if (sm:has-access(xs:anyURI($root), "r")) then (
                <title>{xmldb:decode-uri(xs:anyURI($child))}</title>,
                <isFolder json:literal="true">true</isFolder>,
                <key>{xmldb:decode-uri(xs:anyURI($root))}</key>,
                <writable json:literal="true">{if ($canWrite) then 'true' else 'false'}</writable>,
                <addClass>{if ($canWrite) then 'writable' else 'readable'}</addClass>,
            	if (exists($children) ) then
                    local:sub-collections($root, $children, $user)
            	else
                ()
            ) else
                ()  
    else
        ()
};

declare function local:list-collection-contents($collection as xs:string, $user as xs:string) {
    let $subcollections := 
        for $child in xmldb:get-child-collections($collection)
        let $collpath := concat($collection, "/", $child)
        where sm:has-access(xs:anyURI($collpath), "r") and config:access-allowed($collpath, $user)
        return
            concat("/", $child)
    let $resources :=
        for $r in xmldb:get-child-resources($collection)
        where sm:has-access(xs:anyURI(concat($collection, "/", $r)), "r")
        return
            $r
    for $resource in ($subcollections, $resources)
	order by $resource ascending
	return
		$resource
};

declare function local:resources($collection as xs:string, $user as xs:string) {
    let $start := number(request:get-parameter("start", 0)) + 1
    let $endParam := number(request:get-parameter("end", 1000000)) + 1
    let $resources := local:list-collection-contents($collection, $user)
    let $count := count($resources) + 1
    let $end := if ($endParam gt $count) then $count else $endParam
    let $subset := subsequence($resources, $start, $end - $start + 1)
    let $parent := $start = 1 and $collection != "/db"
    return
        <json:value>
            <total json:literal="true">{count($resources) + (if ($parent) then 1 else 0)}</total>
            <items>
            {
                if ($parent) then
                    <json:value json:array="true">
                        <name>..</name>
                        <permissions></permissions>
                        <owner></owner>
                        <group></group>
                        <last-modified></last-modified>
                        <writable json:literal="true">
                        { sm:has-access(xs:anyURI($collection), "w") }
                        </writable>
                        <isCollection json:literal="true">true</isCollection>
                    </json:value>
                else
                    ()
            }
            {
                for $resource in $subset
                let $isCollection := starts-with($resource, "/")
                let $path := 
                    if ($isCollection) then
                        concat($collection, $resource)
                    else
                        concat($collection, "/", $resource)
                where sm:has-access(xs:anyURI($path), "r")
                order by $resource ascending
                return
                    let $permissions := sm:get-permissions(xs:anyURI($path))/sm:permission
                    let $owner := 
                        if ($isCollection) then
                            xmldb:get-owner($path)
                        else
                            xmldb:get-owner($collection, $resource)
                    let $group :=
                        if ($isCollection) then
                            xmldb:get-group($path)
                        else
                            xmldb:get-group($collection, $resource)
                    let $lastMod := 
                        let $date :=
                            if ($isCollection) then
                                xmldb:created($path)
                            else
                                xmldb:last-modified($collection, $resource)
                        return
                            if (xs:date($date) = current-date()) then
                                format-dateTime($date, "Today [H00]:[m00]:[s00]")
                            else
                                format-dateTime($date, "[M00]/[D00]/[Y0000] [H00]:[m00]:[s00]")
                    let $canWrite :=
                            sm:has-access(xs:anyURI($collection || "/" || $resource), "w")
                    return
                        <json:value json:array="true">
                            <name>{xmldb:decode-uri(if ($isCollection) then substring-after($resource, "/") else $resource)}</name>
                            <permissions>{if($isCollection)then "c" else "-"}{string($permissions/@mode)}{if($permissions/sm:acl/@entries ne "0")then "+" else ""}</permissions>
                            <owner>{$owner}</owner>
                            <group>{$group}</group>
                            <key>{xmldb:decode-uri(xs:anyURI($path))}</key>
                            <last-modified>{$lastMod}</last-modified>
                            <writable json:literal="true">{$canWrite}</writable>
                            <isCollection json:literal="true">{$isCollection}</isCollection>
                        </json:value>
            }
            </items>
        </json:value>
};

declare function local:create-collection($collName as xs:string, $user as xs:string) {
    let $parent := xmldb:encode-uri(request:get-parameter("collection", "/db"))
    return
        if (sm:has-access(xs:anyURI($parent), "w")) then
            let $null := xmldb:create-collection($parent, $collName)
            return
                <response status="ok"/>
        else
            <response status="fail">
                <message>You are not allowed to write to collection {xmldb:decode-uri(xs:anyURI($parent))}</message>
            </response>
};

declare function local:delete-collection($collName as xs:string, $user as xs:string) {
    if (sm:has-access(xs:anyURI($collName), "w")) then
        let $null := xmldb:remove($collName)
        return
            <response status="ok"/>
    else
        <response status="fail" item="{$collName}">
            <message>You are not allowed to write to collection {xmldb:decode-uri(xs:anyURI($collName))}</message>
        </response>
};

declare function local:delete-resource($collection as xs:string, $resource as xs:string+, $user as xs:string) {
    let $canWrite := 
        sm:has-access(xs:anyURI($collection || "/" || $resource), "w")
        and
        sm:has-access(xs:anyURI($collection), "w")
    return
    if ($canWrite) then
        let $removed := xmldb:remove($collection, $resource)
        return
            <response status="ok"/>
    else
        <response status="fail" item="{$resource}"/>
};

declare function local:delete($collection as xs:string, $selection as xs:string+, $user as xs:string) {
    let $result :=
        for $docOrColl in $selection
        let $docOrColl := xmldb:encode($docOrColl)
        let $path :=
            if (starts-with($docOrColl, "/")) then
                $docOrColl
            else
                $collection || "/" || $docOrColl
        let $isCollection := xmldb:collection-available($path)
        let $response :=
            if ($isCollection) then
                local:delete-collection($path, $user)
            else
                local:delete-resource($collection, $docOrColl, $user)
        return
            $response
    return
        if ($result/@status = "fail") then
            <response status="fail">
                <message>Deletion of the following items failed: {string-join($result/@item, ", ")}.</message>
            </response>
        else
            <response status="ok"/>
};

declare function local:copyOrMove($operation as xs:string, $target as xs:string, $sources as xs:string+, 
    $user as xs:string) {
    if (sm:has-access(xs:anyURI($target), "w")) then
        for $source in $sources
        let $isCollection := xmldb:collection-available($source)
        return
            try {
                if ($isCollection) then
                    let $null := 
                        switch ($operation)
                            case "move" return
                                xmldb:move($source, $target)
                            default return
                                xmldb:copy($source, $target)
                    return
                        <response status="ok"/>
                else
                    let $split := analyze-string($source, "^(.*)/([^/]+)$")//fn:group/string()
                    let $null := 
                        switch ($operation)
                            case "move" return
                                xmldb:move($split[1], $target, $split[2])
                            default return
                                xmldb:copy($split[1], $target, $split[2])
                    return
                        <response status="ok"/>
            } catch * {
                <response status="fail">
                    <message>{ $err:description }</message>
                </response>
            }
    else
        <response status="fail">
            <message>You are not allowed to write to collection {xmldb:decode-uri(xs:anyURI($target))}</message>
        </response>
};

declare function local:rename($collection as xs:string, $source as xs:string) {
    let $target := request:get-parameter("target", ())
    let $isCollection := xmldb:collection-available($collection || "/" || $source)
    return
        try {
            if ($isCollection) then
                let $null := 
                    xmldb:rename($collection || "/" || $source, $target)
                return
                    <response status="ok"/>
            else
                let $null := xmldb:rename($collection, $source, $target)
                return
                    <response status="ok"/>
        } catch * {
            <response status="fail">
                <message>{ $err:description }</message>
            </response>
        }
};

declare %private function local:merge-properties($maps as map(*)+) {
    map:new(
        for $key in map:keys($maps[1])
        let $values := distinct-values(for $map in $maps return $map($key))
        return
            map:entry($key, if (count($values) = 1) then $values[1] else "")
    )
};

declare %private function local:get-property-map($resource as xs:string) as map(*) {
    let $isCollection := xmldb:collection-available($resource)
    return
        if ($isCollection) then
            map {
                "owner" : xmldb:get-owner($resource),
                "group" : xmldb:get-group($resource),
                "last-modified" : format-dateTime(xmldb:created($resource), "[MNn] [D00] [Y0000] [H00]:[m00]:[s00]"),
                "permissions" : sm:get-permissions(xs:anyURI($resource))/sm:permission/string(@mode),
                "mime" : xmldb:get-mime-type(xs:anyURI($resource))
            }
        else
            let $components := analyze-string($resource, "^(.*)/([^/]+)$")//fn:group/string()
            return
                map {
                    "owner" : xmldb:get-owner($components[1], $components[2]),
                    "group" : xmldb:get-group($components[1], $components[2]),
                    "last-modified" : 
                        format-dateTime(xmldb:last-modified($components[1], $components[2]), "[MNn] [D00] [Y0000] [H00]:[m00]:[s00]"),
                    "permissions" : sm:get-permissions(xs:anyURI($resource))/sm:permission/string(@mode),
                    "mime" : xmldb:get-mime-type(xs:anyURI($resource))
                }
};

declare %private function local:get-properties($resources as xs:string*) as map(*) {
    local:merge-properties(for $resource in $resources return local:get-property-map($resource))
};

declare %private function local:checkbox($name as xs:string, $test as xs:boolean) {
    <input type="checkbox" name="{$name}" id="{$name}">
    {
        if ($test) then attribute checked { 'checked' } else ()
    }
    </input>
};

declare %private function local:get-permissions($perms as xs:string) {
    <table>
        <tr>
            <th>User</th>
            <th>Group</th>
            <th>Other</th>
        </tr>
        <tr>
            <td>
                { local:checkbox("ur", substring($perms, 1, 1) = "r") }
                <label for="ur">read</label>
            </td>
            <td>
                { local:checkbox("gr", substring($perms, 4, 1) = "r") }
                <label for="gr">read</label>
            </td>
            <td>
                { local:checkbox("or", substring($perms, 7, 1) = "r") }
                <label for="or">read</label>
            </td>
        </tr>
        <tr>
            <td>
                { local:checkbox("uw", substring($perms, 2, 1) = "w") }
                <label for="uw">write</label>
            </td>
            <td>
                { local:checkbox("gw", substring($perms, 5, 1) = "w") }
                <label for="gw">write</label>
            </td>
            <td>
                { local:checkbox("ow", substring($perms, 8, 1) = "w") }
                <label for="ow">write</label>
            </td>
        </tr>
        <tr>
            <td>
                { local:checkbox("ux", substring($perms, 3, 1) = ("x", "s")) }
                <label for="ux">execute</label>
            </td>
            <td>
                { local:checkbox("gx", substring($perms, 6, 1) = ("x", "s")) }
                <label for="gx">execute</label>
            </td>
            <td>
                { local:checkbox("ox", substring($perms, 9, 1) = ("x", "t")) }
                <label for="ox">execute</label>
            </td>
        </tr>
        <tr>
            <td>
                { local:checkbox("us", substring($perms, 3, 1) = ("s", "S")) }
                <label for="us">setuid</label>
            </td>
            <td>
                { local:checkbox("gs", substring($perms, 6, 1) = ("s", "S")) }
                <label for="gs">setgid</label>
            </td>
            <td>
                { local:checkbox("ot", substring($perms, 9, 1) = ("t", "T")) }
                <label for="ot">sticky</label>
            </td>
        </tr>
    </table>
};

declare %private function local:get-users() {
    distinct-values(
        for $group in sm:get-groups()
        return
            try {
                sm:get-group-members($group)
            } catch * {
                ()
            }
    )
};

declare function local:edit-properties($resources as xs:string*) {
    util:declare-option("exist:serialize", "media-type=text/html method=html5"),
    let $props := local:get-properties($resources)
    let $users := local:get-users()
    return
        <form id="browsing-dialog-form" action="">
            <fieldset>
                {
                    if ($props("mime") != "") then
                        <div class="control-group">
                            <label for="mime">Mime:</label>
                            <input type="text" name="mime" value="{$props('mime')}"/>
                        </div>
                    else
                        ()
                }
                <div class="control-group">
                    <label for="owner">Owner:</label>
                    <select name="owner">
                    {
                        for $user in $users
                        order by $user
                        return
                            <option value="{$user}">
                            {
                                if ($user = $props("owner")) then
                                    attribute selected { "selected" }
                                else
                                    (),
                                $user
                            }
                            </option>
                    }
                    </select>
                </div>
                <div class="control-group">
                    <label for="group">Group:</label>
                    <select name="group">
                    {
                        for $group in sm:get-groups()
                        order by $group
                        return
                            <option value="{$group}">
                            {
                                if ($group = $props("group")) then
                                    attribute selected { "selected" }
                                else
                                    (),
                                $group
                            }
                            </option>
                    }
                    </select>
                </div>
            </fieldset>
            <fieldset>
                <legend>Permissions</legend>
                { local:get-permissions($props("permissions")) }
            </fieldset>
        </form>
};

declare %private function local:permissions-from-form() {
    
    let $rwx := 
        for $type in ("u", "g", "o")
        for $perm in ("r", "w", "x")
        let $param := request:get-parameter($type || $perm, ())
        return
            concat(
                $type, 
                if($param)then "+" else "-",
                $perm
            )
    let $special := (
        concat("u", if(request:get-parameter("us", ()))then "+" else "-", "s"),
        concat("g", if(request:get-parameter("gs", ()))then "+" else "-", "s"),
        concat("o", if(request:get-parameter("ot", ()))then "+" else "-", "t")
    )
    return
        string-join($rwx, ",") || "," || string-join($special, ",")
};

declare function local:change-properties($resources as xs:string*) {
    let $owner := request:get-parameter("owner", ())
    let $group := request:get-parameter("group", ())
    let $mime := request:get-parameter("mime", ())
    for $resource in $resources
    let $uri := xs:anyURI($resource)
    let $permFromForm := local:permissions-from-form()
    let $log := util:log("INFO", ("permissions: ", $permFromForm))
    return (
        sm:chown($uri, $owner),
        sm:chgrp($uri, $group),
        sm:chmod($uri, $permFromForm),
        if ($mime) then
            xmldb:set-mime-type($uri, $mime)
        else
            ()
    ),
    <response status="ok"/>
};

let $deleteCollection := request:get-parameter("remove", ())
let $deleteResource := request:get-parameter("remove[]", ())
let $properties := request:get-parameter("properties[]", ())
let $modify := request:get-parameter("modify[]", ())
let $copy := request:get-parameter("copy[]", ())
let $move := request:get-parameter("move[]", ())
let $rename := request:get-parameter("rename", ())
let $createCollection := request:get-parameter("create", ())
let $view := request:get-parameter("view", "c")
let $collection := request:get-parameter("root", "/db")
let $collName := replace($collection, "^.*/([^/]+$)", "$1")
let $user := if (request:get-attribute('org.exist.login.user')) then request:get-attribute('org.exist.login.user') else "guest"
return
    try {
        if (exists($copy)) then
            let $result := local:copyOrMove("copy", xmldb:encode-uri($collection), $copy, $user)
            return
                ($result[@status = "fail"], $result[1])[1]
        else if (exists($move)) then
            let $result := local:copyOrMove("move", xmldb:encode-uri($collection), $move, $user)
            return
                ($result[@status = "fail"], $result[1])[1]
        else if (exists($rename)) then
            local:rename($collection, xmldb:encode-uri($rename))
        else if (exists($deleteResource)) then
            local:delete(xmldb:encode-uri($collection), $deleteResource, $user)
        else if (exists($properties)) then
            local:edit-properties($properties)
        else if (exists($modify)) then
            local:change-properties($modify)
        else if ($createCollection) then
            local:create-collection(xmldb:encode-uri($createCollection), $user)
        else if ($view eq "c") then
            <collection json:array="true">
                {local:collections(xmldb:encode-uri($collection), xmldb:encode-uri($collName), $user)}
            </collection>
        else
            local:resources(xmldb:encode-uri($collection), $user)
    } catch * {
        <response status="fail">{$err:description}</response>
    }
