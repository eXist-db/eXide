describe('Preferences dialog', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
  })

  function openPreferences() {
    cy.get('#menu-edit-preferences').click({ force: true })
    cy.get('#preferences-dialog').should('be.visible')
  }

  it('opens via Edit menu', () => {
    openPreferences()
    cy.get('#preferences-dialog form').should('exist')
    // Check fieldsets are present
    cy.get('#preferences-dialog legend').should('have.length.at.least', 3)
  })

  it('shows current theme setting', () => {
    openPreferences()
    cy.get('#theme').should('have.value', 'light')
  })

  it('changes theme to dark', () => {
    openPreferences()
    cy.get('#theme').select('dark')
    // Body should get dark class
    cy.get('body').should('have.class', 'dark')
  })

  it('changes font size', () => {
    openPreferences()
    cy.get('#pref-font-size').select('16')
    // CM6 editor should reflect the new font size
    cy.get('.cm-editor .cm-content').should('have.css', 'font-size', '16px')
  })

  it('toggles show invisibles', () => {
    openPreferences()
    // Check current state
    cy.get('#pref-show-invisibles').then(($cb) => {
      var wasChecked = $cb.prop('checked')
      // Toggle it
      cy.get('#pref-show-invisibles').click()
      // Verify it changed
      cy.get('#pref-show-invisibles').should(wasChecked ? 'not.be.checked' : 'be.checked')
    })
  })

  it('persists settings across reload', () => {
    openPreferences()
    cy.get('#pref-font-size').select('16')
    // Close dialog
    cy.get('#preferences-dialog').closest('.eXide-dialog').find('.eXide-dialog-buttons button').contains('Close').click()

    // Reload and check persistence
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    openPreferences()
    cy.get('#pref-font-size').should('have.value', '16')

    // Reset to default
    cy.get('#pref-font-size').select('14')
  })

  it('changes indent mode', () => {
    openPreferences()
    cy.get('#pref-indent').select('Tabs')
    cy.get('#pref-indent').should('have.value', 'Tabs')
  })

  it('changes prettier print width', () => {
    openPreferences()
    cy.get('#pref-prettier-print-width').select('120')
    cy.get('#pref-prettier-print-width').should('have.value', '120')
    // Reset
    cy.get('#pref-prettier-print-width').select('80')
  })

  it('reverts theme on close when changed to dark then back', () => {
    openPreferences()
    cy.get('#theme').select('dark')
    cy.get('body').should('have.class', 'dark')
    cy.get('#theme').select('light')
    cy.get('body').should('not.have.class', 'dark')
  })
})
