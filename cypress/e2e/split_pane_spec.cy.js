describe('West panel split/tab toggle', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    // Ensure we start in tabbed mode (default)
    cy.get('.panel-west').should('not.have.class', 'split-pane')
  })

  it('switches from tabbed to split when collections tab is active', () => {
    // Collections tab is active by default (index 0)
    cy.get('#tabs-outline a.tab').first().should('have.class', 'active')
    cy.get('#directory-body').should('have.css', 'visibility', 'visible')
    cy.get('#outline-body').should('have.css', 'visibility', 'hidden')

    // Toggle to split
    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('have.class', 'split-pane')

    // Both panels should be visible
    cy.get('#directory-body').should('have.css', 'visibility', 'visible')
    cy.get('#outline-body').should('have.css', 'visibility', 'visible')
  })

  it('switches from tabbed to split when outline tab is active', () => {
    // Click the outline tab
    cy.get('#tabs-outline a.tab').last().click()
    cy.get('#tabs-outline a.tab').last().should('have.class', 'active')
    cy.get('#outline-body').should('have.css', 'visibility', 'visible')
    cy.get('#directory-body').should('have.css', 'visibility', 'hidden')

    // Toggle to split
    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('have.class', 'split-pane')

    // Both panels should be visible
    cy.get('#directory-body').should('have.css', 'visibility', 'visible')
    cy.get('#outline-body').should('have.css', 'visibility', 'visible')
  })

  it('switches from split back to tabbed, restoring the active tab', () => {
    // Click the outline tab, then toggle to split
    cy.get('#tabs-outline a.tab').last().click()
    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('have.class', 'split-pane')

    // Toggle back to tabbed
    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('not.have.class', 'split-pane')

    // Outline tab was active, so outline should be visible and collections hidden
    cy.get('#tabs-outline a.tab').last().should('have.class', 'active')
    cy.get('#outline-body').should('have.css', 'visibility', 'visible')
    cy.get('#directory-body').should('have.css', 'visibility', 'hidden')
  })

  it('switches from split back to tabbed with collections tab active', () => {
    // Collections tab is active by default, toggle to split then back
    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('have.class', 'split-pane')

    cy.get('#toggle-split-pane').click()
    cy.get('.panel-west').should('not.have.class', 'split-pane')

    // Collections tab was active, so collections should be visible and outline hidden
    cy.get('#tabs-outline a.tab').first().should('have.class', 'active')
    cy.get('#directory-body').should('have.css', 'visibility', 'visible')
    cy.get('#outline-body').should('have.css', 'visibility', 'hidden')
  })
})
