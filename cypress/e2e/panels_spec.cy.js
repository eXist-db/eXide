describe('Panel resize handles', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    // Wait for eXide to fully initialize
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
  })

  function runQuery() {
    // Select all content and replace with a valid query
    cy.get('#editor .cm-content').click()
    cy.get('#editor .cm-content').type('{ctrl+a}{backspace}1 + 1', { delay: 0 })
    cy.get('#run').click()
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
  })

  describe('East panel (monitor)', () => {
    it('toggles open and closed via the monitor toolbar button', () => {
      // Monitor panel should be hidden initially
      cy.get('.panel-east').should('not.be.visible')

      // Click the monitor toggle button
      cy.get('#toggle-monitor').click()

      // Monitor content should be present and visible
      cy.get('.mon-title', { timeout: 5000 }).should('be.visible').and('contain', 'MONITOR')
      cy.get('.panel-east').invoke('outerWidth').should('be.gt', 50)

      // Click again to close
      cy.get('#toggle-monitor').click()
      cy.get('.panel-east').should('not.be.visible')
    })

    it('closes via the close button in the monitor bar', () => {
      cy.get('#toggle-monitor').click()
      cy.get('.mon-title', { timeout: 5000 }).should('be.visible')

      cy.get('#monitor-close').click()
      cy.get('.panel-east').should('not.be.visible')
    })
  })
})
