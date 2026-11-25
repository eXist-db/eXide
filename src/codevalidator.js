/**
 * Code validation component. Validates documents on change and displays diagnostics.
 */

import { namespace } from "./namespace.js";
import { Sender } from "./events.js";

const VALIDATE_TIMEOUT = 700;

function canValidate(doc) {
    const mode = doc.getModeHelper();
    if (!(mode && mode.validate)) {
        return false;
    }
    return true;
}

function createDeferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    promise.resolve = resolve;
    return promise;
}

export class CodeValidator extends Sender {
    constructor(editor) {
        super();
        this.editor = editor;
        this.inProgress = false;
        this.enabled = true;
        this.validateTimeout = null;
        this.deferred = null;
    }

    triggerDelayed(doc) {
        if (!(this.enabled && canValidate(doc))) {
            return;
        }
        if (!doc.needsValidation()) {
            return;
        }
        const self = this;
        const time = new Date().getTime();
        if (this.validateTimeout && time - doc.lastChangeEvent < VALIDATE_TIMEOUT) {
            // cancel previous timeout
            clearTimeout(this.validateTimeout);
        }

        this.deferred = createDeferred();
        this.validateTimeout = setTimeout(() => {
            self.triggerNow.apply(self, [doc]);
        }, VALIDATE_TIMEOUT);
    }

    triggerNow(doc) {
        if (!(this.enabled && canValidate(doc))) {
            return null;
        }
        if (!doc.needsValidation()) {
            return null;
        }
        if (this.inProgress) {
            return this.deferred;
        }

        const self = this;
        if (!this.deferred) {
            this.deferred = createDeferred();
        }

        this.inProgress = true;
        const startedAt = new Date().getTime();
        doc.getModeHelper().validate(doc, doc.getText(), (success) => {
            // Check if document changed while compile was in flight,
            // BEFORE updating lastValidation (which would mask the change)
            const changedDuringValidation = doc.lastChangeEvent > startedAt;

            doc.lastValidation = new Date().getTime();
            self.inProgress = false;
            if (self.deferred) {
                self.deferred.resolve([success]);
                self.deferred = null;
            }

            self.$triggerEvent("validate", [doc]);
            if (success) {
                self.$triggerEvent("documentValid", [doc]);
            }

            // Re-validate with the newer code
            if (changedDuringValidation && self.editor.activeDoc === doc) {
                doc.lastValidation = 0; // force needsValidation() to return true
                self.triggerDelayed(doc);
            }
        });
        return this.deferred;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }
}

// Register on the global `eXide` object (see namespace.js)
namespace("eXide.edit").CodeValidator = CodeValidator;
