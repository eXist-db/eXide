describe('Diagnostics panel', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/api/query/compile').as('compile')
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
    // Wait for initial compile to settle
    cy.wait('@compile', { timeout: 10000 })
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      const view = win.eXide.app.getEditor().editor
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      })
      view.focus()
    })
  }

  it('opens lint panel via Navigate menu', () => {
    cy.get('.cm-panel-lint').should('not.exist')

    cy.get('#menu-navigate-diagnostics').click({ force: true })

    cy.get('.cm-panel-lint', { timeout: 3000 }).should('be.visible')
  })

  it('toggles panel closed on second click', () => {
    cy.get('#menu-navigate-diagnostics').click({ force: true })
    cy.get('.cm-panel-lint', { timeout: 3000 }).should('be.visible')

    cy.get('#menu-navigate-diagnostics').click({ force: true })
    cy.get('.cm-panel-lint').should('not.exist')
  })

  it('shows diagnostics for invalid XQuery', () => {
    setEditorContent('declare function local:test() {\n  $undefined\n};')
    // Wait for validation
    cy.wait('@compile', { timeout: 10000 })
    cy.wait(500)

    cy.get('#menu-navigate-diagnostics').click({ force: true })
    cy.get('.cm-panel-lint', { timeout: 3000 }).should('be.visible')

    // Lint panel should list at least one diagnostic
    cy.get('.cm-panel-lint li').should('have.length.at.least', 1)
  })

  it('clears diagnostics when code is fixed', () => {
    // First introduce an error
    setEditorContent('declare function local:test() {\n  $undefined\n};')
    cy.wait('@compile', { timeout: 10000 })
    cy.wait(500)

    // Open panel and verify error exists
    cy.get('#menu-navigate-diagnostics').click({ force: true })
    cy.get('.cm-panel-lint', { timeout: 3000 }).should('be.visible')
    cy.get('.cm-panel-lint li').should('have.length.at.least', 1)

    // Fix the code
    setEditorContent('1 + 1')
    cy.wait('@compile', { timeout: 10000 })
    cy.wait(500)

    // Diagnostics should be cleared — panel shows "No diagnostics" text
    cy.get('.cm-panel-lint').invoke('text').should('contain', 'No diagnostics')
  })

  it('error clearing: error pill disappears when code is fixed', () => {
    // Trigger an error by setting invalid content
    setEditorContent('declare function local:broken() { $x };\nlocal:broken()')
    // Wait for compile to return the error
    cy.wait('@compile', { timeout: 10000 })
    cy.wait(500)

    // Verify error appears
    cy.get('#exide-err-pill', { timeout: 5000 }).should('have.class', 'has-error')

    // Fix the error with valid code
    setEditorContent('1 + 1')

    // The error pill should eventually clear after re-validation
    cy.get('#exide-err-pill', { timeout: 15000 }).should('not.have.class', 'has-error')
  })
})
