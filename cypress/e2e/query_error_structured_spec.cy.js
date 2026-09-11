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

  it('surfaces a real failing query as an error pill with the cause', () => {
    // Version-robust: works whether the bed's existdb-openapi returns the
    // #71 QueryError shape or the current-release generic { error }. The
    // structured-panel detail and the message/raw split are asserted
    // deterministically by the cy.intercept test below.
    setEditorContent('1 + "oops"')
    cy.get('#run').click()

    cy.get('#exide-err-pill.has-error', { timeout: 10000 }).should('exist')
    // The pill shows the cause, concisely.
    cy.get('#exide-err-pill-label')
      .invoke('text')
      .then((label) => {
        expect(label.trim().length).to.be.greaterThan(0)
        expect(label.length).to.be.at.most(60)
      })

    // Cleanup so subsequent tests don't see this error sticky
    cy.get('#exide-err-panel-dismiss').click()
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
  })

  it('prefers message over raw and exposes raw in the hover dump (existdb-openapi#71 envelope)', () => {
    // Stub a #71 envelope so this is deterministic regardless of the bed's
    // existdb-openapi version: { code, message, line, column, raw }, HTTP 400.
    // Exercises the full client path: runQueryCursor's coalesce →
    // editor.evalError → the structured panel.
    cy.intercept('POST', '**/existdb-openapi/api/query', {
      statusCode: 400,
      body: {
        code: 'err:XPTY0004',
        message: "'xs:string(oops)' can not be an operand for +",
        line: 1,
        column: 3,
        raw: 'It is a type error if, during the static analysis phase, an expression is found to have a static type that is not appropriate.'
      }
    }).as('q71')

    setEditorContent('1 + "oops"')
    cy.get('#run').click()
    cy.wait('@q71')

    cy.get('#exide-err-pill.has-error', { timeout: 10000 }).should('exist')

    // Panel Description shows the *concise* message, not the verbose raw boilerplate.
    cy.get('#exide-err-panel-body .ep-field-desc .ep-field-value')
      .should('contain.text', 'can not be an operand')
      .and('not.contain.text', 'It is a type error if')
    // Code and location still surface.
    cy.get('#exide-err-panel-body .ep-field-code .ep-field-value').should('contain.text', 'err:XPTY0004')
    cy.get('#exide-err-panel-body .ep-field-loc .ep-field-value')
      .should('contain.text', 'line 1').and('contain.text', 'column 3')
    // The verbose detail is preserved under Raw in the hover dump.
    cy.get('#exide-err-pill')
      .should('have.attr', 'title')
      .and('include', 'Raw:')
      .and('include', 'It is a type error if')

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
