/**
 * Adapter: converts REx TopDownTreeBuilder output to eXide's expected AST node shape,
 * matching the normalizations performed by xqlint's JSONParseTreeHandler.
 *
 * Normalizations applied:
 * 1. Quoted terminal names ('declare', 'function', etc.) → "TOKEN"
 * 2. Whitespace events → "WS" nodes
 * 3. FunctionName → renamed to EQName
 * 4. EQName with single child → flattened (value = child value, children cleared)
 * 5. Single-child wrapper nonterminals in the optimization list → collapsed
 * 6. Nonterminal pos derived from first/last child pos
 * 7. getParent set on all children
 * 8. arity set on FunctionCall/FunctionDecl
 */

// Nonterminals eligible for single-child collapse (from JSONParseTreeHandler)
var COLLAPSE_LIST = [
    "OrExpr", "AndExpr", "ComparisonExpr", "StringConcatExpr", "RangeExpr",
    "UnionExpr", "IntersectExceptExpr", "InstanceofExpr", "TreatExpr", "CastableExpr",
    "CastExpr", "UnaryExpr", "ValueExpr", "FTContainsExpr", "SimpleMapExpr", "PathExpr",
    "RelativePathExpr", "PostfixExpr", "StepExpr",
    "SourceExpr", "TargetExpr", "NewNameExpr"
];

/**
 * Build a line-offset lookup table from input string.
 * lineOffsets[i] = character offset where line i begins (0-indexed lines).
 */
