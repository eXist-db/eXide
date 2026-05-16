describe('Autocomplete', () => {
  // TODO: remove this skip once lang/cursor modules are available on CI's eXist-db
  var lspAvailable = false

  before(() => {
    cy.loginXHR('admin', '')
    cy.request({
      method: 'POST',
      url: '/eXide/api/query/completions',
      body: { query: 'util:', prefix: 'util:', base: 'xmldb:exist:///db' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false
    }).then((resp) => {
      lspAvailable = resp.status === 200 && Array.isArray(resp.body) && resp.body.length > 0
    })
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    // Wait longer for login to propagate
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  /**
   * Set editor content, force AST parse, position cursor, trigger autocomplete.
   * Disables validator to prevent race conditions with async validation.
   */
  function setContentAndComplete(text, cursorPos) {
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var view = editor.editor
      var doc = editor.getActiveDocument()
      var anchor = cursorPos !== undefined ? cursorPos : text.length

      editor.validator.setEnabled(false)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: anchor }
      })
      doc.lastValidation = 0
      doc.getModeHelper().parseXQuery(doc)
      view.focus()
      win.CM6.startCompletion(view)
      editor.validator.setEnabled(true)
    })
  }

  function setEditorContent(text, cursorPos) {
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var view = editor.editor
      var doc = editor.getActiveDocument()
      var anchor = cursorPos !== undefined ? cursorPos : text.length
      editor.validator.setEnabled(false)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: anchor }
      })
      doc.lastValidation = 0
      doc.getModeHelper().parseXQuery(doc)
      view.focus()
      editor.validator.setEnabled(true)
    })
  }

  function getEditorContent() {
    return cy.window().then((win) => {
      return win.eXide.app.getEditor().editor.state.doc.toString()
    })
  }

  it('shows completion popup for function prefix', function () {
    if (!lspAvailable) this.skip()
    setContentAndComplete('util:wai')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:wait')
  })

  it('inserts snippet without backslash on selection', function () {
    if (!lspAvailable) this.skip()
    cy.intercept('POST', '**/api/query/completions').as('completions')
    setContentAndComplete('util:wai')

    cy.wait('@completions', { timeout: 10000 })
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:wait')
    cy.get('.cm-tooltip-autocomplete li[aria-selected="true"]', { timeout: 3000 }).click()

    getEditorContent().then((text) => {
      expect(text).to.contain('util:wait(')
      expect(text).to.not.contain('\\$')
    })
  })

  it('shows variable completions', () => {
    // Use valid XQuery with cursor mid-word so the parser produces a usable AST
    // "let $myVar := 42\nreturn $myVar" — cursor at pos 27 = after "$my"
    setContentAndComplete('let $myVar := 42\nreturn $myVar', 27)

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', '$myVar')
  })

  it('filters completions as user types', function () {
    if (!lspAvailable) this.skip()
    cy.intercept('POST', '**/api/query/completions').as('completions')
    setContentAndComplete('util:')

    cy.wait('@completions', { timeout: 10000 })
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:')

    cy.get('.cm-tooltip-autocomplete li[role="option"]')
      .should('have.length.greaterThan', 5)
      .then(($items) => {
        const initialCount = $items.length

        cy.intercept('POST', '**/api/query/completions').as('completions2')
        // Type via DOM to trigger CM6 input handling
        cy.get('.cm-content').type('w', { force: true, delay: 0 })

        cy.wait('@completions2', { timeout: 10000 })
        cy.get('.cm-tooltip-autocomplete li[role="option"]')
          .should('have.length.lessThan', initialCount)
      })
  })

  it('shows default namespace functions without prefix', function () {
    if (!lspAvailable) this.skip()
    // Typing "conc" without "fn:" should suggest fn:concat via default namespace lookup
    setContentAndComplete('conc')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'concat')
  })

  it('inserts unprefixed function without namespace prefix', function () {
    if (!lspAvailable) this.skip()
    cy.intercept('POST', '**/api/query/completions').as('completions')
    setContentAndComplete('conc')

    cy.wait('@completions', { timeout: 10000 })
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'concat')
    cy.get('.cm-tooltip-autocomplete li[aria-selected="true"]', { timeout: 3000 }).click()

    getEditorContent().then((text) => {
      expect(text).to.contain('concat(')
      // Should NOT have fn: prefix since user typed without prefix
      expect(text).to.not.match(/fn:concat/)
    })
  })

  it('shows completions for fn: prefixed input', function () {
    if (!lspAvailable) this.skip()
    setContentAndComplete('fn:conc')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'fn:concat')
  })

  it('preserves fn: prefix when accepting prefixed completion', function () {
    if (!lspAvailable) this.skip()
    cy.intercept('POST', '**/api/query/completions').as('completions')
    setContentAndComplete('fn:conc')

    cy.wait('@completions', { timeout: 10000 })
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'fn:concat')
    cy.get('.cm-tooltip-autocomplete li[aria-selected="true"]', { timeout: 3000 }).click()

    getEditorContent().then((text) => {
      expect(text).to.contain('fn:concat(')
    })
  })

  it('shows prefixed completions without duplicating namespace for repo:', function () {
    if (!lspAvailable) this.skip()
    setContentAndComplete('repo:')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'repo:deploy')
      .and('not.contain', 'repo:repo:')
  })

  it('shows repo: completions when typing repo without colon', function () {
    if (!lspAvailable) this.skip()
    setContentAndComplete('repo')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'repo:')
  })

  it('shows function documentation tooltip via Navigate menu', () => {
    setEditorContent('util:wait()', 7)

    cy.get('#menu-navigate-info').click({ force: true })

    cy.get('.cm-funcdoc-tooltip', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:wait')
  })
})
