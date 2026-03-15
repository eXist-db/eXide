describe('Autocomplete', () => {
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

  it('shows completion popup for function prefix', () => {
    setContentAndComplete('util:wai')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:wait')
  })

  it('inserts snippet without backslash on selection', () => {
    setContentAndComplete('util:wai')

    // Wait for async function completions to load
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:wait')

    cy.wait(300)
    cy.window().then((win) => {
      win.CM6.acceptCompletion(win.eXide.app.getEditor().editor)
    })

    cy.wait(200)
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

  it('filters completions as user types', () => {
    setContentAndComplete('util:')

    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'util:')

    cy.get('.cm-tooltip-autocomplete li[role="option"]')
      .should('have.length.greaterThan', 5)
      .then(($items) => {
        var initialCount = $items.length

        // Type via DOM to trigger CM6 input handling
        cy.get('.cm-content').type('w', { force: true, delay: 0 })

        cy.wait(500)
        cy.get('.cm-tooltip-autocomplete', { timeout: 3000 })
          .should('be.visible')
        cy.get('.cm-tooltip-autocomplete li[role="option"]')
          .should('have.length.lessThan', initialCount)
      })
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
