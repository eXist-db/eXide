/*
 *  eXide - web-based XQuery IDE
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

/**
 * The global `eXide` object.
 *
 * Modules import what they need from each other. They also register their
 * exports here, so `window.eXide` keeps offering the same API as before the
 * move to ES modules: to the Cypress tests, the browser console, and pages
 * that open eXide (`window.opener.eXide_onload(eXide.app)`).
 */
export const eXide = globalThis.eXide ?? {};
globalThis.eXide = eXide;

/**
 * Return the object at a dotted path below `eXide`, creating missing levels.
 *
 * @param {string} path e.g. "eXide.edit" or "edit"
 */
export function namespace(path) {
    let parent = eXide;
    for (const part of path.split(".").filter((p, i) => !(i === 0 && p === "eXide"))) {
        parent[part] ??= {};
        parent = parent[part];
    }
    return parent;
}

eXide.namespace = namespace;
