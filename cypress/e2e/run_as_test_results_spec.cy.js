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

  it('%test:pending renders distinct pending row + summary count', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-pending";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals(1) function t:passes() { 1 };\n' +
      'declare %test:pending %test:assertEquals(1) function t:skipped() { 1 };\n'

    runSuite(src).within(() => {
      cy.get('.test-summary .test-pending').should('contain.text', '1 pending')
      cy.get('tr.test-pending').should('have.length', 1)
      cy.get('tr.test-pending').should('contain.text', 'skipped')
      cy.get('tr.test-pass').should('have.length', 1)
    })
  })

  it('setup-failure renders distinct panel instead of empty table', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-setup";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:setUp function t:setup() {\n' +
      '  error(xs:QName("t:setup-boom"), "setup blew up")\n' +
      '};\n' +
      'declare %test:assertEquals(1) function t:never-runs() { 1 };\n'

    runSuite(src).within(() => {
      cy.get('.test-setup-failure-summary').should('exist')
      cy.get('.test-setup-failure-label').should('contain.text', 'setUp')
      cy.get('.test-setup-failure').should('contain.text', 'setup blew up')
      // Empty results table not shown — the setup panel takes over.
      cy.get('tbody tr').should('not.exist')
    })
  })

  it('JUnit XML download button appears and is wired to a blob', () => {
    var src =
      'xquery version "3.1";\n' +
      'module namespace t = "http://example.com/cy-junit";\n' +
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
      'declare %test:assertEquals(1) function t:trivial() { 1 };\n'

    runSuite(src).within(() => {
      cy.get('.test-download-junit').should('be.visible')
        .and('contain.text', 'JUnit XML')
    })
    // Verify the JSON payload carries the serialized xml the button will save.
    cy.get('@runTest').its('response.body.xml').should('match', /<testsuites/)
  })

  it('clicking a test row jumps to the annotation line in the editor', () => {
    var src =
      'xquery version "3.1";\n' +                                  // 1
      'module namespace t = "http://example.com/cy-jump";\n' +     // 2
      'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' + // 3
      '\n' +                                                       // 4
      '\n' +                                                       // 5
      'declare %test:assertEquals(1) function t:first() { 1 };\n' +  // 6
      '\n' +                                                       // 7
      '\n' +                                                       // 8
      '\n' +                                                       // 9
      'declare %test:assertEquals(2) function t:second() { 2 };\n'   // 10

    runSuite(src).within(() => {
      // Rows expose data-source/data-line for the click-to-jump handler.
      cy.get('tr.test-clickable[data-source]').should('have.length', 2)
      cy.get('tr.test-clickable').eq(1).should('have.attr', 'data-line')
        .and('match', /^\d+$/)
      // Click second-row → editor cursor should move to that line.
      cy.get('tr.test-clickable').eq(1).then(($row) => {
        var line = parseInt($row.attr('data-line'), 10)
        expect(line, 'data-line is a positive int').to.be.greaterThan(0)
        cy.wrap($row).click()
        cy.window().then((win) => {
          var view = win.eXide.app.getEditor().editor
          var head = view.state.selection.main.head
          var cursorLine = view.state.doc.lineAt(head).number
          // CM6 .number is 1-indexed, matching data-line.
          expect(cursorLine).to.eq(line)
        })
      })
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
