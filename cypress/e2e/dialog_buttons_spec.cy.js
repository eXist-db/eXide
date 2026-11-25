// Dialog button convention: the bar is right-aligned, the safe choice (Cancel/Close)
// comes first, and the primary action is the LAST button -- highlighted, named after
// what it does, and focused on open unless it is destructive.
describe('Dialog buttons', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.dismissDialog()
  })

  const openDialog = () => cy.get('dialog.eXide-dialog[open]')
  const buttonLabels = () =>
    openDialog().find('.eXide-dialog-buttons button')
      .then($btns => Cypress._.map($btns, 'textContent'))

  it('puts a named action after Cancel in confirmations', () => {
    cy.window().then(win => {
      win.eXide.util.Dialog.input('Reload Document', 'Reload?', () => {}, { action: 'Reload' })
    })
    buttonLabels().should('deep.equal', ['Cancel', 'Reload'])
    openDialog().find('.eXide-dialog-buttons button').last().should('have.focus')
  })

  it('keeps focus on Cancel when the action is destructive', () => {
    cy.window().then(win => {
      win.eXide.util.Dialog.input('Confirm Deletion', 'Delete?', () => {}, { action: 'Delete', destructive: true })
    })
    buttonLabels().should('deep.equal', ['Cancel', 'Delete'])
    openDialog().find('.eXide-dialog-buttons button').last().should('have.class', 'destructive')
    openDialog().find('.eXide-dialog-buttons button').first().should('have.focus')
  })

  it('does not run the callback when Cancel is clicked', () => {
    const onConfirm = cy.stub().as('onConfirm')
    cy.window().then(win => {
      win.eXide.util.Dialog.input('Confirm Deletion', 'Delete?', onConfirm, { action: 'Delete', destructive: true })
    })
    openDialog().find('.eXide-dialog-buttons button').contains('Cancel').click()
    cy.get('@onConfirm').should('not.have.been.called')
  })

  it('offers Save when closing a document with unsaved changes', () => {
    cy.get('.cm-content').type('1')
    cy.window().then(win => win.eXide.app.closeDocument())
    cy.get('#dialog-confirm-close').closest('dialog.eXide-dialog[open]').within(() => {
      cy.get('.eXide-dialog-buttons button').then($btns => Cypress._.map($btns, 'textContent'))
        .should('deep.equal', ['Close Without Saving', 'Cancel', 'Save'])
      cy.get('.eXide-dialog-buttons button').last().should('have.focus')
      cy.contains('button', 'Cancel').click()
    })
  })

  it('lists Cancel before Go in Go to Line', () => {
    cy.get('#menu-navigate-line').click({ force: true })
    cy.get('#dialog-goto-line').closest('.eXide-dialog').find('.eXide-dialog-buttons button')
      .then($btns => Cypress._.map($btns, 'textContent'))
      .should('deep.equal', ['Cancel', 'Go'])
  })
})
