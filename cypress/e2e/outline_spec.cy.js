describe('Outline view', () => {
  it('should show XQuery functions after opening a library module via collections pane', function () {

    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')

    cy.get('#directory li').contains('span', 'apps', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'eXide', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'modules', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'config.xqm', { timeout: 5000 }).click()

    cy.get('.path', { timeout: 10000 }).should('contain', '/db/apps/eXide/modules/config.xqm')

    cy.get('#tabs-outline').contains('outline').click()

    cy.get('#outline li', { timeout: 10000 }).should('have.length.at.least', 1)

    cy.get('#outline li a .outline-name').contains('config:access-allowed').should('exist')
    cy.get('#outline li a .outline-name').contains('config:repo-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:expath-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:app-info').should('exist')
  })
})
