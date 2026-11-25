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
 * Markdown specific helper methods.
 */
export class MarkdownModeHelper extends ModeHelper {
    createOutline(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        tree.iterate({
            enter(node) {
                let level = 0;
                if (node.name === "ATXHeading1") level = 1;
                else if (node.name === "ATXHeading2") level = 2;
                else if (node.name === "ATXHeading3") level = 3;
                else if (node.name === "ATXHeading4") level = 4;
                else if (node.name === "ATXHeading5") level = 5;
                else if (node.name === "ATXHeading6") level = 6;
                if (level > 0) {
                    let text = state.sliceDoc(node.from, node.to);
                    text = text.replace(/^#+\s*/, "");
                    const line = state.doc.lineAt(node.from);
                    doc.functions.push({
                        type: Document.TYPE_FUNCTION,
                        name: text,
                        indent: level - 1,
                        source: doc.getPath(),
                        signature: `h${level}: ${text}`,
                        sort: String(line.number).padStart(6, "0"),
                        row: line.number - 1,
                        from: node.from,
                        to: node.to
                    });
                    return false;
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").MarkdownModeHelper = MarkdownModeHelper;
