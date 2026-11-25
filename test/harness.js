/**
 * Test harness: loads eXide's parser and XQuery utility modules in Node.js.
 *
 * The sources are ES modules; Node (22.12+) can require() them.
 */
const { eXide } = require("../src/namespace.js");
const { Visitor } = require("../src/visitor.js");
const {
    XQueryUtils, InScopeVariables, VariableReferences, FunctionCalls, FunctionParameters, ModuleInfo,
} = require("../src/xquery-utils.js");
const XQueryParser = require("../src/parser/XQueryParser.js").default;
const adapter = require("../src/parser/adapter.js");

function parse(code) {
    return adapter.parseXQuery(code, XQueryParser);
}

module.exports = {
    eXide,
    parse,
    XQueryParser,
    adapter,
    XQueryUtils,
    Visitor,
    InScopeVariables,
    VariableReferences,
    FunctionCalls,
    FunctionParameters,
    ModuleInfo,
};
