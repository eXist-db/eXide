eXide.namespace("eXide.edit.CodeValidator");

/**
 * The main editor component. Handles the ACE editor as well as tabs, keybindings, commands...
 */
eXide.edit.CodeValidator = (function () {

    var VALIDATE_TIMEOUT = 300;

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
		this.validateTimeout = setTimeout(function() { 
			self.triggerNow.apply(self, [doc]); 
		}, VALIDATE_TIMEOUT);
    };

    Constr.prototype.triggerNow = function(doc) {
    	if (!(this.enabled && canValidate(doc))) {
    		return;
    	}
    	if (!doc.needsValidation()) {
    		return;
    	}
    	var self = this;
    	this.inProgress = true;
    	doc.getModeHelper().validate(doc, doc.getText(), function (success) {
    		doc.lastValidation = new Date().getTime();
			self.inProgress = false;
            $.log("Validation completed: valid = %s", success);

            self.$triggerEvent("validate", [doc]);
            if (success) {
                self.$triggerEvent("documentValid", [doc]);
            }
		});
    };

    Constr.prototype.setEnabled = function(enabled) {
    	this.enabled = enabled;
    };

    return Constr;
}());