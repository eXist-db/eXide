/**
 * Regression test: "Run as test" must reflect the current editor buffer,
 * not the stored collection version.
 *
 * Background: @line-o on PR #794 reported that editing a testsuite and
 * clicking Run as test silently runs the *stored* version (the api/test
 * endpoint reads from doc.getPath()). Unsaved edits are ignored.
 *
 * Behaviour now:
 *   1. Untitled buffer (no path) → user-visible error, no api/test call.
 *   2. Dirty saved buffer → auto-save, then api/test fires.
 *   3. Clean buffer → api/test fires directly (existing behaviour).
 */
describe('Run as test — dirty editor buffer', () => {
  var testCollection = '/db'
  var testFile = 'cypress-test-run-' + Date.now() + '.xq'

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

  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  function clickRunAsTest() {
    cy.get('#menu-xquery-run-test').click({ force: true })
  }

  // Minimal XQSuite testsuite that always passes.
  var initialSuite =
    'xquery version "3.1";\n' +
    'module namespace t = "http://example.com/cypress-test";\n' +
    'declare namespace test = "http://exist-db.org/xquery/xqsuite";\n' +
    'declare\n' +
    '    %test:assertEquals("a")\n' +
    'function t:initial() { "a" };\n'

  // Same suite, edited to assert "b" instead — must surface in the run.
  var editedSuite = initialSuite.replace(/"a"/g, '"b"')

  it('untitled buffer → user error, no api/test call', () => {
    cy.intercept('POST', '**/api/test').as('runTest')
    setEditorContent(initialSuite)
    clickRunAsTest()
    // eXide.util.error shows a toast with the "eXide-toast-error" class.
    cy.get('.eXide-toast-error', { timeout: 5000 })
      .should('contain.text', 'Save the testsuite')
    // And confirm api/test was NOT hit.
    cy.wait(500)
    cy.get('@runTest.all').should('have.length', 0)
  })

  it('dirty saved buffer → auto-save, then run with edited content', () => {
    cy.intercept('POST', '**/api/test').as('runTest')

    // Save the initial suite to /db/<testFile>.
    cy.window().then((win) => {
      win.eXide.app.getEditor().activeDoc.setPath(testCollection + '/' + testFile, testFile)
      win.eXide.app.getEditor().activeDoc.editable = true
      win.eXide.app.getEditor().activeDoc.syntax = 'xquery'
      win.eXide.app.getEditor().activeDoc.mime = 'application/xquery'
    })
    setEditorContent(initialSuite)
    cy.window().then((win) => {
      var ed = win.eXide.app.getEditor()
      return new Cypress.Promise((resolve) => {
        ed.saveDocument(null, resolve, function (msg) {
          throw new Error('initial save failed: ' + msg)
        })
      })
    })

    // Now edit (without saving) and Run as test.
    setEditorContent(editedSuite)
    cy.window().then((win) => {
      // Confirm buffer is dirty before clicking run.
      expect(win.eXide.app.getEditor().activeDoc.saved).to.be.false
    })

    clickRunAsTest()

    // api/test should fire after the auto-save completes.
    cy.wait('@runTest', { timeout: 15000 }).its('response.statusCode').should('eq', 200)

    // Buffer should now be marked saved (auto-save succeeded).
    cy.window().then((win) => {
      expect(win.eXide.app.getEditor().activeDoc.saved).to.be.true
    })

    // The displayed result should reflect the edited suite (assertion
    // "b" vs "a"). The stored version had "a", so a failed run would
    // mean we ran the stale version.
    cy.get('.results-container .results', { timeout: 10000 }).should('exist')
  })

  after(() => {
    cy.cleanupTestFiles()
  })
})
