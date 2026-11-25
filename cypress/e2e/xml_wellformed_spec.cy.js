/**
 * Regression guard: malformed XML must be reported, not silently cleared.
 *
 * A body that isn't well-formed never reaches /api/editor/validate's handler —
 * Roaster fails to parse it and answers with its own error envelope, which has
 * no `status` field. compileError() only branches on status == "invalid", so an
 * unrecognized response fell through to clearErrors() and the editor showed the
 * document as clean. The position Roaster reports belongs to its own module, so
 * the location comes from the browser's parser instead.
 */
describe('XML well-formedness reporting', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('eXide.firstTime', '0')
      }
    })
    cy.dismissDialog()
  })

  function openNewXMLFile() {
    cy.get('#new').click()
    cy.get('#dialog-templates').closest('.eXide-dialog', { timeout: 10000 }).should('have.attr', 'open')
    cy.get('select.type-select').select('XML')
    cy.get('#dialog-templates').closest('.eXide-dialog')
      .find('.eXide-dialog-buttons button').contains('Create').click()
  }

  function validateNow(text) {
    cy.window().then((win) => {
      const editor = win.eXide.app.getEditor()
      const doc = editor.getActiveDocument()
      doc.setText(text)
      doc.lastValidation = 0
      return editor.validator.triggerNow(doc)
    })
  }

  it('reports malformed XML rather than showing the document as clean', () => {
    openNewXMLFile()

    validateNow('<collection>\n  <index>\n    <oops>\n</collection>')

    // The status bar names the problem …
    cy.get('#error-status', { timeout: 10000 })
      .invoke('text')
      .should('not.be.empty')
      .and('match', /oops|well-formed|terminated|error/i)
  })

  it('replaces the error with a well-formed status once the document is fixed', () => {
    openNewXMLFile()

    validateNow('<collection>\n  <index>\n    <oops>\n</collection>')
    cy.get('#error-status', { timeout: 10000 }).invoke('text').should('not.be.empty')
    cy.get('#exide-err-pill').should('have.class', 'has-error')

    // Success uses the calm #validation-status segment, not the error pill.
    // No matching grammar → "Well-formed only"; schema hits → "Validated against …".
    validateNow('<collection>\n  <index/>\n</collection>')
    cy.get('#error-status', { timeout: 10000 }).invoke('text').should('be.empty')
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    // Assert text on the element itself — .should('not.have.attr') yields
    // undefined, so chaining .invoke('text') after it is unsafe.
    cy.get('#validation-status', { timeout: 10000 }).should('be.visible')
    cy.get('#validation-status-label')
      .invoke('text')
      .should('match', /Well-formed only/i)
  })
})
