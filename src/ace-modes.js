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
define("eXide/mode/xquery_highlight_rules", function(require, exports, module) {

var oop = require("ace/lib/oop");
var lang = require("ace/lib/lang");
var TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;

var XQueryHighlightRules = function() {

	var keywords = lang.arrayToMap(
		("return|for|let|where|order|by|declare|function|variable|xquery|version|option|namespace|import|module|" +
		 "switch|default|map|" +
		 "if|then|else|as|and|or|typeswitch|case|ascending|descending|empty|in").split("|")
    );

    // regexp must not have capturing parentheses
    // regexps are ordered -> the first match is used

    this.$rules = {
        start : [ {
            token : "text",
            regex : "<\\!\\[CDATA\\[",
            next : "cdata"
        }, {
            token : "xml_pe",
            regex : "<\\?.*?\\?>"
        }, {
            token : "comment",
            regex : "<\\!--",
            next : "comment"
		}, {
			token : "comment",
			regex : "\\(:",
			next : "comment"
        }, {
            token : "text", // opening tag
            regex : "<\\/?",
            next : "tag"
        }, {
            token : "constant", // number
            regex : "[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b"
		}, {
            token : "variable", // variable
            regex : "\\$[a-zA-Z_][a-zA-Z0-9_\\-:]*\\b"
		}, {
			token: "string",
			regex : '".*?"'
		}, {
			token: "string",
			regex : "'.*?'"
        }, {
            token : "text",
            regex : "\\s+"
        }, {
            token: "comment",
            regex: "\\%\\w[\\w+_\\-:]+\\b"
        }, {
            token: "support.function",
            regex: "\\w[\\w+_\\-:]+(?=\\()"
        }, {
            token: "keyword.operator",
            regex: "\\*|=|<|>|\\-|\\+|and|or|eq|ne|lt|gt"
        }, {
            token: "lparen",
            regex: "[[({]"
        }, {
            token: "rparen",
            regex: "[\\])}]"
        }, {
			token : function(value) {
		        if (keywords[value])
		            return "keyword";
		        else
		            return "identifier";
			},
			regex : "[a-zA-Z_$][a-zA-Z0-9_$]*\\b"
		} ],

        tag : [ {
            token : "text",
            regex : ">",
            next : "start"
        }, {
            token : "keyword",
            regex : "[-_a-zA-Z0-9:]+"
        }, {
            token : "text",
            regex : "\\s+"
        }, {
            token : "string",
            regex : '".*?"'
        }, {
            token : "string",
            regex : "'.*?'"
        } ],

        cdata : [ {
            token : "text",
            regex : "\\]\\]>",
            next : "start"
        }, {
            token : "text",
            regex : "\\s+"
        }, {
            token : "text",
            regex : "(?:[^\\]]|\\](?!\\]>))+"
        } ],

        comment : [ {
            token : "comment",
            regex : ".*?-->",
            next : "start"
        }, {
			token: "comment",
			regex : ".*:\\)",
			next : "start"
        }, {
            token : "comment",
            regex : ".+"
		} ]
    };
};

oop.inherits(XQueryHighlightRules, TextHighlightRules);

exports.XQueryHighlightRules = XQueryHighlightRules;
});

