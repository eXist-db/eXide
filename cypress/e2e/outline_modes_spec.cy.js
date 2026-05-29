describe('Outline modes and filter', () => {
  function setup() {
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
    cy.get('#outline li', { timeout: 10000 }).should('have.length.at.least', 2)
  }

  it('shows toolbar with three mode buttons', function () {
    setup()
    cy.get('#outline-toolbar').should('exist')
    cy.get('[data-outline-mode="nested-doc"]').should('exist')
    cy.get('[data-outline-mode="flat-doc"]').should('exist')
    cy.get('[data-outline-mode="flat-alpha"]').should('exist')
  })

  it('nested-doc mode is active by default', function () {
    setup()
    cy.get('[data-outline-mode="nested-doc"]').should('have.class', 'active')
    cy.get('[data-outline-mode="flat-doc"]').should('not.have.class', 'active')
    cy.get('[data-outline-mode="flat-alpha"]').should('not.have.class', 'active')
  })

  it('switches to flat-doc mode', function () {
    setup()
    cy.get('[data-outline-mode="flat-doc"]').click()
    cy.get('[data-outline-mode="flat-doc"]').should('have.class', 'active')
    cy.get('[data-outline-mode="nested-doc"]').should('not.have.class', 'active')

    cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 2)
  })

  it('switches to flat-alpha mode and sorts alphabetically', function () {
    setup()
    cy.get('[data-outline-mode="flat-alpha"]').click()
    cy.get('[data-outline-mode="flat-alpha"]').should('have.class', 'active')

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

  it('flat-doc mode preserves document order', function () {
    setup()
    var nestedOrder = []
    cy.get('#outline li a .outline-name').then(($names) => {
      $names.each(function () {
        nestedOrder.push(Cypress.$(this).text().trim())
      })
    })

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

  it('filter input narrows visible items', function () {
    setup()
    var totalCount
    cy.get('#outline li').then(($items) => {
      totalCount = $items.length
    })

    cy.get('#outline-filter').clear().type('access')

    cy.get('#outline li').then(($items) => {
      var visible = $items.filter(function () {
        return Cypress.$(this).css('display') !== 'none'
      })
      expect(visible.length).to.be.below(totalCount)
      expect(visible.text()).to.contain('access')
    })
  })

  it('clearing filter shows all items again', function () {
    setup()
    var totalCount
    cy.get('#outline li').then(($items) => {
      totalCount = $items.length
    })

    cy.get('#outline-filter').clear().type('access')

    cy.get('#outline-filter').clear()

    cy.get('#outline li').then(($items) => {
      var visible = $items.filter(function () {
        return Cypress.$(this).css('display') !== 'none'
      })
      expect(visible.length).to.eq(totalCount)
    })
  })

  it('clicking an outline item navigates the editor', function () {
    setup()
    cy.on('uncaught:exception', () => false)

    cy.get('#outline li a').first().click()

    cy.get('#editor .cm-editor', { timeout: 5000 }).should('exist')
  })
})