function buildLineOffsets(input) {
    var offsets = [0];
    for (var i = 0; i < input.length; i++) {
        if (input.charCodeAt(i) === 10) {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

/**
 * Convert a character offset to { line, col } using binary search on lineOffsets.
 * Both line and col are 0-indexed.
 */
function offsetToLineCol(offset, lineOffsets) {
    var lo = 0;
    var hi = lineOffsets.length - 1;
    while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (lineOffsets[mid] <= offset) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return { line: lo, col: offset - lineOffsets[lo] };
}

/**
 * Compute pos for a terminal value matching JSONParseTreeHandler's setValue logic.
 * ec = column after last char on last line of the value.
 */
function computeTerminalPos(value, sl, sc) {
    var lines = value.split("\n");
    var el = sl + lines.length - 1;
    var lastIdx = value.lastIndexOf("\n");
    var ec = lastIdx === -1 ? sc + value.length : value.substring(lastIdx + 1).length;
    return { sl: sl, sc: sc, el: el, ec: ec };
}

/**
 * Extract a plain tree from the TopDownTreeBuilder via its serialize interface.
 * Includes WS nodes to match JSONParseTreeHandler behavior.
 */
function extractTree(handler, input) {
    var stack = [];
    var root = null;

    handler.serialize({
        reset: function() {},
        startNonterminal: function(name, begin) {
            var node = { name: name, begin: begin, end: begin, children: [], isTerminal: false };
            if (stack.length > 0) {
                stack[stack.length - 1].children.push(node);
            }
            stack.push(node);
            if (!root) root = node;
        },
        endNonterminal: function(name, end) {
            stack[stack.length - 1].end = end;
            stack.pop();
        },
        terminal: function(name, begin, end) {
            var node = { name: name, begin: begin, end: end, isTerminal: true };
            if (stack.length > 0) {
                stack[stack.length - 1].children.push(node);
            }
        },
        whitespace: function(begin, end) {
            var node = { name: "WS", begin: begin, end: end, isTerminal: true };
            if (stack.length > 0) {
                stack[stack.length - 1].children.push(node);
            }
        }
    });

    return root;
}

/**
 * Recursively convert a REx tree node to an eXide AST node,
 * applying all JSONParseTreeHandler normalizations.
 */
function convertNode(rexNode, input, lineOffsets) {
    if (rexNode.isTerminal) {
        return convertTerminal(rexNode, input, lineOffsets);
    }
    return convertNonterminal(rexNode, input, lineOffsets);
}

function convertTerminal(rexNode, input, lineOffsets) {
    // Rename quoted terminal names to "TOKEN" (matching JSONParseTreeHandler line 141)
    var name = rexNode.name;
    if (name.length >= 2 && name.charAt(0) === "'" && name.charAt(name.length - 1) === "'") {
        name = "TOKEN";
    }

    var value = input.substring(rexNode.begin, rexNode.end);
    var start = offsetToLineCol(rexNode.begin, lineOffsets);
    var pos = computeTerminalPos(value, start.line, start.col);

    return {
        name: name,
        children: [],
        value: value,
        pos: pos,
        getParent: null
    };
}

function convertNonterminal(rexNode, input, lineOffsets) {
    var node = {
        name: rexNode.name,
        children: [],
        value: undefined,
        pos: { sl: 0, sc: 0, el: 0, ec: 0 },
        getParent: null
    };

    // Convert children
    for (var i = 0; i < rexNode.children.length; i++) {
        var child = convertNode(rexNode.children[i], input, lineOffsets);
        child.getParent = node;
        node.children.push(child);
    }

    // Derive pos from first/last non-empty child (matching JSONParseTreeHandler popNode)
    if (node.children.length > 0) {
        var first = node.children[0];
        var last = null;
        for (var i = node.children.length - 1; i >= 0; i--) {
            last = node.children[i];
            if (last.pos.el !== 0 || last.pos.ec !== 0) {
                break;
            }
        }
        node.pos.sl = first.pos.sl;
        node.pos.sc = first.pos.sc;
        node.pos.el = last.pos.el;
        node.pos.ec = last.pos.ec;
    }

    // Normalize FunctionName/FunctionEQName → EQName (matching JSONParseTreeHandler)
    if (node.name === "FunctionName" || node.name === "FunctionEQName") {
        node.name = "EQName";
    }

    // Flatten EQName and URILiteral: set value from descendants, clear children
    // EQName flattening matches JSONParseTreeHandler (line 92-94)
    // URILiteral flattening needed because visitors access .value directly
    if ((node.name === "EQName" || node.name === "URILiteral") && node.value === undefined) {
        node.value = getNodeText(node);
        node.children = [];
    }

    // Collapse single-child wrapper nonterminals (line 106-112)
    for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (child.children.length === 1 && COLLAPSE_LIST.indexOf(child.name) !== -1) {
            var replacement = child.children[0];
            replacement.getParent = node;
            node.children[i] = replacement;
        }
    }

    // Set arity on FunctionCall and FunctionDecl
    if (node.name === "FunctionCall") {
        node.arity = countDescendants(node, "Argument");
    } else if (node.name === "FunctionDecl") {
        node.arity = countDescendants(node, "Param");
    }

    return node;
}

/**
 * Get concatenated text value of a node and its descendants.
 */
function getNodeText(node) {
    if (node.value !== undefined && node.value !== null) {
        return node.value;
    }
    var text = "";
    for (var i = 0; i < node.children.length; i++) {
        text += getNodeText(node.children[i]);
    }
    return text;
}

/**
 * Count descendants with a given name (searches children and grandchildren).
 */
function countDescendants(node, name) {
    var count = 0;
    for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (child.name === name) count++;
        if (child.children) {
            for (var j = 0; j < child.children.length; j++) {
                if (child.children[j].name === name) count++;
            }
        }
    }
    return count;
}

/**
 * Parse XQuery source and return an eXide-compatible AST.
 *
 * @param {string} input - XQuery source text
 * @param {Function} ParserConstructor - the REx-generated XQueryParser constructor
 * @returns {{ ast: object, error: object|null }}
 */
function parseXQuery(input, ParserConstructor) {
    var handler = new ParserConstructor.TopDownTreeBuilder();
    var parser = new ParserConstructor(input, handler);
    var error = null;

    try {
        parser.parse_XQuery();
    } catch (e) {
        error = e;
    }

    var rexRoot = extractTree(handler, input);
    var lineOffsets = buildLineOffsets(input);
    var ast = convertNode(rexRoot, input, lineOffsets);

    return { ast: ast, error: error };
}

// Browser global for eXide
var rexParserAdapter = { parseXQuery: parseXQuery };
globalThis.rexParserAdapter = rexParserAdapter;

// Export for CommonJS (Node.js testing)
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseXQuery: parseXQuery,
        convertNode: convertNode,
        buildLineOffsets: buildLineOffsets,
        offsetToLineCol: offsetToLineCol
    };
}
