describe('Rename (multi-cursor)', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    // Dismiss any startup toasts
    cy.wait(500)
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  function placeCursorAndRename(line, col) {
    // Place cursor and trigger rename in a single window call
    // to avoid focus-change side effects between Cypress commands
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var view = editor.editor
      var editorUtils = win.editorUtils
      var offset = editorUtils.rowColToOffset(view.state, line, col)
      view.dispatch({ selection: { anchor: offset } })
      view.focus()
      var doc = editor.getActiveDocument()
      doc.helper.rename(doc)
    })
  }

  it('creates multi-cursor selection for variable rename', () => {
    setEditorContent('let $count := 1\nlet $other := $count + 1\nreturn $count')
    // Place cursor on 'count' (EQName inside VarName) — line 2, col 9
    placeCursorAndRename(2, 9)

    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'Editing 3 occurrence')
  })

  it('renames variable from $ sign position', () => {
    setEditorContent('let $x := 1 return $x')
    // Place cursor on $ of $x in 'return $x' — line 0, col 20
    placeCursorAndRename(0, 20)

    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'Editing 2 occurrence')
  })

  it('creates multi-cursor selection for function rename', () => {
    setEditorContent('declare function local:greet($name) { "Hello " || $name };\nlocal:greet("world")')
    // Place cursor on 'greet' in the function call — line 1, col 8
    placeCursorAndRename(1, 8)

    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'Editing 2 occurrence')
  })

  it('creates multi-cursor selection for XML element tag rename', () => {
    setEditorContent('<div>hello</div>')
    // Place cursor on 'div' in opening tag — line 0, col 2
    placeCursorAndRename(0, 2)

    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'Editing 2 occurrence')
  })

  it('shows message when cursor is not on a renameable symbol', () => {
    setEditorContent('1 + 2')
    placeCursorAndRename(0, 2)

    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'cursor')
  })
})
