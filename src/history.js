/**
 * Edit history
 */

import { namespace } from "./namespace.js";

export class History {
    constructor() {
        this.history = [];
    }

    push(path, line) {
        if (this.history.length > 0) {
            const last = this.history[this.history.length - 1];
            if (last.path === path && last.line === line) {
                return;
            }
        }

        this.history.push({
            path, line
        });
        if (this.history.length > 50) {
            this.history.shift();
        }
    }

    pop() {
        if (this.history.length === 0) {
            return null;
        }
        return this.history.pop();
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").History = History;
