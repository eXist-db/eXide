describe('XML validation status UX', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html', {
      onBeforeLoad(win) { win.localStorage.setItem('eXide.firstTime', '0') }
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

  it('shows Validated against for collection.xconf without an error pill', () => {
    openNewXMLFile()
    validateNow(`<?xml version="1.0"?>
<collection xmlns="http://exist-db.org/collection-config/1.0">
  <index/>
</collection>`)
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    cy.get('#validation-status', { timeout: 10000 }).should('be.visible')
    cy.get('#validation-status-label')
      .invoke('text')
      .should('match', /Validated against collection\.xconf\.xsd/i)
    cy.get('#status-bar').screenshot('validation-status-schema-ok')
  })

  it('shows Well-formed only without an error pill', () => {
    openNewXMLFile()
    validateNow('<?xml version="1.0"?><note><text>hi</text></note>')
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    cy.get('#validation-status', { timeout: 10000 }).should('be.visible')
    cy.get('#validation-status-label')
      .invoke('text')
      .should('match', /Well-formed only/i)
    cy.get('#status-bar').screenshot('validation-status-wellformed-only')
  })

  it('shows schema errors on the error pill and clears validation status', () => {
    openNewXMLFile()
    validateNow(`<?xml version="1.0"?>
<collection xmlns="http://exist-db.org/collection-config/1.0"/>`)
    cy.get('#validation-status').should('not.be.visible')
    cy.get('#exide-err-pill').should('have.class', 'has-error')
    cy.get('#error-status').invoke('text').should('match', /assert|count/i)
    cy.get('#status-bar').screenshot('validation-status-schema-error')
  })
})
