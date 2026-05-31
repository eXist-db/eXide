eXide.namespace("eXide.edit.CodeValidator");

/**
 * Code validation component. Validates documents on change and displays diagnostics.
 */
eXide.edit.CodeValidator = (function () {

    var VALIDATE_TIMEOUT = 700;

    function canValidate(doc) {
        var mode = doc.getModeHelper();
        if (!(mode && mode.validate)) {
            return false;
        }
        return true;
    }

    function createDeferred() {
        var resolve;
        var promise = new Promise(function(r) { resolve = r; });
        promise.resolve = resolve;
        return promise;
    }

    Constr = function(editor) {
        this.editor = editor;
        this.inProgress = false;
        this.enabled = true;
        this.validateTimeout = null;
        this.deferred = null;
    };

    // Extend eXide.events.Sender for event support
    eXide.util.oop.inherit(Constr, eXide.events.Sender);

    Constr.prototype.triggerDelayed = function(doc) {
        if (!(this.enabled && canValidate(doc))) {
            return;
        }
        if (!doc.needsValidation()) {
            return;
        }
        var self = this;
        var time = new Date().getTime();
        if (this.validateTimeout && time - doc.lastChangeEvent < VALIDATE_TIMEOUT) {
            // cancel previous timeout
            clearTimeout(this.validateTimeout);
        }

        this.deferred = createDeferred();
        this.validateTimeout = setTimeout(function() {
            self.triggerNow.apply(self, [doc]);
        }, VALIDATE_TIMEOUT);
    };

    Constr.prototype.triggerNow = function(doc) {
        if (!(this.enabled && canValidate(doc))) {
            return null;
        }
        if (!doc.needsValidation()) {
            return null;
        }
        if (this.inProgress) {
            return this.deferred;
        }

        var self = this;
        if (!this.deferred) {
            this.deferred = createDeferred();
        }

        this.inProgress = true;
        var startedAt = new Date().getTime();
        doc.getModeHelper().validate(doc, doc.getText(), function (success) {
            // Check if document changed while compile was in flight,
            // BEFORE updating lastValidation (which would mask the change)
            var changedDuringValidation = doc.lastChangeEvent > startedAt;

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
    };

    Constr.prototype.setEnabled = function(enabled) {
        this.enabled = enabled;
    };

    return Constr;
}());
