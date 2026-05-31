/**
 * Regression test: when a query fails, eXide must surface the full
 * structured error payload — not just the description.
 *
 * Background: @line-o on PR #794 asked for line/column/module info
 * (not just the description) to be accessible. The fix:
 *   - editor.evalError(msg, gotoLine, errObj) stashes the full err
 *     object in #error-status's `data-error` attribute.
 *   - error-status-ui.js renders a multi-field panel and sets the
 *     pill's `title` attribute with a plain-text dump.
 *
 * This test runs a deliberately broken query, then asserts that:
 *   1. The pill carries a `title` attribute with the full dump
 *      (so hovering the pill reveals every field).
 *   2. The opened panel body shows distinct rows for Code / Location /
 *      Description (the always-present fields).
 *   3. The pill's short label is still concise (didn't regress).
 */
describe('Query error display — structured fields', () => {
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

  it('exposes structured fields in pill title and panel body', () => {
    // Type error — guaranteed to come back with code, line, column, description
    setEditorContent('1 + "oops"')
    cy.get('#run').click()

    // Wait until the error pill is set
    cy.get('#exide-err-pill.has-error', { timeout: 10000 }).should('exist')

    // (1) Pill carries a `title` attribute with the structured dump
    cy.get('#exide-err-pill')
      .should('have.attr', 'title')
      .and('include', 'Code:')
      .and('include', 'err:XPTY0004')
      .and('include', 'Location:')
      .and('include', 'line 1')
      .and('include', 'Description:')

    // (2) The auto-opened panel body shows the structured rows.
    cy.get('#exide-err-panel-body.ep-structured').should('exist')
    cy.get('#exide-err-panel-body .ep-field-code .ep-field-value')
      .should('contain.text', 'err:XPTY0004')
    cy.get('#exide-err-panel-body .ep-field-loc .ep-field-value')
      .should('contain.text', 'line 1')
      .and('contain.text', 'column 3')
    cy.get('#exide-err-panel-body .ep-field-desc .ep-field-value')
      .should('contain.text', 'type error')

    // (3) Pill label is still concise — shouldn't dump the whole thing.
    cy.get('#exide-err-pill-label')
      .invoke('text')
      .then((label) => {
        expect(label.length).to.be.at.most(60)
      })

    // Cleanup so subsequent tests don't see this error sticky
    cy.get('#exide-err-panel-dismiss').click()
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
  })

  it('falls back gracefully when the error has no structured payload', () => {
    // Force a non-structured error: hit an endpoint that returns HTML/text
    // by invoking validator-style flow. The simplest deterministic way is
    // to drive editor.evalError directly with no errObj, mirroring legacy
    // callers — then assert the panel still works.
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      editor.evalError('Cannot compile xquery: legacy unstructured error', false)
    })
    cy.get('#exide-err-pill.has-error', { timeout: 5000 }).should('exist')
    // Panel body should NOT carry the structured class — it falls back to
    // the original raw-text formatter.
    cy.get('#exide-err-panel-body').should('not.have.class', 'ep-structured')
    // And the pill should NOT carry a structured title attribute
    // (no extra fields available). The legacy path may omit `title`
    // entirely or set it to the raw text — either is acceptable.
    cy.get('#exide-err-pill').then(($pill) => {
      var title = $pill.attr('title')
      if (title) {
        expect(title).not.to.include('Code:')
        expect(title).not.to.include('Description:')
      }
    })

    cy.get('#exide-err-panel-dismiss').click()
  })
})
