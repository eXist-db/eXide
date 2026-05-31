# XQuery Grammars for eXide

eXide uses a [REx](https://www.bottlecaps.de/rex/)-generated parser built from W3C EBNF grammars. This directory contains the source grammars and their combined variants.

## Grammar Files

### Reference grammars (individual)

| File | Description |
|------|-------------|
| `XQuery-31.ebnf` | Base XQuery 3.1 |
| `XQuery-40.ebnf` | Base XQuery 4.0 (from REx repo) |
| `XQuery-Update-30.ebnf` | W3C XQuery Update Facility 3.0 |
| `XQuery-FullText-10.ebnf` | XQuery Full Text 1.0 |
| `XQuery-Update-eXist-Legacy.ebnf` | XQUFEL (eXist-db proprietary update syntax) |

### Combined grammars

| File | Description |
|------|-------------|
| `XQuery-31-Family-XQUFEL.ebnf` | **Current parser source** — XQ 3.1 + Update 3.0 + Full Text 1.0 + XQUFEL |
| `XQuery-40-Family-XQUFEL.ebnf` | Future upgrade — XQ 4.0 + Update 3.0 + Full Text 1.0 + XQUFEL |

The "Family" grammars are created by merging the individual grammars. See [Merging Extension Grammars](#merging-extension-grammars) below.

## Generating the Parser

Parser generation is automated via `tools/generate-parser.js`:

```bash
npm run generate-parser
```

This runs REx with the correct options, applies post-generation patches (Nonterminal constructor fix for REx v6.1), and appends export boilerplate. The output is written to `src/parser/XQueryParser.js`.

To generate from a different grammar:

```bash
node tools/generate-parser.js --grammar grammars/XQuery-40-Family-XQUFEL.ebnf
```

### REx Options

eXide uses REx in **LL(3) mode** with these flags:

```
-ll 3 -backtrack -tree -javascript -name XQueryParser
```

| Flag | Purpose |
|------|---------|
| `-ll 3` | LL parser with lookahead depth 3 |
| `-backtrack` | Enable backtracking for ambiguous constructs in the XQuery grammar |
| `-tree` | Generate `TopDownTreeBuilder` for AST access |
| `-javascript` | JavaScript output |
| `-name XQueryParser` | Constructor/class name |

**Why LL mode?** The `-tree` flag (TopDownTreeBuilder) requires LL mode, and LL parsers produce top-down parse trees that map directly to eXide's expected AST node shape.

### Testing a Grammar

To verify a grammar generates without errors before running the full pipeline:

```bash
java -cp tools REx grammars/<grammar>.ebnf -ll 3 -backtrack -tree -javascript -name XQueryParser
```

Exit code 0 with no output means success. REx prints errors to stderr if the grammar has issues.

## Preparing New Grammars

The base grammars from the [REx repository](https://github.com/GuntherRademworker/rex-parser-generator) are **reference grammars** written in standard W3C EBNF notation. They may use left-recursion, which is valid EBNF but **incompatible with LL parsing**. Before a new grammar can be used with eXide, two steps are typically needed:

### 1. Eliminate Left-Recursion

LL parsers cannot handle left-recursive productions. The pattern to fix is:

```
(* Left-recursive — REx will reject this in LL mode *)
A ::= B
    | A Suffix

(* Iterative equivalent — LL-compatible *)
A ::= B Suffix*
```

**Example: XQuery 4.0 PostfixExpr**

The XQ 4.0 grammar defines `PostfixExpr` via five separate left-recursive productions:

```
PostfixExpr        ::= PrimaryExpr | FilterExpr | DynamicFunctionCall
                     | LookupExpr | MethodCall | FilterExprAM
FilterExpr         ::= PostfixExpr Predicate
DynamicFunctionCall ::= PostfixExpr PositionalArgumentList
LookupExpr         ::= PostfixExpr Lookup
MethodCall         ::= PostfixExpr '=?>' NCName PositionalArgumentList
FilterExprAM       ::= PostfixExpr '?[' Expr ']'
```

The fix folds all suffixes into an iterative loop on `PostfixExpr` and replaces the left-recursive productions with suffix-only variants:

```
PostfixExpr ::= PrimaryExpr ( Predicate | PositionalArgumentList
              | Lookup | MethodCallSuffix | FilterExprAMSuffix )*
MethodCallSuffix   ::= '=?>' NCName PositionalArgumentList
FilterExprAMSuffix ::= '?[' Expr ']'
```

`FilterExpr`, `DynamicFunctionCall`, and `LookupExpr` are deleted entirely (their suffixes — `Predicate`, `PositionalArgumentList`, `Lookup` — are already defined elsewhere).

Similarly, `PositionalArguments` needed the same treatment:

```
(* Left-recursive *)
PositionalArguments ::= Argument | PositionalArguments ',' Argument

(* Iterative *)
PositionalArguments ::= Argument ( ',' Argument )*
```

### 2. Merge Extension Grammars

To build a combined grammar (e.g., XQuery + Update + Full Text + XQUFEL):

1. Start with the base grammar (e.g., `XQuery-40.ebnf`)
2. Add productions from each extension grammar, inserting new alternatives into existing productions where the extension spec indicates
3. Resolve any naming conflicts between extensions
4. Test the combined grammar with REx

### Post-Generation Patches

REx v6.1 generates a `Nonterminal` constructor that doesn't expose `name` and `children` as object properties (they're only closure variables). `tools/generate-parser.js` patches this automatically — see the `patches` array in its CONFIG object.
