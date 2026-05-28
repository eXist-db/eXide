describe('Go-to-definition and Find References', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  function setEditorContent(text, cursorPos) {
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var view = editor.editor
      var doc = editor.getActiveDocument()
      var anchor = cursorPos !== undefined ? cursorPos : 0
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

  describe('Go-to-definition', () => {
    it('jumps to function declaration via F3', () => {
      var code = 'declare function local:greet($name) {\n  "Hello " || $name\n};\n\nlocal:greet("world")'
      // Place cursor on "local:greet" call at line 5 (offset ~62)
      setEditorContent(code, 62)

      cy.window().then((win) => {
        win.eXide.app.getEditor().exec('gotoDefinition')
      })

      // Cursor should move to the function declaration (line 1)
      cy.get('#status-cursor', { timeout: 5000 })
        .invoke('text')
        .should('contain', 'Ln 1')
    })

    it('adds cm-goto-clickable class when Cmd/Ctrl is held', () => {
      setEditorContent('let $x := 1 return $x')

      // The editor's keydown handler in editor.js branches on
      // navigator.platform: 'Meta' key on Mac, 'Control' key elsewhere.
      // Cypress on Linux CI ≠ macOS local, so dispatch the key that
      // matches the runner's platform — otherwise the class is never
      // added and the assertion times out.
      cy.window().then((win) => {
        var isMac = /Mac|iPhone|iPod|iPad/.test(win.navigator.platform)
        var modKey = isMac ? 'Meta' : 'Control'
        var keydownProps = isMac
          ? { metaKey: true, key: modKey }
          : { ctrlKey: true, key: modKey }
        cy.get('.cm-content').trigger('keydown', keydownProps)
        cy.get('.cm-content.cm-goto-clickable, .cm-editor .cm-goto-clickable')
          .should('exist')
        cy.get('.cm-content').trigger('keyup', { key: modKey })
      })
    })
  })

  describe('Find All References', () => {
    it('opens QuickPicker with references via findReferences command', () => {
      // Use a function call — references work best on function names
      var code = 'declare function local:greet($name) {\n  "Hello " || $name\n};\n\nlocal:greet("a"),\nlocal:greet("b")'
      // Place cursor on "local:greet" in the call at line 5 (after the newlines)
      setEditorContent(code, 56)

      cy.window().then((win) => {
        win.eXide.app.getEditor().exec('findReferences')
      })

      cy.get('.quick-picker', { timeout: 10000 })
        .should('be.visible')

      // Should show at least one reference
      cy.get('.quick-picker-list li')
        .should('have.length.at.least', 1)
    })

    it('closes QuickPicker on Escape', () => {
      var code = 'declare function local:greet($name) {\n  "Hello " || $name\n};\n\nlocal:greet("a"),\nlocal:greet("b")'
      setEditorContent(code, 56)

      cy.window().then((win) => {
        win.eXide.app.getEditor().exec('findReferences')
      })

      cy.get('.quick-picker', { timeout: 10000 }).should('be.visible')
      cy.get('.quick-picker-filter').type('{esc}')
      cy.get('.quick-picker').should('not.be.visible')
    })
  })
})
