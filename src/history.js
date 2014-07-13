eXide.namespace("eXide.edit.History");

/**
 * Edit history
 */
eXide.edit.History = (function () {
    
    Constr = function() {
        this.history = [];
    };
    
    Constr.prototype.push = function(path, line) {
        if (this.history.length > 0) {
            var last = this.history[this.history.length - 1];
            if (last.path === path && last.line === line) {
                return;
            }
        }

        this.history.push({
            path: path, line: line
        });
        if (this.history.length > 50) {
            this.history.shift();
        }
    };
    
    Constr.prototype.pop = function() {
        if (this.history.length === 0) {
            return null;
        }
        return this.history.pop();
    };
    
    return Constr;
}());