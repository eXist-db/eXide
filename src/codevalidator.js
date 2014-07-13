eXide.namespace("eXide.edit.CodeValidator");

/**
 * The main editor component. Handles the ACE editor as well as tabs, keybindings, commands...
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

        this.deferred = $.Deferred();
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
            this.deferred = $.Deferred();
        }

        this.inProgress = true;
        doc.getModeHelper().validate(doc, doc.getText(), function (success) {
            doc.lastValidation = new Date().getTime();
            self.inProgress = false;
            self.deferred.resolve([success]);
            self.deferred = null;

            self.$triggerEvent("validate", [doc]);
            if (success) {
                self.$triggerEvent("documentValid", [doc]);
            }
        });
        return this.deferred;
    };

    Constr.prototype.setEnabled = function(enabled) {
        this.enabled = enabled;
    };

    return Constr;
}());