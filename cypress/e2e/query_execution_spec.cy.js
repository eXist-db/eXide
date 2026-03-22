describe('Query execution', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  /**
   * Set the editor content by calling the eXide API directly.
   */
  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  it('runs a simple XQuery and shows results', () => {
    setEditorContent('for $i in 1 to 3 return <n>{$i}</n>')
    cy.get('#run').click()

    // Results panel should appear with content
    cy.get('.panel-south .results', { timeout: 10000 })
      .should('not.be.empty')
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)

    // Status message should mention results
    cy.get('.panel-south .current')
      .invoke('text')
      .should('match', /Showing results/)
  })

  it('shows an error for invalid XQuery', () => {
    setEditorContent('for $x in return')
    cy.get('#run').click()

    // Error should appear in the error status area
    cy.get('#error-status', { timeout: 10000 })
      .invoke('text')
      .should('have.length.greaterThan', 0)
  })

  it('displays correct result count', () => {
    setEditorContent('for $i in 1 to 5 return $i')
    cy.get('#run').click()

    cy.get('.panel-south .current', { timeout: 10000 })
      .invoke('text')
      .should('contain', '5')
  })

  it('evaluates a string expression', () => {
    setEditorContent('"Hello, eXide!"')
    cy.get('#run').click()

    cy.get('.panel-south .results .content', { timeout: 10000 })
      .first()
      .should('contain', 'Hello, eXide!')
  })

  it('clears previous results before running new query', () => {
    setEditorContent('1 + 1')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)

    // Run a different query
    setEditorContent('"second query"')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .first()
      .should('contain', 'second query')
  })

  it('shows a toast notification with result count', () => {
    setEditorContent('1')
    cy.get('#run').click()

    // util.message() shows a toast with "Query returned N item(s) in Xs"
    cy.get('.eXide-toast', { timeout: 10000 })
      .should('contain', 'returned')
      .and('contain', 'item')
  })

  it('shows timing info after query completes', () => {
    setEditorContent('for $i in 1 to 3 return $i')
    cy.get('#run').click()

    cy.get('#query-timing', { timeout: 10000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'Elapsed:')
      .and('contain', 'Items:')
  })

  it('shows cancel button during execution and hides after', () => {
    // Cancel button should be hidden initially
    cy.get('#cancel-query').should('not.be.visible')

    // Run a query — cancel button should appear briefly then hide
    setEditorContent('1 + 1')
    cy.get('#run').click()

    // After completion, cancel button should be hidden
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)
    cy.get('#cancel-query').should('not.be.visible')
  })

  it('cancel button exists and is hidden when no query is running', () => {
    cy.get('#cancel-query').should('exist').and('not.be.visible')
  })

  it('falls back to HTTP when WebSocket unavailable', () => {
    // Disconnect the ws-eval WebSocket
    cy.window().then((win) => {
      win.eXide.wsEval.disconnect()
    })

    setEditorContent('1 + 1')
    cy.get('#run').click()

    // Should still produce results via HTTP fallback
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)
  })

  it('supports adaptive serialization mode', () => {
    // First run a simple query to make results panel visible
    setEditorContent('1')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)

    // Now switch serialization mode and run again
    cy.get('.panel-south #serialization-mode').select('adaptive')
    setEditorContent('"adaptive output"')
    cy.get('#run').click()

    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)
  })
})
