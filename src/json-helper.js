/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2024 Wolfgang Meier
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
import { Document } from "./document.js";
import { ModeHelper } from "./mode-helper.js";

/**
 * JSON specific helper methods.
 */
export class JsonModeHelper extends ModeHelper {
    createOutline(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        let depth = 0;
        tree.iterate({
            enter(node) {
                if (node.name === "Property") {
                    const nameNode = node.node.getChild("PropertyName");
                    if (nameNode && depth < 3) {
                        let name = state.sliceDoc(nameNode.from, nameNode.to);
                        if (name.charAt(0) === '"') name = name.slice(1, -1);
                        const line = state.doc.lineAt(node.from);
                        const valNode = nameNode.nextSibling;
                        const valType = valNode ? valNode.name : "";
                        doc.functions.push({
                            type: Document.TYPE_FUNCTION,
                            name,
                            indent: depth,
                            source: doc.getPath(),
                            signature: `${name}: ${valType.toLowerCase()}`,
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    depth++;
                    return true;
                }
            },
            leave(node) {
                if (node.name === "Property") {
                    depth--;
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").JsonModeHelper = JsonModeHelper;
