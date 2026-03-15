describe('Native autocomplete for non-XQuery modes', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.cm-editor', { timeout: 10000 }).should('exist')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  /**
   * Create a new document with the given file type and content.
   * Types are: html, css, javascript, json, xml, less, markdown
   */
  function newDocument(type, content) {
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      editor.newDocument(null, type)
    })
    cy.wait(300)
    if (content) {
      cy.window().then((win) => {
        var view = win.eXide.app.getEditor().editor
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          selection: { anchor: content.length }
        })
        view.focus()
      })
    }
  }

  function triggerCompletion() {
    cy.window().then((win) => {
      var view = win.eXide.app.getEditor().editor
      view.focus()
      win.CM6.startCompletion(view)
    })
  }

  function typeInEditor(text) {
    cy.get('.cm-content').type(text, { delay: 50 })
  }

  describe('HTML completions', () => {
    it('shows tag completions when typing <', () => {
      newDocument('html', '')
      typeInEditor('<d')
      triggerCompletion()

      cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('contain', 'div')
    })

    it('shows attribute completions inside a tag', () => {
      newDocument('html', '<div ')
      triggerCompletion()

      cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('contain', 'class')
    })
  })

  describe('CSS completions', () => {
    it('shows property completions inside a rule', () => {
      newDocument('css', 'body {\n  co')
      triggerCompletion()

      cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('contain', 'color')
    })

    it('shows multiple property suggestions', () => {
      newDocument('css', 'body {\n  b')
      triggerCompletion()

      cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('match', /background|border|bottom/)
    })
  })

  describe('JavaScript completions', () => {
    it('shows local variable completions', () => {
      newDocument('javascript', 'var myLongVariable = 42;\nmy')
      triggerCompletion()

      cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('contain', 'myLongVariable')
    })
  })

  describe('JSON linting', () => {
    it('shows parse error for invalid JSON', () => {
      newDocument('json', '{ foo: bar }')
      cy.wait(500)

      // Lint gutter should show an error marker
      cy.get('.cm-lint-marker-error', { timeout: 5000 })
        .should('have.length.at.least', 1)
    })

    it('no errors for valid JSON', () => {
      newDocument('json', '{\n  "name": "test",\n  "version": "1.0"\n}')
      cy.wait(500)

      cy.get('.cm-lint-marker-error').should('have.length', 0)
    })
  })

})
