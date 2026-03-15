describe('Outline view', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
  })

  it('should show XQuery functions after opening a library module via collections pane', () => {
    // Collections tab is active by default; navigate the tree
    // db root auto-expands; click into apps > eXide > modules > config.xqm
    cy.get('#directory li').contains('span', 'apps', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'eXide', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'modules', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'config.xqm', { timeout: 5000 }).click()

    // Verify the file is open in the editor
    cy.get('.path', { timeout: 10000 }).should('contain', '/db/apps/eXide/modules/config.xqm')

    // Switch to outline tab
    cy.get('#tabs-outline').contains('outline').click()

    // Wait for outline to populate — functions should appear
    cy.get('#outline li', { timeout: 10000 }).should('have.length.at.least', 1)

    // Check for the config:access-allowed function
    cy.get('#outline li a .outline-name').contains('config:access-allowed').should('exist')

    // Check other expected functions are present
    cy.get('#outline li a .outline-name').contains('config:repo-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:expath-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:app-info').should('exist')
  })
})
