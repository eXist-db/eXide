describe('Command Palette', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled')
  })

  function openCommandPalette() {
    cy.get('#menu-navigate-commands').click({ force: true })
    cy.get('dialog.quick-picker[open]', { timeout: 5000 }).should('exist')
  }

  it('opens and shows filter input', () => {
    openCommandPalette()
    cy.get('dialog.quick-picker .quick-picker-filter').should('be.visible')
    cy.get('dialog.quick-picker .quick-picker-title').should('have.text', 'Command Palette')
  })

  it('closes on Escape key', () => {
    openCommandPalette()
    cy.get('dialog.quick-picker .quick-picker-filter').type('{esc}')
    cy.get('dialog.quick-picker[open]').should('not.exist')
  })

  it('closes on close button click', () => {
    openCommandPalette()
    cy.get('dialog.quick-picker .quick-picker-close').click()
    cy.get('dialog.quick-picker[open]').should('not.exist')
  })

  it('filters commands by typing', () => {
    openCommandPalette()
    cy.get('dialog.quick-picker .quick-picker-filter').type('save')
    cy.get('dialog.quick-picker .quick-picker-list li').should('have.length.greaterThan', 0)
    cy.get('dialog.quick-picker .quick-picker-list li .quick-picker-label')
      .first().invoke('text').should('match', /save/i)
    // Clean up
    cy.get('dialog.quick-picker .quick-picker-filter').type('{esc}')
  })
})
