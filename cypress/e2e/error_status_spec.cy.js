describe('Error status UI', () => {
  /**
   * Simulate eXide's editor.updateStatus() by writing to #error-status.
   * Uses the same textContent approach the real code uses, then waits
   * a tick for the MutationObserver callback to fire.
   */
  function setError(msg) {
    cy.window().then((win) => {
      const el = win.document.getElementById('error-status')
      el.textContent = msg
    })
    // Give the MutationObserver microtask a chance to run
    cy.wait(50)
  }

  /**
   * Wait for eXide to finish its initial compilation cycle.
   * The editor compiles the default document on load, which writes to
   * #error-status. We need to wait for that to settle before testing.
   */
  function waitForInitialLoad() {
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
    // Wait for any initial compilation to finish
    cy.wait(2000)
    // Clear any existing error state before each test
    cy.window().then((win) => {
      const el = win.document.getElementById('error-status')
      el.textContent = ''
    })
    cy.wait(100)
  }

  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    waitForInitialLoad()
  })

  it('pill and panel are hidden when there is no error', () => {
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')
  })

  it('shows pill and panel when an error is written to #error-status', () => {
    setError('err:XPST0017 Call to undeclared function [at line 5, column 12]')

    cy.get('#exide-err-pill')
      .should('have.class', 'has-error')
      .and('be.visible')

    cy.get('#exide-err-pill-label')
      .invoke('text')
      .should('have.length.greaterThan', 0)

    cy.get('#exide-err-panel')
      .should('have.class', 'ep-open')
      .and('be.visible')

    cy.get('#exide-err-panel-body')
      .should('contain', 'XPST0017')
  })

  it('toggles panel closed and open when clicking the pill', () => {
    setError('err:XPST0003 Unexpected token [at line 1, column 1]')

    cy.get('#exide-err-panel').should('have.class', 'ep-open')

    cy.get('#exide-err-pill').click()
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')

    cy.get('#exide-err-pill').click()
    cy.get('#exide-err-panel').should('have.class', 'ep-open')
  })

  it('closes panel when clicking the close button', () => {
    setError('Cannot compile xquery: syntax error')

    cy.get('#exide-err-panel').should('have.class', 'ep-open')
    cy.get('#exide-err-panel-close').click()
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')
  })

  it('closes panel on Escape key', () => {
    setError('err:XPST0003 Unexpected end of input')

    cy.get('#exide-err-panel').should('have.class', 'ep-open')
    cy.get('body').type('{esc}')
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')
  })

  it('hides pill and panel when error is cleared', () => {
    setError('err:XPST0003 Some error')

    cy.get('#exide-err-pill').should('have.class', 'has-error')
    cy.get('#exide-err-panel').should('have.class', 'ep-open')

    setError('')

    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')
  })

  it('clears error when switching to a different tab', () => {
    setError('err:XPST0003 Some error in first tab')

    cy.get('#exide-err-pill').should('have.class', 'has-error')
    cy.get('#exide-err-panel').should('have.class', 'ep-open')

    // Create a new tab via the New XQuery button
    cy.get('#new-xquery').click()
    // Confirm we switched to a new tab
    cy.get('.path').should('contain', '__new__2')

    // Error should be cleared
    cy.get('#exide-err-pill').should('not.have.class', 'has-error')
    cy.get('#exide-err-panel').should('not.have.class', 'ep-open')
  })

  it('copy button copies error text to clipboard', () => {
    const errorMsg = 'err:XPST0017 Call to undeclared function: local:foo'

    // Stub clipboard before triggering the error
    cy.window().then((win) => {
      cy.stub(win.navigator.clipboard, 'writeText').as('clipWrite').resolves()
    })

    setError(errorMsg)
    cy.get('#exide-err-panel').should('have.class', 'ep-open')

    cy.get('#exide-err-panel-copy').click()
    cy.get('@clipWrite').should('have.been.calledWith', errorMsg)
  })
})
