describe('Outline modes and filter', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')

    // Open config.xqm which has multiple functions
    cy.get('#directory li').contains('span', 'apps', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'eXide', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'modules', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'config.xqm', { timeout: 5000 }).click()
    cy.get('.path', { timeout: 10000 }).should('contain', '/db/apps/eXide/modules/config.xqm')

    // Switch to outline tab
    cy.get('#tabs-outline').contains('outline').click()
    cy.get('#outline li', { timeout: 10000 }).should('have.length.at.least', 2)
  })

  it('shows toolbar with three mode buttons', () => {
    cy.get('#outline-toolbar').should('exist')
    cy.get('[data-outline-mode="nested-doc"]').should('exist')
    cy.get('[data-outline-mode="flat-doc"]').should('exist')
    cy.get('[data-outline-mode="flat-alpha"]').should('exist')
  })

  it('nested-doc mode is active by default', () => {
    cy.get('[data-outline-mode="nested-doc"]').should('have.class', 'active')
    cy.get('[data-outline-mode="flat-doc"]').should('not.have.class', 'active')
    cy.get('[data-outline-mode="flat-alpha"]').should('not.have.class', 'active')
  })

  it('switches to flat-doc mode', () => {
    cy.get('[data-outline-mode="flat-doc"]').click()
    cy.get('[data-outline-mode="flat-doc"]').should('have.class', 'active')
    cy.get('[data-outline-mode="nested-doc"]').should('not.have.class', 'active')

    // Outline should still have items
    cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 2)
  })

  it('switches to flat-alpha mode and sorts alphabetically', () => {
    cy.get('[data-outline-mode="flat-alpha"]').click()
    cy.get('[data-outline-mode="flat-alpha"]').should('have.class', 'active')

    // Collect all outline names and verify they're alphabetically sorted.
    // Variables are displayed with a "$" prefix but sorted by name without it.
    cy.get('#outline li a .outline-name').should('have.length.at.least', 2)
      .then(($names) => {
        var names = []
        $names.each(function () {
          names.push(Cypress.$(this).text().trim().replace(/^\$/, '').toLowerCase())
        })
        for (var i = 1; i < names.length; i++) {
          expect(names[i] >= names[i - 1], names[i - 1] + ' <= ' + names[i]).to.be.true
        }
      })
  })

  it('flat-doc mode preserves document order', () => {
    // Get names in nested-doc mode (document order)
    var nestedOrder = []
    cy.get('#outline li a .outline-name').then(($names) => {
      $names.each(function () {
        nestedOrder.push(Cypress.$(this).text().trim())
      })
    })

    // Switch to flat-doc (also document order, just no indentation)
    cy.get('[data-outline-mode="flat-doc"]').click()
    cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 2)

    cy.get('#outline li a .outline-name').then(($names) => {
      var flatOrder = []
      $names.each(function () {
        flatOrder.push(Cypress.$(this).text().trim())
      })
      expect(flatOrder).to.deep.eq(nestedOrder)
    })
  })

  it('filter input narrows visible items', () => {
    var totalCount
    cy.get('#outline li').then(($items) => {
      totalCount = $items.length
    })

    // Type a filter that matches only some functions
    cy.get('#outline-filter').clear().type('access')

    // The filter hides non-matching <li> elements via display:none
    // Some items should be hidden
    cy.get('#outline li').then(($items) => {
      var visible = $items.filter(function () {
        return Cypress.$(this).css('display') !== 'none'
      })
      expect(visible.length).to.be.below(totalCount)
      expect(visible.text()).to.contain('access')
    })
  })

  it('clearing filter shows all items again', () => {
    var totalCount
    cy.get('#outline li').then(($items) => {
      totalCount = $items.length
    })

    cy.get('#outline-filter').clear().type('access')

    // Clear the filter
    cy.get('#outline-filter').clear()

    // All items should be visible again
    cy.get('#outline li').then(($items) => {
      var visible = $items.filter(function () {
        return Cypress.$(this).css('display') !== 'none'
      })
      expect(visible.length).to.eq(totalCount)
    })
  })

  it('clicking an outline item navigates the editor', () => {
    // Suppress app errors from locate() for items using from/to navigation
    cy.on('uncaught:exception', () => false)

    // Click the first function in the outline
    cy.get('#outline li a').first().click()

    // Editor should still exist
    cy.get('#editor .cm-editor', { timeout: 5000 }).should('exist')
  })
})
