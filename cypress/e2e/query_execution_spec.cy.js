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
      .should('contain', 'Items:')
      // Timing bar shows either detailed (Compile/Eval/Total) or simple (Elapsed)
      .and('match', /Compile:|Elapsed:/)
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

  it('paginates results with next/previous buttons', () => {
    // Query with 25 results, default page size 10
    setEditorContent('for $i in 1 to 25 return $i')
    cy.get('#run').click()

    // First page: 1 to 10
    cy.get('.panel-south .current', { timeout: 10000 })
      .invoke('text')
      .should('contain', '1 to 10 of 25')
    cy.get('.panel-south .results .content')
      .should('have.length', 10)

    // Click next page
    cy.get('.panel-south .next').click()
    cy.get('.panel-south .current')
      .invoke('text')
      .should('contain', '11 to 20 of 25')

    // Click next again — partial page
    cy.get('.panel-south .next').click()
    cy.get('.panel-south .current')
      .invoke('text')
      .should('contain', '21 to 25 of 25')

    // Click previous
    cy.get('.panel-south .previous').click()
    cy.get('.panel-south .current')
      .invoke('text')
      .should('contain', '11 to 20 of 25')

    // Click first
    cy.get('.panel-south .first-page').click()
    cy.get('.panel-south .current')
      .invoke('text')
      .should('contain', '1 to 10 of 25')

    // Click last
    cy.get('.panel-south .last-page').click()
    cy.get('.panel-south .current')
      .invoke('text')
      .should('contain', '21 to 25 of 25')
  })

  it('handles large result sets without browser memory issues', () => {
    // 10,000 items — should return quickly with cursor, only first page rendered
    setEditorContent('for $i in 1 to 10000 return $i')
    cy.get('#run').click()

    cy.get('.panel-south .current', { timeout: 30000 })
      .invoke('text')
      .should('contain', '10000')
    // Only 10 items rendered in DOM (not 10,000)
    cy.get('.panel-south .results .content')
      .should('have.length', 10)
  })

  it('re-fetches page when serialization mode changes without re-executing', () => {
    setEditorContent('<root><child/></root>')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)

    // Switch to XML mode — should re-fetch current page, not re-run query
    cy.intercept('GET', '**/api/query/*/results*').as('fetchPage')
    cy.intercept('POST', '**/api/query').as('execQuery')

    cy.get('.panel-south #serialization-mode').select('xml')

    // Should fetch results but NOT post a new query
    cy.wait('@fetchPage')
    cy.get('@execQuery.all').should('have.length', 0)
  })

  it('adaptive serialization quotes xs:string values', () => {
    // Run any query first so the results panel becomes visible
    setEditorContent('1')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 }).should('have.length.at.least', 1)

    cy.get('.panel-south #serialization-mode').select('adaptive')
    setEditorContent('"hello"')
    cy.get('#run').click()

    cy.get('.panel-south .results .content', { timeout: 10000 })
      .first()
      .invoke('text')
      .should('eq', '"hello"')
  })

  it('adaptive serialization does not quote xs:integer values', () => {
    setEditorContent('1')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 }).should('have.length.at.least', 1)

    cy.get('.panel-south #serialization-mode').select('adaptive')
    setEditorContent('42')
    cy.get('#run').click()

    cy.get('.panel-south .results .content', { timeout: 10000 })
      .first()
      .invoke('text')
      .should('eq', '42')
  })

  it('re-fetches page when indent toggle changes', () => {
    setEditorContent('<root><child/></root>')
    cy.get('#run').click()
    cy.get('.panel-south .results .content', { timeout: 10000 })
      .should('have.length.at.least', 1)

    // Toggle indent off
    cy.intercept('GET', '**/api/query/*/results*').as('fetchPage')
    cy.get('#indent-results-btn').click()

    cy.wait('@fetchPage')
  })
})
