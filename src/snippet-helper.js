/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2013 Wolfgang Meier
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { namespace } from "./namespace.js";
import { ModeHelper } from "./mode-helper.js";
import { Snippets } from "./snippets.js";
import { oop } from "./oop.js";

/**
 * XML specific helper methods.
 */
export const SnippetModeHelper = (function () {
    
    const Constr = function(editor) {
		this.parent = editor;
		this.editor = this.parent.editor;
	};
	
	oop.inherit(Constr, ModeHelper);

    Constr.prototype.documentSaved = function(doc) {
        const code = doc.getText();
        const mode = doc.getName().replace(/\.snippets/, "");
        Snippets.reload(mode, code);
    };
    
	return Constr;
}());

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").SnippetModeHelper = SnippetModeHelper;
