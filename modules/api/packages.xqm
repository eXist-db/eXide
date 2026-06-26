(:
 :  eXide REST API — Package management handlers.
 :  Migrated from deployment.xq, upload.xq, util.xqm.
 :)
xquery version "3.1";

module namespace packages="http://exist-db.org/apps/eXide/api/packages";

import module namespace roaster="http://e-editiones.org/roaster";
import module namespace config="http://exist-db.org/xquery/apps/config" at "../config.xqm";
import module namespace dbutil="http://exist-db.org/xquery/dbutil" at "../dbutils.xqm";
import module namespace tmpl="http://exist-db.org/xquery/template" at "../tmpl.xqm";

declare namespace expath="http://expath.org/ns/pkg";
declare namespace repo="http://exist-db.org/xquery/repo";
declare namespace git="http://exist-db.org/eXide/git";

(: Handle difference between 4.x.x and 5.x.x releases of eXist :)
declare variable $packages:copy-resource :=
    let $fnNew := function-lookup(xs:QName("xmldb:copy-resource"), 4)
    return
        if (exists($fnNew)) then $fnNew
        else
            let $fnOld := function-lookup(xs:QName("xmldb:copy"), 3)
            return function($sourceCol, $sourceName, $targetCol, $targetName) {
                $fnOld($sourceCol, $targetCol, $sourceName)
            };

declare variable $packages:ANT_FILE :=
    <project default="xar" name="$$app$$">
        <xmlproperty file="expath-pkg.xml"/>
        <property name="project.version" value="${{package(version)}}"/>
        <property name="project.app" value="$$app$$"/>
        <property name="build.dir" value="build"/>
        <target name="xar">
            <mkdir dir="${{build.dir}}"/>
            <zip basedir="." destfile="${{build.dir}}/${{project.app}}-${{project.version}}.xar"
                excludes="${{build.dir}}/*"/>
        </target>
    </project>;

