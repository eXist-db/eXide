/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2011-2013 Wolfgang Meier
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
import { editorUtils } from "./editor-utils.js";

/**
 * Represents an open document.
 */
export class Document {
    static TYPE_FUNCTION = "function";
    static TYPE_VARIABLE = "variable";
    static TYPE_TEMPLATE = "template";

    constructor(name, path, stateOrText) {
        this.name = name;
        this.path = path.replace(/\/{2,}/g, "/");
        this.mime = null;
        this.syntax = "xquery";
        this.saved = false;
        this.editable = true;
        this.functions = [];
        this.helper = null;
        this.externalLink = null;
        this.lastChangeEvent = new Date().getTime();
        this.lastValidation = 0;
        this.lastParsed = 0;
        this.ast = null;

        // CM6: store the document text; the EditorState will be created
        // when the document is activated (switched to) in the editor
        if (typeof stateOrText === "string") {
            this._text = stateOrText;
        } else {
            this._text = stateOrText || "";
        }
        // Cursor position to restore when switching back
        this._cursorOffset = 0;
        // Stored annotations for this document
        this._annotations = [];
    }

    needsValidation() {
        if (this.isNew() && this.isSaved()) {
            return false;
        }
        return !this.ast || this.lastChangeEvent > this.lastValidation;
    }

    getText() {
        // If the document is active, get text from the view
        if (this._view) {
            return this._view.state.doc.toString();
        }
        return this._text;
    }

    setText(text) {
        if (this._view) {
            this._view.dispatch({
                changes: { from: 0, to: this._view.state.doc.length, insert: text }
            });
        } else {
            this._text = text;
        }
    }

    getName() {
        return this.name;
    }

    getPath() {
        return this.path;
    }

    setPath(path) {
        this.path = path;
    }

    getBasePath() {
        return this.path.replace(/(^.+)\/[^/]*$/, "$1");
    }

    getMime() {
        return this.mime;
    }

    setMime(mimeType) {
        this.mime = mimeType;
    }

    getSyntax() {
        return this.syntax;
    }

    setSyntax(syntax) {
        this.syntax = syntax;
    }

    /**
     * getSession() returns the EditorView for CM6 compatibility with mode helpers.
     * Mode helpers that call doc.getSession() will get the view instance.
     */
    getSession() {
        return this._view;
    }

    isSaved() {
        return this.saved;
    }

    isNew() {
        return /__new__/.test(this.path);
    }

    isEditable() {
        return this.editable;
    }

    isXQuery() {
        return this.mime === "application/xquery";
    }

    setModeHelper(mode) {
        this.helper = mode;
    }

    getModeHelper() {
        return this.helper;
    }

    getCurrentLine() {
        if (this._view) {
            return editorUtils.offsetToRowCol(this._view.state, this._view.state.selection.main.head).row;
        }
        return 0;
    }

    getLastChanged() {
        return this.lastChangeEvent;
    }

    getExternalLink() {
        return this.externalLink;
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").Document = Document;