define("eXide/mode/behaviour/xquery", function(require, exports, module) {

	var oop = require("ace/lib/oop");
	var Behaviour = require('ace/mode/behaviour').Behaviour;
	var CstyleBehaviour = require('ace/mode/behaviour/cstyle').CstyleBehaviour;

	var XQueryBehaviour = function (parent) {
	    
	    this.inherit(CstyleBehaviour, ["braces", "parens", "string_dquotes"]); // Get string behaviour
	    this.parent = parent;
	    
	    this.add("brackets", "insertion", function (state, action, editor, session, text) {
	        if (text == "\n") {
	            var cursor = editor.getCursorPosition();
	            var line = session.doc.getLine(cursor.row);
	            var rightChars = line.substring(cursor.column, cursor.column + 2);
                // check if pressed enter between two tags and increase indent automatically
	            if (rightChars == '</') {
	                var indent = this.$getIndent(session.doc.getLine(cursor.row)) + session.getTabString();
	                var next_indent = this.$getIndent(session.doc.getLine(cursor.row));

	                return {
	                    text: '\n' + indent + '\n' + next_indent,
	                    selection: [1, indent.length, 1, indent.length]
	                }
	            }
	        }
	        return false;
	    });

        this.add("comments", "insertion", function (state, action, editor, session, text) {
            var cursor = editor.getCursorPosition();
            var line = session.doc.getLine(cursor.row);
            if (text == "\n") {
                // if user presses return within a comment, insert ' : ' 
                if (line.match(/^[\(\s]:/)) {
                    return {
                        text: '\n' + " : ",
                        selection: [1, 3, 1, 3]
                    }
                }
            }
            if (text == ":") {
                var leftChar = line.substring(cursor.column - 1, 1);
                if (leftChar == "(") {
                    return {
                        text: ":  :",
                        selection: [2, 2]
                    }
                }
            }
        });
        
	    // Check for open tag if user enters / and auto-close it.
	    this.add("slash", "insertion", function (state, action, editor, session, text) {
	    	if (text == "/") {
	    		var cursor = editor.getCursorPosition();
				var line = session.doc.getLine(cursor.row);
				if (cursor.column > 0 && line.charAt(cursor.column - 1) == "<") {
					line = line.substring(0, cursor.column) + '/' + line.substring(cursor.column + 1, line.length);
					var lines = session.doc.getAllLines();
					lines[cursor.row] = line;
					// call mode helper to close the tag if possible
					parent.exec("closeTag", lines.join(session.doc.getNewLineCharacter()), cursor.row);
				}
	    	}
			return false;
	    });
	}
	oop.inherits(XQueryBehaviour, Behaviour);

	exports.XQueryBehaviour = XQueryBehaviour;
});

define("eXide/mode/xquery", function(require, exports, module) {

var oop = require("ace/lib/oop");
var TextMode = require("ace/mode/text").Mode;
var XQueryLexer = require("lib/XQueryLexer").XQueryLexer;

var Tokenizer = require("ace/tokenizer").Tokenizer;
var XQueryBehaviour = require("eXide/mode/behaviour/xquery").XQueryBehaviour;
var CStyleFoldMode = require("ace/mode/folding/cstyle").FoldMode;
var Range = require("ace/range").Range;

var Mode = function(parent) {
    this.$tokenizer = new XQueryLexer();
    this.$behaviour = new XQueryBehaviour(parent);
    this.foldingRules = new CStyleFoldMode();
};

oop.inherits(Mode, TextMode);

(function() {
    
    this.getNextLineIndent = function(state, line, tab) {
      var indent = this.$getIndent(line);
      var match = line.match(/\s*(?:then|else|return|[{\(]|<\w+>)\s*$/);
      if (match)
        indent += tab;
        return indent;
    };
    
    this.checkOutdent = function(state, line, input) {
      if (! /^\s+$/.test(line))
            return false;

        return /^\s*[\}\)]/.test(input);
    };
    
    this.autoOutdent = function(state, doc, row) {
      var line = doc.getLine(row);
        var match = line.match(/^(\s*[\}\)])/);

        if (!match) return 0;

        var column = match[1].length;
        var openBracePos = doc.findMatchingBracket({row: row, column: column});

        if (!openBracePos || openBracePos.row == row) return 0;

        var indent = this.$getIndent(doc.getLine(openBracePos.row));
        doc.replace(new Range(row, 0, row, column-1), indent);
    };

    this.$getIndent = function(line) {
        var match = line.match(/^(\s+)/);
        if (match) {
            return match[1];
        }

        return "";
    };
    
    this.toggleCommentLines = function(state, doc, startRow, endRow) {
        var i, line;
        var outdent = true;
        var re = /^\s*\(:(.*):\)/;

        for (i=startRow; i<= endRow; i++) {
            if (!re.test(doc.getLine(i))) {
                outdent = false;
                break;
            }
        }

        var range = new Range(0, 0, 0, 0);
        for (i=startRow; i<= endRow; i++) {
            line = doc.getLine(i);
            range.start.row  = i;
            range.end.row    = i;
            range.end.column = line.length;

            doc.replace(range, outdent ? line.match(re)[1] : "(:" + line + ":)");
        }
    };
    
    /*this.createWorker = function(session) {
        this.$deltas = [];
        var worker = new WorkerClient(["ace"], "ace/mode/xquery_worker", "XQueryWorker");
        var that = this;

        session.getDocument().on('change', function(evt){
          that.$deltas.push(evt.data);
        });

        worker.attachToDocument(session.getDocument());
        
        worker.on("start", function(e) {
          that.$deltas = [];
        });

        worker.on("error", function(e) {
            // errors are ignored because they are reported by eXist's compiler
        });
        
        worker.on("xqlint", function(e) {
            var annotations = [];
            for (var i = 0; i < e.data.length; i++) {
                if (e.data[i].type !== "error") {
                    annotations.push({
                        row: e.data[i].pos.sl,
                        text: e.data[i].message,
                        type: e.data[i].type
                    });
                }
            }
            session.setAnnotations(annotations);
        });
        
        worker.on("ok", function(e) {
            session.clearAnnotations();
        });
        
        worker.on("highlight", function(tokens) {
          if(that.$deltas.length > 0) return;

          var firstRow = 0;
          var lastRow = session.getLength() - 1;
          
          var lines = tokens.data.lines;
          var states = tokens.data.states;
           
          session.bgTokenizer.lines = lines;
          session.bgTokenizer.states = states;
          session.bgTokenizer.fireUpdateEvent(firstRow, lastRow);
        });
        
        return worker;
    };*/
    
}).call(Mode.prototype);

exports.Mode = Mode;
});

