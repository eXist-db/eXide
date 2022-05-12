xquery version "3.0";

import module namespace config="http://exist-db.org/xquery/apps/config" at "config.xqm";

declare namespace json="http://www.json.org";

declare option exist:serialize "method=text media-type=text/plain";

let $template := request:get-parameter("template", ())
return
    if ($template) then
        let $data := doc($config:app-root || "/templates/documents.xml")//template[@name = $template]/code/text()
        return
            replace($data, "^\s+", "")
    else (
        util:declare-option("exist:serialize", "method=json media-type=application/json"),
        <templates>
        {
            let $templates := doc($config:app-root || "/templates/documents.xml")//template
            for $group in distinct-values($templates/@mode)
            return
                element { $group } {
                    for $template in $templates[@mode = $group]
                    return
                        <json:value json:array="true">{ $template/@name, $template/description }</json:value>
                }
        }
        </templates>
    )
        