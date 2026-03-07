describe('Panel resize handles', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    // Wait for eXide to fully initialize
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
  })

  function runQuery() {
    // Select all content and replace with a valid query
    cy.get('#editor .cm-content').click()
    cy.get('#editor .cm-content').type('{ctrl+a}{backspace}1 + 1', { delay: 0 })
    cy.get('#eval').click()
    // Wait for results to appear
    cy.get('.panel-south .results', { timeout: 5000 }).should('not.be.empty')
  }

  describe('West panel (outline)', () => {
    it('toggles closed and open by clicking the resize handle', () => {
      cy.get('.panel-west').should('be.visible')
      cy.get('.panel-west').invoke('outerWidth').should('be.gt', 50)

      // Click the resize handle to collapse
      cy.get('.panel-west .resize-handle').click()
      cy.get('.panel-west').invoke('outerWidth').should('be.lte', 12)

      // Click again to expand
      cy.get('.panel-west .minimized').click()
      cy.get('.panel-west').invoke('outerWidth').should('be.gt', 50)
    })
  })

  describe('South panel (results)', () => {
    it('shows results after running a query', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
    })

    it('toggles closed and open by clicking the resize handle', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)

      // Click the resize handle to collapse
      cy.get('.panel-south .resize-handle').click()
      cy.get('.panel-south').invoke('outerHeight').should('be.lte', 12)

      // Click again to expand
      cy.get('.panel-south .minimized').click()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
    })
  })

  describe('Drag to resize', () => {
    it('resizes the west panel by dragging its handle', () => {
      cy.get('.panel-west').invoke('outerWidth').then((initialWidth) => {
        // Drag the west handle 80px to the right to widen
        cy.get('.panel-west .resize-handle').then(($handle) => {
          const rect = $handle[0].getBoundingClientRect()
          const startX = rect.left + rect.width / 2
          const startY = rect.top + rect.height / 2

          cy.get('.panel-west .resize-handle')
            .trigger('mousedown', { pageX: startX, pageY: startY, which: 1 })
          cy.get('.layout')
            .trigger('mousemove', { pageX: startX + 80, pageY: startY, which: 1 })
          cy.document().trigger('mouseup')

          cy.get('.panel-west').invoke('outerWidth').should('be.gt', initialWidth + 40)
        })
      })
    })

    it('resizes the south panel by dragging its handle', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').then((initialHeight) => {
        // Drag the south handle 100px up to make it taller
        cy.get('.panel-south .resize-handle').then(($handle) => {
          const rect = $handle[0].getBoundingClientRect()
          const startX = rect.left + rect.width / 2
          const startY = rect.top + rect.height / 2

          cy.get('.panel-south .resize-handle')
            .trigger('mousedown', { pageX: startX, pageY: startY, which: 1 })
          cy.get('.layout')
            .trigger('mousemove', { pageX: startX, pageY: startY - 100, which: 1 })
          cy.document().trigger('mouseup')

          cy.get('.panel-south').invoke('outerHeight').should('be.gt', initialHeight + 50)
        })
      })
    })

    it('resizes the east panel by dragging its handle', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
      cy.get('.layout-switcher').click()
      cy.get('.panel-east').invoke('outerWidth').then((initialWidth) => {
        // Drag the east handle 80px to the left to widen
        cy.get('.panel-east .resize-handle').then(($handle) => {
          const rect = $handle[0].getBoundingClientRect()
          const startX = rect.left + rect.width / 2
          const startY = rect.top + rect.height / 2

          cy.get('.panel-east .resize-handle')
            .trigger('mousedown', { pageX: startX, pageY: startY, which: 1 })
          cy.get('.layout')
            .trigger('mousemove', { pageX: startX - 80, pageY: startY, which: 1 })
          cy.document().trigger('mouseup')

          cy.get('.panel-east').invoke('outerWidth').should('be.gt', initialWidth + 40)
        })
      })
    })
  })

  describe('East panel (results side)', () => {
    it('switches results to east panel via layout switcher', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)

      // Click layout switcher to move results to east
      cy.get('.layout-switcher').click()
      cy.get('.panel-east').should('be.visible')
      cy.get('.panel-east').invoke('outerWidth').should('be.gt', 50)

      // Results content should be in the east panel
      cy.get('.panel-east .navbar').should('exist')
      cy.get('.panel-east #results-body').should('exist')
    })

    it('toggles closed and open by clicking the resize handle', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
      cy.get('.layout-switcher').click()
      cy.get('.panel-east').invoke('outerWidth').should('be.gt', 50)

      // Click the resize handle to collapse
      cy.get('.panel-east .resize-handle').click()
      cy.get('.panel-east').invoke('outerWidth').should('be.lte', 12)

      // Click again to expand
      cy.get('.panel-east .minimized').click()
      cy.get('.panel-east').invoke('outerWidth').should('be.gt', 50)

      // Content should still be there after toggle
      cy.get('.panel-east #results-body').should('be.visible')
    })

    it('switches back to south panel', () => {
      runQuery()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
      cy.get('.layout-switcher').click()
      cy.get('.panel-east').invoke('outerWidth').should('be.gt', 50)

      // Switch back to south
      cy.get('.layout-switcher').click()
      cy.get('.panel-south').invoke('outerHeight').should('be.gt', 50)
      cy.get('.panel-south .navbar').should('exist')
      cy.get('.panel-south #results-body').should('exist')
    })
  })
})
