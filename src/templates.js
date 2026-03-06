/*
 *  eXide - web-based XQuery IDE
 *  
 *  Copyright (C) 2013 Wolfgang Meier
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
eXide.namespace("eXide.edit.Template");

/**
 * Represents the last inserted template. Cycles through parameters.
 */
eXide.edit.Template = (function () {
	
	var LINE_REGEX = /\n/;
	
	Constr = function(editor, range, code, type) {
		var lines = code.split(LINE_REGEX).length;
		this.code = code;
		this.editor = editor.editor;
		this.range = range;
		this.type = type;
        if (range) {
    		this.startLine = range.start.row;
            this.startColumn = range.start.column;
        } else {
            var cursor = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
            this.startLine = cursor.row;
            this.startColumn = cursor.column;
        }
		this.endLine = this.startLine + lines - 1;
		$.log("startLine = %i, endLine = %i", this.startLine, this.endLine);
		this.currentLine = this.startLine;
		this.lineOffset = this.startColumn;
		this.regex = /(?:\$[\w\-:_]+|␣)/g;
		if (this.startColumn > 0)
			this.regex.lastIndex = this.startColumn;
	}
	
	Constr.prototype = {
		
		/**
		 * Insert the template code into the edited document.
		 */
		insert: function() {
            if (this.range) {
                var from = editorUtils.rowColToOffset(this.editor.state, this.range.start.row, this.range.start.column);
                var to = editorUtils.rowColToOffset(this.editor.state, this.range.end.row, this.range.end.column);
                this.editor.dispatch({ changes: { from: from, to: to } });
            }
            var pos = this.editor.state.selection.main.head;
            this.editor.dispatch({
                changes: { from: pos, insert: this.code },
                selection: { anchor: pos + this.code.length }
            });
			var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);
			if (this.code.substring(0, 1) != "$" && lead.column > 0) {
				var head = this.editor.state.selection.main.head;
				this.editor.dispatch({ selection: { anchor: head - 1 } });
			}
			if (this.type != "variable")
				this.nextParam();
			this.editor.focus();
		},
		
		/**
		 * Cycle through parameters. Returns true if another parameter was found,
		 * false to stop template mode.
		 */
		nextParam: function() {
			var lead = editorUtils.offsetToRowCol(this.editor.state, this.editor.state.selection.main.head);

			$.log("lead.row = %i startLine = %i", lead.row, this.startLine);
			// return immediately if the cursor is outside the template
			if (lead.row < this.startLine || lead.row > this.endLine)
				return false;

			var loop = false;
			var found = false;
			while (this.currentLine <= this.endLine) {
				var lineNum = this.currentLine + 1;
				var line = (lineNum >= 1 && lineNum <= this.editor.state.doc.lines) ? this.editor.state.doc.line(lineNum).text : "";
				$.log("Checking line %s", line);
				var match = this.regex.exec(line);
				if (match) {
					$.log("Matched %s", match[0]);
					var from = editorUtils.rowColToOffset(this.editor.state, this.currentLine, match.index);
					var to = editorUtils.rowColToOffset(this.editor.state, this.currentLine, match.index + match[0].length);
                    if (match[0].length === 1) {
                        this.editor.dispatch({ changes: { from: from, to: to } });
                    } else {
                        this.editor.dispatch({ selection: { anchor: from, head: to } });
                    }
					this.lineOffset = match.index;
					found = true;
					break;
				} else {
					this.lineOffset = 0;
					this.currentLine++;
				}
				if (this.currentLine > this.endLine && !loop) {
					$.log("loop %i", this.startColumn);
					this.currentLine = this.startLine;
					if (this.startColumn > 0) {
						this.lineOffset = this.startColumn;
						this.regex.lastIndex = this.lineOffset;
					}
					loop = true;
				}
			}
			return found;
		}
	};
	return Constr;
}());