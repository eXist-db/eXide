/**
 * Coverage for the "Run as test" results UI — the full render path from
 * `api/test`'s JSON response through `renderTestResults` in
 * `src/xquery-helper.js`.
 *
 * Before this spec landed there was no end-to-end coverage of the
 * rendering itself; only the dirty-buffer / untitled-buffer paths were
 * tested in `run_as_test_dirty_spec.cy.js`. Cases here:
 *
 *   1. All-pass module — verify summary, status column, no expanders.
 *   2. Assertion-failure module — verify failure badge, expected+actual
 *      surfaced in the expandable detail, expander interaction works.
 *   3. Runtime-error module — verify error badge, error type in detail.
 *   4. Mixed pass + failure + error in one module — verify counts and rows.
 *   5. `%test:assertError` (expected throw) — should pass.
 *   6. Time field — verify the summary surfaces elapsed time when XQSuite
 *      reports it (regression test for previous `time: ""` bug from the
 *      `$result/self::testsuite` vs `$result/testsuite` mismatch).
 */
describe('Run as test — results rendering', () => {
  var testCollection = '/db'
  var testFile = 'cypress-test-results-' + Date.now() + '.xqm'
  var testPath = testCollection + '/' + testFile

  before(() => {
    cy.cleanupTestFiles()
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  after(() => {
    cy.cleanupTestFiles()
  })

  // Save the given test-suite source to a stable path, then click Run as
  // test and wait for the api/test response. Returns the cy chain on the
  // results container.
  function runSuite(source) {
    cy.intercept('POST', '**/api/test').as('runTest')
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().activeDoc
      doc.setPath(testPath, testFile)
      doc.editable = true
      doc.syntax = 'xquery'
      doc.mime = 'application/xquery'
      doc.setText(source)
    })
    cy.window().then((win) => {
      var ed = win.eXide.app.getEditor()
      return new Cypress.Promise((resolve, reject) => {
        ed.saveDocument(null, resolve, function (msg) {
          reject(new Error('save failed: ' + msg))
        })
      })
    })
    cy.get('#menu-xquery-run-test').click({ force: true })
    cy.wait('@runTest', { timeout: 15000 }).its('response.statusCode').should('eq', 200)
    return cy.get('.results-container .results', { timeout: 10000 })
  }

  it('all-pass module: summary + per-row status, no expanders', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-pass";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals("a") function t:one() { "a" };\n' +
      'declare %test:assertEquals(2) function t:two() { 1 + 1 };\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-count').should('contain.text', '2 tests')
      cy.get('.test-summary .test-failures').should('not.exist')
      cy.get('.test-summary .test-errors').should('not.exist')
      cy.get('tbody tr').should('have.length', 2)
      cy.get('tr.test-pass').should('have.length', 2)
      cy.get('tr.test-failure').should('not.exist')
      cy.get('tr.test-error').should('not.exist')
      // No <details> on passing rows (nothing to expand).
      cy.get('tbody details').should('not.exist')
      // Test names rendered.
      cy.get('tbody tr').eq(0).should('contain.text', 'one')
      cy.get('tbody tr').eq(1).should('contain.text', 'two')
    })
  })

  it('failure: expected + actual surfaced in expandable detail', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-fail";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals("expected-value") function t:mismatch() { "actual-value" };\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-failures').should('contain.text', '1 failures')
      cy.get('tr.test-failure').should('have.length', 1)
      cy.get('tr.test-failure details summary')
        .should('contain.text', 'assertEquals failed')
      // Expand and verify both expected and actual appear.
      cy.get('tr.test-failure details').click()
      cy.get('tr.test-failure details .test-full-output')
        .should('contain.text', 'expected: expected-value')
        .and('contain.text', 'actual:   actual-value')
    })
  })

  it('runtime error: type surfaced in detail', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-err";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals("x") function t:boom() {\n' +
      '  error(xs:QName("t:custom-err"), "kaboom")\n' +
      '};\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-errors').should('contain.text', '1 errors')
      cy.get('tr.test-error').should('have.length', 1)
      cy.get('tr.test-error details summary')
        .should('contain.text', 'kaboom')
      cy.get('tr.test-error details').click()
      cy.get('tr.test-error details .test-full-output')
        .should('contain.text', 'type:')
        .and('contain.text', 'custom-err')
    })
  })

  it('mixed: pass + failure + error in one suite', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-mix";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals(1) function t:passes() { 1 };\n' +
      'declare %test:assertEquals(1) function t:fails() { 2 };\n' +
      'declare %test:assertEquals(1) function t:errors() {\n' +
      '  error(xs:QName("t:nope"), "broken")\n' +
      '};\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-count').should('contain.text', '3 tests')
      cy.get('.test-summary .test-failures').should('contain.text', '1 failures')
      cy.get('.test-summary .test-errors').should('contain.text', '1 errors')
      cy.get('tbody tr').should('have.length', 3)
      cy.get('tr.test-pass').should('have.length', 1)
      cy.get('tr.test-failure').should('have.length', 1)
      cy.get('tr.test-error').should('have.length', 1)
    })
  })

  it('%test:assertError (expected throw) counts as pass', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-assert-err";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertError("err:FOAR0001") function t:divides-by-zero() {\n' +
      '  1 div 0\n' +
      '};\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-count').should('contain.text', '1 tests')
      cy.get('.test-summary .test-failures').should('not.exist')
      cy.get('.test-summary .test-errors').should('not.exist')
      cy.get('tr.test-pass').should('have.length', 1)
    })
  })

  it('summary surfaces elapsed time when XQSuite reports it', () => {
    // Regression test for the bug where `$result/self::testsuite` never
    // matched the actual <testsuites><testsuite/></testsuites> shape, so
    // the time attribute was always empty in the JSON response and the
    // summary line never displayed parentheses.
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-time";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals(1) function t:trivial() { 1 };\n'

    runSuite(src).within(() => {
      // Time is reported as an xs:duration like "PT0.028S". The summary
      // wraps it in parens. We accept any non-empty contents.
      cy.get('.test-summary').invoke('text').then((txt) => {
        expect(txt).to.match(/\(PT[\d.]+S\)/)
      })
    })
  })
})