(:~
 : GET /api/packages — List installed packages.
 :
 : With ?collection=<path>, resolve and return the single package that owns
 : that collection (the same descriptor as GET /api/packages/{abbrev}), or
 : 404 if the path is not inside any installed app. This is the by-collection
 : lookup the editor uses to discover which app an open document belongs to;
 : without it a non-empty ?collection= was silently ignored and the full list
 : returned instead (discovered while investigating eXist-db/eXide#835).
 :)
declare function packages:list($request as map(*)) {
    let $collection := $request?parameters?collection
    return
        if (exists($collection) and $collection != "") then
            packages:get($request)
        else
            packages:list-all()
};

declare function packages:list-all() {
    let $root := repo:get-root()
    let $apps :=
        for $app in xmldb:get-child-collections($root)
        let $col := $root || $app
        let $expath := doc($col || "/expath-pkg.xml")/expath:package
        let $repo-meta := doc($col || "/repo.xml")/repo:meta
        where exists($expath)
        order by lower-case($app)
        return map {
            "abbrev": string($expath/@abbrev),
            "name": string($expath/@name),
            "title": string($expath/expath:title),
            "version": string($expath/@version),
            "type": string(($repo-meta/repo:type, "application")[1]),
            "target": string($repo-meta/repo:target),
            "path": $col
        }
    return map {
        "packages": array { $apps }
    }
};

(:~
 : POST /api/packages — Install .xar or create new app from template.
 :)
declare function packages:install($request as map(*)) {
    let $body := $request?body
    return
        if (exists($body?abbrev)) then
            (: Create new app from template :)
            packages:create-app($body)
        else
            (: Install uploaded .xar :)
            packages:install-xar($request)
};

(:~
 : GET /api/packages/{abbrev} — Package descriptor and metadata.
 : Also accepts ?collection= query param to look up by collection path.
 :)
declare function packages:get($request as map(*)) {
    let $abbrev := $request?parameters?abbrev
    let $collection := $request?parameters?collection
    (: If collection param given and abbrev is a wildcard placeholder, resolve from collection :)
    let $resolved-abbrev :=
        if (exists($collection) and $collection != "") then
            packages:abbrev-for-collection($collection)
        else $abbrev
    return
        if (empty($resolved-abbrev) or $resolved-abbrev = "") then
            roaster:response(404, "application/json",
                map { "error": "No package found for collection: " || ($collection, $abbrev)[1] })
        else
    let $col := repo:get-root() || $resolved-abbrev
    let $expath := doc($col || "/expath-pkg.xml")/expath:package
    let $repo-meta := doc($col || "/repo.xml")/repo:meta
    return
        if (exists($expath)) then
            let $user := sm:id()//sm:real/sm:username/string()
            let $is-admin := if ($user) then sm:is-dba($user) else false()
            let $target-col := "/db/" || string($repo-meta/repo:target)
            let $git-xml := doc($target-col || "/git.xml")
            return map {
                "abbrev": string($expath/@abbrev),
                "name": string($expath/@name),
                "title": string($expath/expath:title),
                "version": string($expath/@version),
                "type": string(($repo-meta/repo:type, "application")[1]),
                "target": string($repo-meta/repo:target),
                "root": $target-col,
                "url": "/" || string($repo-meta/repo:target),
                "deployed": string($repo-meta/repo:deployed),
                "description": string($repo-meta/repo:description),
                "authors": array { $repo-meta/repo:author ! string(.) },
                "website": string($repo-meta/repo:website),
                "path": $col,
                "isAdmin": $is-admin,
                "dir": string(($git-xml//git:directory, "")[1]),
                "autoSync": exists($git-xml//git:auto) and string($git-xml//git:auto) = "true",
                "liveReload": false(),
                "gitBranch": array {
                    if (exists($git-xml)) then
                        for $branch in $git-xml//git:branch
                        return string($branch)
                    else ()
                }
            }
        else
            roaster:response(404, "application/json",
                map { "error": "Package not found: " || ($resolved-abbrev, $abbrev)[1] })
};

(:~
 : DELETE /api/packages/{abbrev} — Uninstall package.
 :)
declare function packages:uninstall($request as map(*)) {
    let $abbrev := $request?parameters?abbrev
    let $col := repo:get-root() || $abbrev
    let $expath := doc($col || "/expath-pkg.xml")/expath:package
    return
        if (empty($expath)) then
            roaster:response(404, "application/json",
                map { "error": "Package not found: " || $abbrev })
        else
            try {
                let $_ := repo:remove($expath/@name)
                return map { "status": "ok" }
            } catch * {
                roaster:response(400, "application/json",
                    map { "error": $err:description })
            }
};

(:~
 : POST /api/packages/{abbrev}/build — Build .xar from source collection.
 :)
declare function packages:build($request as map(*)) {
    let $abbrev := $request?parameters?abbrev
    let $col := repo:get-root() || $abbrev
    let $expath := doc($col || "/expath-pkg.xml")/expath:package
    return
        if (empty($expath)) then
            roaster:response(404, "application/json",
                map { "error": "Package not found: " || $abbrev })
        else
            try {
                let $name := $expath/@abbrev || "-" || $expath/@version || ".xar"
                let $xar := compression:zip(xs:anyURI($col), true(), $col)
                return roaster:response(200, "application/zip", $xar,
                    map {
                        "Content-Disposition": "attachment; filename=" || $name
                    })
            } catch * {
                roaster:response(400, "application/json",
                    map { "error": $err:description })
            }
};

(:~
 : POST /api/packages/{abbrev}/deploy — Deploy package to target collection.
 :)
declare function packages:deploy($request as map(*)) {
    let $abbrev := $request?parameters?abbrev
    let $col := repo:get-root() || $abbrev
    let $expath := doc($col || "/expath-pkg.xml")/expath:package
    return
        if (empty($expath)) then
            roaster:response(404, "application/json",
                map { "error": "Package not found: " || $abbrev })
        else
            try {
                let $xar-name := $expath/@abbrev || "-" || $expath/@version || ".xar"
                let $xar := compression:zip(xs:anyURI($col), true(), $col)
                let $_ := packages:mkcol("/db/system/repo", (), ())
                let $pkg := xmldb:store("/db/system/repo", $xar-name, $xar, "application/zip")
                let $_ := (
                    repo:remove($expath/@name),
                    repo:install-and-deploy-from-db($pkg)
                )
                return map {
                    "status": "ok",
                    "path": $col
                }
            } catch * {
                roaster:response(400, "application/json",
                    map { "error": $err:description })
            }
};

(:~
 : POST /api/packages/{abbrev}/config — Apply collection.xconf and reindex.
 :)
declare function packages:config($request as map(*)) {
    let $abbrev := $request?parameters?abbrev
    let $body := $request?body
    let $collection := ($body?collection, repo:get-root() || $abbrev)[1]
    let $config-xml := doc($collection || "/" || $body?config)
    return
        try {
            let $config-col := "/db/system/config" || $collection
            let $_ := packages:mkcol($config-col, (), ())
            let $_ := xmldb:store($config-col, "collection.xconf", $config-xml, "application/xml")
            let $_ := xmldb:reindex($collection)
            return map {
                "status": "ok",
                "collection": $collection
            }
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};


(: ── Internal helpers ─────────────────────────────────────── :)

declare %private function packages:install-xar($request as map(*)) {
    let $body := $request?body
    return
        try {
            (: Body is expected to be a binary XAR :)
            let $_ := packages:mkcol("/db/system/repo", (), ())
            let $pkg := xmldb:store("/db/system/repo", "upload.xar", $body, "application/zip")
            let $descriptors := packages:get-xar-descriptors($pkg)
            let $app-name := $descriptors/expath:package/@name
            let $_ := (
                repo:remove($app-name),
                repo:install-and-deploy-from-db($pkg)
            )
            return
                roaster:response(201, "application/json", map {
                    "status": "ok",
                    "name": string($app-name),
                    "abbrev": string($descriptors/expath:package/@abbrev)
                })
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};

declare %private function packages:get-xar-descriptors($zipPath) {
    let $binary := util:binary-doc($zipPath)
    return
        if (exists($binary)) then
            let $dataCb := function($path as xs:anyURI, $type as xs:string, $data as item()?, $param as item()*) { $data }
            let $entryCb := function($path as xs:anyURI, $type as xs:string, $param as item()*) { $path = "expath-pkg.xml" }
            return compression:unzip($binary, $entryCb, (), $dataCb, ())
        else
            error(xs:QName("packages:not-found"), "XAR package not found: " || $zipPath)
};

declare %private function packages:create-app($body as map(*)) {
    let $abbrev := $body?abbrev
    let $template := ($body?template, "plain")[1]
    let $title := ($body?title, $abbrev)[1]
    let $name := ($body?name, "http://exist-db.org/apps/" || $abbrev)[1]
    let $version := ($body?version, "0.1")[1]
    let $target := ($body?target, $abbrev)[1]
    let $type := ($body?type, "application")[1]

    let $collection := repo:get-root() || $target
    let $user := sm:id()//sm:real/sm:username/string()
    let $group := sm:get-user-groups($user)[1]
    let $permissions := "rw-rw-r--"

    return
        try {
            let $_ := packages:mkcol($collection, ($user, $group), $permissions)

            (: Store expath-pkg.xml :)
            let $descriptor :=
                <package xmlns="http://expath.org/ns/pkg"
                    name="{$name}" abbrev="{$abbrev}"
                    version="{$version}" spec="1.0">
                    <title>{$title}</title>
                </package>
            let $_ := xmldb:store($collection, "expath-pkg.xml", $descriptor, "text/xml")

            (: Store repo.xml :)
            let $repo-meta :=
                <meta xmlns="http://exist-db.org/xquery/repo">
                    <description>{$title}</description>
                    <type>{$type}</type>
                    <target>{$target}</target>
                    <prepare>pre-install.xql</prepare>
                    <finish>post-install.xql</finish>
                </meta>
            let $_ := xmldb:store($collection, "repo.xml", $repo-meta, "text/xml")

            (: Copy template files if available :)
            let $template-col := $config:app-root || "/templates/" || $template
            let $_ :=
                if (xmldb:collection-available($template-col)) then
                    packages:copy-templates($collection, $template-col, ($user, $group), $permissions)
                else ()

            (: Store build.xml :)
            let $params :=
                <parameters>
                    <param name="app" value="{$abbrev}"/>
                </parameters>
            let $_ := xmldb:store($collection, "build.xml",
                tmpl:expand-template($packages:ANT_FILE, $params))

            return
                roaster:response(201, "application/json", map {
                    "status": "ok",
                    "path": $collection
                })
        } catch * {
            roaster:response(400, "application/json",
                map { "error": $err:description })
        }
};

declare %private function packages:mkcol($path, $userData as xs:string*, $permissions as xs:string?) {
    let $path := if (starts-with($path, "/db/")) then substring-after($path, "/db/") else $path
    return packages:mkcol-recursive("/db", tokenize($path, "/"), $userData, $permissions)
};

declare %private function packages:mkcol-recursive($collection, $components, $userData as xs:string*, $permissions as xs:string?) {
    if (exists($components)) then
        let $perms := if ($permissions) then packages:set-execute-bit($permissions) else "rwxr-x---"
        let $newColl := xs:anyURI(concat($collection, "/", $components[1]))
        let $exists := xmldb:collection-available($newColl)
        return (
            xmldb:create-collection($collection, $components[1]),
            if (exists($userData) and not($exists)) then (
                sm:chmod($newColl, $perms),
                sm:chown($newColl, $userData[1]),
                sm:chgrp($newColl, $userData[2])
            ) else (),
            packages:mkcol-recursive($newColl, subsequence($components, 2), $userData, $permissions)
        )
    else ()
};

declare %private function packages:set-execute-bit($permissions as xs:string) {
    replace($permissions, "(..).(..).(..).", "$1x$2x$3x")
};

(:~
 : Resolve a collection path (e.g. /db/apps/myapp/modules) to a package abbrev.
 : Walks up from the collection until it finds an expath-pkg.xml.
 :)
declare %private function packages:abbrev-for-collection($path as xs:string) as xs:string? {
    let $root := repo:get-root()
    (: Try each installed package to see if the collection is within its target :)
    return
        (for $app in xmldb:get-child-collections($root)
         let $col := $root || $app
         let $expath := doc($col || "/expath-pkg.xml")/expath:package
         where exists($expath) and starts-with($path, $col)
         return string($expath/@abbrev)
        )[1]
};

declare %private function packages:copy-templates($target as xs:string, $source as xs:string, $userData as xs:string+, $permissions as xs:string) {
    let $_ := packages:mkcol($target, $userData, $permissions)
    return
        if (xmldb:collection-available($source)) then (
            for $resource in xmldb:get-child-resources($source)
            let $targetPath := xs:anyURI(concat($target, "/", $resource))
            return (
                $packages:copy-resource($source, $resource, $target, $resource),
                let $mime := xmldb:get-mime-type($targetPath)
                let $perms :=
                    if ($mime eq "application/xquery") then packages:set-execute-bit($permissions)
                    else $permissions
                return (
                    sm:chmod($targetPath, $perms),
                    sm:chown($targetPath, $userData[1]),
                    sm:chgrp($targetPath, $userData[2])
                )
            ),
            for $childColl in xmldb:get-child-collections($source)
            return packages:copy-templates(
                concat($target, "/", $childColl),
                concat($source, "/", $childColl),
                $userData, $permissions)
        ) else ()
};
