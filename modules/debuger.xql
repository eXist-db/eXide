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

import module namespace sandbox="http://exist-db.org/xquery/sandbox" at "session.xql";

let $action := request:get-parameter("action", ())
let $session := request:get-parameter("session", ())
let $response-template := function($s, $r, $a, $f){
    <dbgr session="{$s}" resource="{$r}" action="{$a}">
        {$f()}
    </dbgr>
}
return
    switch ($action)
        case ("init") return
            let $res := request:get-parameter("resource", ())
            let $session := dbgr:init($res)
            return 
                <dbgr session="{$session}" resource="{$res}" action="{$action}">
                    {
                        try{dbgr:context-get($session)} catch * {()},
                        try{dbgr:stack-get($session)} catch * {()}
                    }
                </dbgr>
            
        
        case ("step") return
            let $session := request:get-parameter("session", ())
            let $res := dbgr:step-over($session)
            return
                <dbgr session="{$session}" result="{$res}" action="{$action}">
                    {
                        try{dbgr:context-get($session)} catch * {()},
                        try{dbgr:stack-get($session)} catch * {()}
                    }
                </dbgr>
            
        case ("step-into") return
            let $session := request:get-parameter("session", ())
            let $res := dbgr:step-into($session)
            return
                <dbgr session="{$session}" result="{$res}" action="{$action}">
                    {
                        try{dbgr:context-get($session)} catch * {()},
                        try{dbgr:stack-get($session)} catch * {()}
                    }
                </dbgr>

        case ("step-out") return
            let $session := request:get-parameter("session", ())
            let $res := dbgr:step-out($session)
            return
                <dbgr session="{$session}" res="{$res}" action="{$action}">
                    {
                        try{dbgr:context-get($session)} catch * {()},
                        try{dbgr:stack-get($session)} catch * {()}
                    }
                </dbgr>

        case ("stop") return
            let $session := request:get-parameter("session", ())
            let $res := dbgr:stop($session)
            return
                <dbgr session="{$session}" res="{$res}" action="{$action}">
                    {
                        try{dbgr:context-get($session)} catch * {()},
                        try{dbgr:stack-get($session)} catch * {()}
                    }
                </dbgr>

        case ("set-breack-point") return ()
        default return <dbgr>Unknown action {$action}</dbgr>
