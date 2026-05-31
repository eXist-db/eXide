describe('Semantic highlighting', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  function triggerParse() {
    // Force a parse by calling the helper's validate method
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var doc = editor.getActiveDocument()
      var helper = editor.getActiveDocument().helper
      if (helper && helper.parseXQuery) {
        helper.parseXQuery(doc)
      }
    })
  }

  function semSpans(cls) {
    return cy.get('.cm-editor .cm-content').find('.' + cls, { timeout: 5000 })
  }

  it('highlights function names in declarations and calls', () => {
    setEditorContent('declare function local:test() { local:test() };\nlocal:test()')
    triggerParse()
    semSpans('sem-function-name').should('have.length.at.least', 2)
  })

  it('highlights variables', () => {
    setEditorContent('let $x := 1 return $x')
    triggerParse()
    semSpans('sem-variable').should('have.length.at.least', 1)
  })

  it('highlights namespace prefixes in declarations', () => {
    setEditorContent('module namespace demo = "http://example.com/demo";\ndeclare function demo:f() { 1 };')
    triggerParse()
    semSpans('sem-namespace-prefix').should('have.length.at.least', 1)
  })

  it('highlights annotations', () => {
    setEditorContent('declare %rest:GET %rest:path("/api") function local:f() { 1 };')
    triggerParse()
    semSpans('sem-annotation').should('have.length.at.least', 2)
  })

  it('highlights type names', () => {
    setEditorContent('let $x as xs:string := "hello" return $x')
    triggerParse()
    semSpans('sem-type-name').should('have.length.at.least', 1)
  })

  it('updates highlights when content changes', () => {
    setEditorContent('let $x := 1 return $x')
    triggerParse()
    semSpans('sem-variable').should('have.length.at.least', 1)

    // Change content to have no variables
    setEditorContent('1 + 2')
    triggerParse()

    // Give a moment for decorations to clear
    cy.wait(200)
    cy.get('.cm-editor .cm-content').find('.sem-variable').should('not.exist')
  })
})