define("eXide/mode/behaviour/xml", function(require, exports, module) {

	var oop = require("ace/lib/oop");
	var Behaviour = require('ace/mode/behaviour').Behaviour;
	var CstyleBehaviour = require('ace/mode/behaviour/cstyle').CstyleBehaviour;
	var TokenIterator = require("ace/token_iterator").TokenIterator;
	
    function hasType(token, type) {
        var hasType = true;
        var typeList = token.type.split('.');
        var needleList = type.split('.');
        needleList.forEach(function(needle){
            if (typeList.indexOf(needle) == -1) {
                hasType = false;
                return false;
            }
        });
        return hasType;
    }
    
	var XMLBehaviour = function (parent) {
	    
		this.inherit(CstyleBehaviour, ["braces", "parens", "string_dquotes"]); // Get string behaviour
	    this.parent = parent;
	    
	    this.add("brackets", "insertion", function (state, action, editor, session, text) {
	        if (text == "\n") {
	            var cursor = editor.getCursorPosition();
	            var line = session.doc.getLine(cursor.row);
	            var rightChars = line.substring(cursor.column, cursor.column + 2);
	            if (rightChars == '</') {
	                var indent = this.$getIndent(session.doc.getLine(cursor.row)) + session.getTabString();
	                var next_indent = this.$getIndent(session.doc.getLine(cursor.row));

	                return {
	                    text: '\n' + indent + '\n' + next_indent,
	                    selection: [1, indent.length, 1, indent.length]
	                }
	            }
	        }
	        return false;
	    });

	    // Check for open tag if user enters / and auto-close it.
	    this.add("slash", "insertion", function (state, action, editor, session, text) {
	    	if (text == "/") {
	    		var cursor = editor.getCursorPosition();
				var line = session.doc.getLine(cursor.row);
				if (cursor.column > 0 && line.charAt(cursor.column - 1) == "<") {
					line = line.substring(0, cursor.column) + "/" + line.substring(cursor.column);
					var lines = session.doc.getAllLines();
					lines[cursor.row] = line;
					// call mode helper to close the tag if possible
                    parent.exec("closeTag", lines.join(session.doc.getNewLineCharacter()), cursor.row);
				}
	    	}
			return false;
	    });
        
        this.add("autoclosing", "insertion", function (state, action, editor, session, text) {
            if (text == '>') {
                var position = editor.getCursorPosition();
                var iterator = new TokenIterator(session, position.row, position.column);
                var token = iterator.getCurrentToken();
                var atCursor = false;
                if (!token || !hasType(token, 'meta.tag') && !(hasType(token, 'text') && token.value.match('/'))){
                    do {
                        token = iterator.stepBackward();
                    } while (token && (hasType(token, 'string') || hasType(token, 'keyword.operator') || hasType(token, 'entity.attribute-name') || hasType(token, 'text')));
                } else {
                    atCursor = true;
                }
                if (!token || !hasType(token, 'meta.tag-name') || iterator.stepBackward().value.match('/')) {
                    return
                }
                var tag = token.value;
                if (atCursor){
                    var tag = tag.substring(0, position.column - token.start);
                }
    
                return {
                   text: '>' + '</' + tag + '>',
                   selection: [1, 1]
                }
            }
        });
	}
	oop.inherits(XMLBehaviour, Behaviour);

	exports.XMLBehaviour = XMLBehaviour;
});

