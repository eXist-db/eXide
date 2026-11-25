/*
 *  eXide - web-based XQuery IDE
 *
 *  Copyright (C) 2011 Wolfgang Meier
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
import { editorUtils } from "./editor-utils.js";
import { ModeHelper } from "./mode-helper.js";
import { Dialog, util } from "./util.js";

/**
 * XML specific helper methods.
 */
export class XMLModeHelper extends ModeHelper {
    constructor(editor, menubar) {
        super(editor);
        const self = this;

        this.menu = document.getElementById("menu-xml");
        this.menu.style.display = "none";
        menubar.click("#menu-xml-rename", () => {
            self.rename(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-select-element", () => {
            self.selectElement(editor.getActiveDocument());
        });
        menubar.click("#menu-xml-remove-tag", () => {
            self.deleteTags(editor.getActiveDocument());
        });
        this.addCommand("closeTag", this.closeTag);
        this.addCommand("removeTags", this.deleteTags);
        this.addCommand("suggest", this.suggest);
        this.addCommand("rename", this.rename);
        this.addCommand("expandSelection", this.selectElement);
    }

    activate(doc) {
        this.menu.style.display = "";
    }

    deactivate(doc) {
        this.menu.style.display = "none";
    }

    createOutline(doc, onComplete) {
        const state = this.editor.state;
        const tree = CM6.ensureSyntaxTree(state, state.doc.length, 5000) || CM6.syntaxTree(state);
        let depth = 0;
        const pathStack = [];    // track XPath steps with positional predicates
        const siblingStack = [{}]; // stack of { tagName: count } maps per depth
        tree.iterate({
            enter(node) {
                // Skip SelfClosingTag when it's a child of Element (already handled)
                if (node.name === "SelfClosingTag" && node.node.parent && node.node.parent.name === "Element") {
                    return false;
                }
                if (node.name === "Element" || node.name === "SelfClosingTag") {
                    let tagNameNode = null;
                    const attrs = [];
                    let child = node.node.firstChild;
                    while (child) {
                        if (child.name === "TagName") {
                            tagNameNode = child;
                        } else if (child.name === "OpenTag" || child.name === "SelfClosingTag") {
                            let gc = child.firstChild;
                            while (gc) {
                                if (gc.name === "TagName") tagNameNode = gc;
                                if (gc.name === "Attribute") {
                                    let an = gc.firstChild;
                                    let aname = null;
                                    let aval = null;
                                    while (an) {
                                        if (an.name === "AttributeName") aname = state.sliceDoc(an.from, an.to);
                                        if (an.name === "AttributeValue") {
                                            aval = state.sliceDoc(an.from, an.to);
                                            if (aval.charAt(0) === '"' || aval.charAt(0) === "'") aval = aval.slice(1, -1);
                                        }
                                        an = an.nextSibling;
                                    }
                                    if (aname) attrs.push({ name: aname, value: aval || "" });
                                }
                                gc = gc.nextSibling;
                            }
                        }
                        child = child.nextSibling;
                    }
                    if (tagNameNode) {
                        const tagName = state.sliceDoc(tagNameNode.from, tagNameNode.to);
                        // Track sibling position at current depth
                        const siblings = siblingStack[siblingStack.length - 1];
                        siblings[tagName] = (siblings[tagName] || 0) + 1;
                        const step = `${tagName}[${siblings[tagName]}]`;
                        pathStack.push(step);
                        siblingStack.push({}); // new sibling scope for children
                        let hint = "";
                        const chosen = pickAttr(attrs);
                        if (chosen) {
                            hint = chosen.value;
                            if (hint.length > 30) hint = `${hint.substring(0, 30)}…`;
                        }
                        const xpath = `/${pathStack.join("/")}`;
                        const line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: Document.TYPE_FUNCTION,
                            name: tagName,
                            indent: depth,
                            hint,
                            outlineClass: "outline-element",
                            source: doc.getPath(),
                            signature: xpath,
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    } else {
                        pathStack.push("?");
                        siblingStack.push({});
                    }
                    depth++;
                } else if (node.name === "Comment") {
                    let text = state.sliceDoc(node.from, node.to);
                    text = text.replace(/^<!--\s*/, "").replace(/\s*-->$/, "");
                    if (text.length > 40) text = `${text.substring(0, 40)}…`;
                    if (text) {
                        const line = state.doc.lineAt(node.from);
                        doc.functions.push({
                            type: Document.TYPE_FUNCTION,
                            name: text,
                            indent: depth,
                            outlineClass: "outline-comment",
                            source: doc.getPath(),
                            signature: state.sliceDoc(node.from, Math.min(node.to, node.from + 120)),
                            sort: String(line.number).padStart(6, "0"),
                            row: line.number - 1,
                            from: node.from,
                            to: node.to
                        });
                    }
                    return false;
                }
            },
            leave(node) {
                if (node.name === "Element" || node.name === "SelfClosingTag") {
                    depth--;
                    pathStack.pop();
                    siblingStack.pop();
                }
            }
        });
        this.collectErrors(doc);
        if (onComplete) onComplete(doc);
    }

    async closeTag(doc, text, row) {
        const $this = this;
        try {
            const response = await fetch("check/", {
                method: "PUT",
                headers: { "Content-Type": "application/octet-stream" },
                body: text
            });
            const data = await response.json();
            if (data.status && data.status === "invalid") {
                const line = parseInt(data.message.line) - 1;
                if (line <= row) {
                    const tag = /element type "([^"]+)"/.exec(data.message["#text"]);
                    if (tag && tag.length > 0) {
                        const pos = $this.editor.state.selection.main.head;
                        const text = `${tag[1]}>`;
                        $this.editor.dispatch({
                            changes: { from: pos, insert: text },
                            selection: { anchor: pos + text.length }
                        });
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    async validate(doc, code, onComplete) {
        const $this = this;
        try {
            const response = await fetch("api/editor/validate", {
                method: "POST",
                headers: { "Content-Type": "application/xml" },
                body: code
            });
            let data = await response.json();
            // A body that isn't well-formed never reaches the handler:
            // Roaster fails to parse it and answers with its own error
            // envelope, which carries no `status`. Treated as a normal
            // response that just wasn't "invalid", the editor would clear
            // the error list and report the document as clean.
            if (!response.ok || !data.status) {
                const reported = data.value || data.description;
                const located = wellFormednessError(code, reported);
                data = {
                    status: "invalid",
                    grammar: "none",
                    errors: [{ line: located.line, message: located.message }]
                };
            }
            $this.compileError(data, doc);
            onComplete.call(null, true);
        } catch (err) {
            onComplete.call(null, true);
            console.log("Compile error: %s", err);
        }
    }

    compileError(data, doc) {
        console.log("Validation returned %o", data);
        if (data.status && data.status === "invalid") {
            const errors = data.errors || [];
            const annotations = [];
            for (let i = 0; i < errors.length; i++) {
                annotations.push({
                    row: parseInt(errors[i].line) - 1,
                    text: errors[i].message,
                    type: "error"
                });
            }
            if (errors.length > 0) {
                this.parent.clearValidationStatus();
                this.parent.updateStatus(errors[0].message, `${doc.getPath()}#${errors[0].line}`);
            }
            editorUtils.setAnnotations(this.editor, annotations);
        } else {
            this.parent.clearErrors();
            this.parent.setValidationStatus(
                data.schema ? `Validated against ${data.schema}` : "Well-formed only"
            );
        }
    }

    documentSaved(doc) {
        if (/.*\.xconf$/.test(doc.getName())) {
            const collection = doc.getBasePath();
            Dialog.input("Apply Configuration?", `You have saved a collection configuration file. Would you like to ` +
                `apply it to collection ${collection.replace(/^\/db\/system\/config/, "")} now?`, async () => {
                    util.message("Apply configuration and reindex...");
                    const basePath = doc.getBasePath();
                    // Extract app abbrev from /db/system/config/db/apps/{abbrev}/...
                    const pathParts = basePath.replace(/^\/db\/system\/config/, "").split("/").filter(Boolean);
                    const abbrev = pathParts.length >= 2 ? pathParts[1] : pathParts[0] || "unknown";
                    try {
                        const response = await fetch(`api/packages/${encodeURIComponent(abbrev)}/config`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ collection: basePath, config: doc.getName() })
                        });
                        const data = await response.json();
                        if (data.error) {
                            util.error(`Failed to apply configuration: ${data.error}`);
                        } else {
                            util.success("Configuration applied.");
                        }
                    } catch (err) {
                        util.error(`Failed to apply configuration: ${err}`);
                    }
            }, { action: "Apply" });
        }
    }

    /**
     * Find matching start/end tags using text-based search.
     * Replaces the TokenIterator-based approach.
     */
    findStartEndTags(doc) {
        const text = doc.getText();
        const cursorOffset = this.editor.state.selection.main.head;

        // Find all tags in the document
        const tagRe = /<\/?([a-zA-Z][\w:\-.]*)(?:\s[^>]*)?\/?>/g;
        const stack = [];
        let match;
        let startTag = null, endTag = null;

        while ((match = tagRe.exec(text)) !== null) {
            const tagStart = match.index;
            const tagEnd = tagStart + match[0].length;
            const isClose = match[0].charAt(1) === "/";
            const isSelfClose = match[0].charAt(match[0].length - 2) === "/";
            const tagName = match[1];

            if (isSelfClose) {
                if (cursorOffset >= tagStart && cursorOffset <= tagEnd) {
                    const nameStart = tagStart + 1;
                    startTag = {
                        name: tagName,
                        nameOffset: nameStart,
                        offset: tagStart
                    };
                    break;
                }
                continue;
            }

            if (!isClose) {
                const nameStart = tagStart + 1; // after '<'
                stack.push({
                    name: tagName,
                    nameOffset: nameStart,
                    offset: tagStart
                });
                if (cursorOffset >= tagStart && cursorOffset <= tagEnd) {
                    startTag = stack[stack.length - 1];
                }
            } else {
                const last = stack.pop();
                const nameStart = tagStart + 2; // after '</'
                if (startTag === last || (cursorOffset >= tagStart && cursorOffset <= tagEnd)) {
                    if (!startTag) startTag = last;
                    endTag = {
                        name: tagName,
                        nameOffset: nameStart,
                        offset: tagStart
                    };
                    break;
                }
                if (startTag && startTag === last) {
                    endTag = {
                        name: tagName,
                        nameOffset: nameStart,
                        offset: tagStart
                    };
                    break;
                }
            }
        }
        return { start: startTag, end: endTag };
    }

    selectElement(doc) {
        const tags = this.findStartEndTags(doc, false);
        if (!tags.start || !tags.end) return;

        const text = doc.getText();
        const startOffset = tags.start.offset;
        const endIdx = text.indexOf(">", tags.end.offset);
        if (endIdx < 0) return;
        const endOffset = endIdx + 1;

        this.editor.dispatch({
            selection: { anchor: startOffset, head: endOffset }
        });
    }

    rename(doc) {
        const tags = this.findStartEndTags(doc);
        if (!tags.start) {
            util.message("Place cursor inside an element tag first.");
            return;
        }

        const startFrom = tags.start.nameOffset;
        const startTo = startFrom + tags.start.name.length;

        if (tags.end) {
            // Multi-cursor: select both open and close tag names
            const endFrom = tags.end.nameOffset;
            const endTo = endFrom + tags.end.name.length;
            const ranges = [
                CM6.EditorSelection.range(startFrom, startTo),
                CM6.EditorSelection.range(endFrom, endTo)
            ];
            ranges.sort((a, b) => { return a.from - b.from; });
            this.editor.dispatch({
                selection: CM6.EditorSelection.create(ranges)
            });
            this.editor.dispatch({
                effects: CM6.EditorView.scrollIntoView(startFrom, { y: "center" })
            });
            editorUtils.flashLine(this.editor, startFrom);
        } else {
            // Self-closing or unmatched: select just the open tag name
            this.editor.dispatch({
                selection: { anchor: startFrom, head: startTo }
            });
            editorUtils.flashLine(this.editor, startFrom);
        }
        this.editor.focus();
    }

    deleteTags(doc) {
        const tags = this.findStartEndTags(doc, false);
        if (!tags.start || !tags.end) return;

        const text = doc.getText();
        // Remove end tag first (so offsets for start tag remain valid)
        const endStart = tags.end.offset;
        const endEnd = text.indexOf(">", endStart);
        if (endEnd >= 0) {
            this.editor.dispatch({
                changes: { from: endStart, to: endEnd + 1 }
            });
        }

        // Remove start tag (re-read text since doc changed)
        const startStart = tags.start.offset;
        const currentText = this.editor.state.doc.toString();
        const startEnd = currentText.indexOf(">", startStart);
        if (startEnd >= 0) {
            this.editor.dispatch({
                changes: { from: startStart, to: startEnd + 1 }
            });
        }
    }
}

const ATTR_PRIORITY = { "xml:id": 0, "id": 1, "n": 2, "class": 3 };

function pickAttr(attrs) {
    if (attrs.length === 0) return null;
    if (attrs.length === 1) return attrs[0];
    let best = attrs[0];
    let bestRank = ATTR_PRIORITY[best.name] !== undefined ? ATTR_PRIORITY[best.name] : 99;
    for (let i = 1; i < attrs.length; i++) {
        const rank = ATTR_PRIORITY[attrs[i].name] !== undefined ? ATTR_PRIORITY[attrs[i].name] : 99;
        if (rank < bestRank) { best = attrs[i]; bestRank = rank; }
    }
    return best;
}

/**
 * Locate a well-formedness error in the document itself.
 *
 * The server cannot help with the position: Roaster rejects an unparseable
 * body before the handler runs, and the line it reports belongs to its own
 * module. The browser's parser knows where the document broke, so take the
 * line from there — but not the wording, which is written for rendering a
 * page ("This page contains the following errors ... Below is a rendering
 * of the page up to the first error") and reads oddly in an editor.
 *
 * Returns { line, message }, falling back to line 1 and the server's own
 * message when no position can be recovered.
 */
function wellFormednessError(code, serverMessage) {
    let line = 1;
    let browserDetail = null;
    try {
        const parsed = new DOMParser().parseFromString(code, "application/xml");
        const failure = parsed.querySelector("parsererror");
        if (failure) {
            const text = (failure.textContent || "").replace(/\s+/g, " ").trim();
            const at = text.match(/line\s+(\d+)/i);
            if (at) { line = parseInt(at[1], 10); }
            // Keep the diagnosis, drop the page-rendering boilerplate.
            const detail = text
                .replace(/^.*?following errors:\s*/i, "")
                .replace(/\s*Below is a rendering of the page.*$/i, "")
                .trim();
            if (detail) { browserDetail = detail; }
        }
    } catch {
        // Fall through to the server's message at line 1.
    }
    return {
        line,
        message: cleanParseMessage(serverMessage) || browserDetail || "Document is not well-formed."
    };
}

/**
 * Strip the fn:parse-xml wrapper from the server's message, keeping the
 * parser's actual diagnosis.
 */
function cleanParseMessage(message) {
    if (!message) { return null; }
    const cleaned = String(message)
        .replace(/^String passed to fn:parse-xml is not a well-formed XML document\.\s*/i, "")
        .replace(/^parse-xml failed with:?\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || null;
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").XMLModeHelper = XMLModeHelper;
