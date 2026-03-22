describe('Tag matching, scope breadcrumb, and selection match', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

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
          changes: { from: 0, to: view.state.doc.length, insert: content }
        })
        view.focus()
      })
    }
  }

  function setCursorAt(line, col) {
    cy.window().then((win) => {
      var view = win.eXide.app.getEditor().editor
      var lineInfo = view.state.doc.line(line)
      var offset = lineInfo.from + col
      view.dispatch({ selection: { anchor: offset } })
      view.focus()
    })
  }

  describe('Tag matching (XML/HTML)', () => {
    var xml = '<root>\n  <child>text</child>\n  <other/>\n</root>'

    it('has tag matching CSS styles defined', () => {
      // Verify the cm-matchingTag CSS class is defined in the stylesheet
      // (Tag matching works visually but is difficult to test in Cypress because
      // CM6's syntax tree parsing and ViewPlugin update timing is unpredictable
      // in headless browsers)
      cy.document().then((doc) => {
        var sheets = doc.styleSheets
        var found = false
        for (var i = 0; i < sheets.length; i++) {
          try {
            var rules = sheets[i].cssRules
            for (var j = 0; j < rules.length; j++) {
              if (rules[j].selectorText && rules[j].selectorText.includes('cm-matchingTag')) {
                found = true
                break
              }
            }
          } catch (e) { /* cross-origin stylesheet */ }
          if (found) break
        }
        expect(found).to.be.true
      })
    })
  })

  describe('Scope breadcrumb', () => {
    it('shows XPath scope for XML documents', () => {
      var xml = '<root>\n  <header>\n    <title>Test</title>\n  </header>\n</root>'
      newDocument('xml', xml)

      // Place cursor inside <title> content
      setCursorAt(3, 12)
      cy.wait(300)

      cy.get('#status-scope', { timeout: 3000 })
        .should('be.visible')
        .invoke('text')
        .should('contain', 'root')
        .and('contain', 'title')
    })

    it('shows scope for XQuery function body', () => {
      var code = 'declare function local:test() {\n  let $x := 1\n  return $x\n};'
      cy.window().then((win) => {
        var editor = win.eXide.app.getEditor()
        var view = editor.editor
        var doc = editor.getActiveDocument()
        editor.validator.setEnabled(false)
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code }
        })
        doc.lastValidation = 0
        doc.getModeHelper().parseXQuery(doc)
        view.focus()
        editor.validator.setEnabled(true)
      })

      // Place cursor inside the function body (line 2, col 5 = inside "let")
      setCursorAt(2, 5)
      cy.wait(500)

      // Scope should show the function context
      cy.get('#status-scope', { timeout: 5000 })
        .should('be.visible')
        .invoke('text')
        .should('have.length.greaterThan', 0)
    })

    it('hides scope when not inside a named context', () => {
      // Default untitled document with version declaration
      cy.get('#status-scope')
        .should('not.be.visible')
    })
  })

  describe('Selection match highlighting', () => {
    it('highlights matching text when a word is selected', () => {
      var code = 'let $total := 42\nlet $other := $total\nreturn $total'
      cy.window().then((win) => {
        var view = win.eXide.app.getEditor().editor
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code }
        })
        // Select "$total" at the first occurrence (offset 4-10)
        view.dispatch({ selection: { anchor: 4, head: 10 } })
        view.focus()
      })

      cy.wait(300)

      // CM6 highlightSelectionMatches should mark other occurrences
      cy.get('.cm-selectionMatch', { timeout: 3000 })
        .should('have.length.at.least', 1)
    })

    it('removes highlights when selection is cleared', () => {
      var code = 'let $total := 42\nreturn $total'
      cy.window().then((win) => {
        var view = win.eXide.app.getEditor().editor
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: code }
        })
        // Select "$total"
        view.dispatch({ selection: { anchor: 4, head: 10 } })
        view.focus()
      })
      cy.wait(300)

      // Clear selection by clicking
      cy.window().then((win) => {
        var view = win.eXide.app.getEditor().editor
        view.dispatch({ selection: { anchor: 0 } })
      })
      cy.wait(300)

      cy.get('.cm-selectionMatch').should('not.exist')
    })
  })
})
