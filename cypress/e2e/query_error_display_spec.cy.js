/**
 * Regression test: when running an XQuery that the server rejects, eXide
 * must display the real server-side error message — NOT the generic
 * "Unknown error" placeholder.
 *
 * Background (PR #794 review by @line-o): a syntactically-correct but
 * server-rejected query like `count(//p)` was surfacing as "Unknown error"
 * because eXide read `err.error` from the API response, but
 * existdb-openapi's error shape uses `err.description`. The fix in
 * src/eXide.js coalesces the known field names (description / error /
 * message) and falls back to a stringified payload so the user always
 * sees something actionable.
 *
 * These tests dispatch deliberately broken queries (XQuery 3.1 parse/
 * static/type errors that any conformant XQuery engine will reject) and
 * assert that the rendered error contains the real message, not the
 * placeholder.
 */
describe('Query error display', () => {
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

  /**
   * Run the current editor buffer and return the raw error text from
   * #error-status (the source-of-truth element that eXide writes to via
   * editor.evalError(); the pill + panel + observer all read from here).
   *
   * Reading the source directly avoids UI-animation timing races that
   * would otherwise come from waiting for the panel to slide open.
   */
  function runAndCaptureError() {
    cy.get('#run').click()
    cy.get('#exide-err-pill.has-error', { timeout: 10000 }).should('exist')
    return cy.get('#error-status').invoke('text')
  }

  /**
   * Clear the error so the next test starts fresh. Writes directly to
   * the source element — the MutationObserver cascades the empty value
   * through the pill and panel.
   */
  function clearError() {
    cy.window().then((win) => {
      var src = win.document.getElementById('error-status')
      if (src) src.textContent = ''
    })
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
  }

  it('static error (XPST0081) — shows real cause, not "Unknown error"', () => {
    // Undeclared namespace prefix — guaranteed XPST0081 on any conformant
    // XQuery engine, regardless of database content.
    setEditorContent('//does-not-exist:foo')
    runAndCaptureError().should((text) => {
      expect(text).not.to.contain('Unknown error')
      // The real cause should be referenced — either by code or by the
      // namespace-prefix language. Match either so this test stays robust
      // across small wording changes in the server's error format.
      expect(text).to.satisfy((t) =>
        /XPST0081/.test(t) ||
        /namespace prefix/i.test(t) ||
        /does-not-exist/.test(t)
      )
    })

    clearError()
  })

  it('type error (XPTY0004) — shows real cause, not "Unknown error"', () => {
    // Adding a string to a number — guaranteed XPTY0004.
    setEditorContent('1 + "a"')
    runAndCaptureError().should((text) => {
      expect(text).not.to.contain('Unknown error')
      expect(text).to.satisfy((t) =>
        /XPTY0004/.test(t) ||
        /type error/i.test(t) ||
        /can not be an operand/i.test(t)
      )
    })

    cy.get('#exide-err-panel-dismiss').click()
  })

  it('syntax error — shows real cause, not "Unknown error"', () => {
    // Unterminated string literal — parser error.
    setEditorContent('let $x := "unterminated')
    runAndCaptureError().should((text) => {
      expect(text).not.to.contain('Unknown error')
      // Should reference a syntax or parse problem
      expect(text).to.satisfy((t) =>
        /syntax/i.test(t) ||
        /parse/i.test(t) ||
        /unexpected/i.test(t) ||
        /expecting/i.test(t) ||
        /XPST0003/.test(t)
      )
    })

    cy.get('#exide-err-panel-dismiss').click()
  })
})