define("eXide/mode/xml", function(require, exports, module) {

	var oop = require("ace/lib/oop");
	var XmlMode = require("ace/mode/xml").Mode;
	var Tokenizer = require("ace/tokenizer").Tokenizer;
	var XmlHighlightRules = require("ace/mode/xml_highlight_rules").XmlHighlightRules;
    var XmlFoldMode = require("ace/mode/folding/xml").FoldMode;
	var XMLBehaviour = require("eXide/mode/behaviour/xml").XMLBehaviour;
	var Range = require("ace/range").Range;

	var Mode = function(parent) {
	    this.$tokenizer = new Tokenizer(new XmlHighlightRules().getRules());
	    this.$behaviour = new XMLBehaviour(parent);
        this.foldingRules = new XmlFoldMode();
	};

	oop.inherits(Mode, XmlMode);

	(function() {
        
        this.toggleCommentLines = function(state, doc, startRow, endRow) {
            var i, line;
            var outdent = true;
            var re = /^\s*<!--(.*)-->/;
    
            for (i=startRow; i<= endRow; i++) {
                if (!re.test(doc.getLine(i))) {
                    outdent = false;
                    break;
                }
            }
    
            var range = new Range(0, 0, 0, 0);
            for (i=startRow; i<= endRow; i++) {
                line = doc.getLine(i);
                range.start.row  = i;
                range.end.row    = i;
                range.end.column = line.length;
    
                doc.replace(range, outdent ? line.match(re)[1] : "<!--" + line + "-->");
            }
        };
        
	}).call(Mode.prototype);

	exports.Mode = Mode;
});

define("eXide/mode/html", function(require, exports, module) {

    var oop = require("ace/lib/oop");
	var HtmlMode = require("ace/mode/html").Mode;
	var Tokenizer = require("ace/tokenizer").Tokenizer;
	var HtmlHighlightRules = require("ace/mode/html_highlight_rules").HtmlHighlightRules;
    var HtmlFoldMode = require("ace/mode/folding/html").FoldMode;
	var XMLBehaviour = require("eXide/mode/behaviour/xml").XMLBehaviour;
	var Range = require("ace/range").Range;
    var JavaScriptMode = require("ace/mode/javascript").Mode;
    var CssMode = require("ace/mode/css").Mode;

	var Mode = function(parent) {
        var highlighter = new HtmlHighlightRules();
	    this.$tokenizer = new Tokenizer(highlighter.getRules());
        this.$behaviour = new XMLBehaviour(parent);
        //this.$behaviour = new HtmlBehaviour();
        this.foldingRules = new HtmlFoldMode();
        this.$embeds = highlighter.getEmbeds();
        this.createModeDelegates({
            "js-": JavaScriptMode,
            "css-": CssMode
        });
	};

	oop.inherits(Mode, HtmlMode);

	(function() {
        
        this.toggleCommentLines = function(state, doc, startRow, endRow) {
            var i, line;
            var outdent = true;
            var re = /^\s*<!--(.*)-->/;
    
            for (i=startRow; i<= endRow; i++) {
                if (!re.test(doc.getLine(i))) {
                    outdent = false;
                    break;
                }
            }
    
            var range = new Range(0, 0, 0, 0);
            for (i=startRow; i<= endRow; i++) {
                line = doc.getLine(i);
                range.start.row  = i;
                range.end.row    = i;
                range.end.column = line.length;
    
                doc.replace(range, outdent ? line.match(re)[1] : "<!--" + line + "-->");
            }
        };
	}).call(Mode.prototype);

	exports.Mode = Mode;
});
