describe('Prettier formatting', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
    cy.wait(2000)
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  function getEditorContent() {
    return cy.window().then((win) => {
      return win.eXide.app.getEditor().getActiveDocument().getText()
    })
  }

  it('formats XQuery code via menu', () => {
    // Badly formatted XQuery
    var ugly = 'for $x in (1,2,3) let $y:=$x*2 return <item>{$y}</item>'
    setEditorContent(ugly)

    // Trigger format via the Edit > Format Code menu item
    cy.get('#menu-edit-format').click({ force: true })

    // Content should change (Prettier reformats it)
    cy.wait(1000)
    getEditorContent().should('not.eq', ugly)
  })

  it('formats XML code', () => {
    // Create a new XML document
    cy.window().then((win) => {
      win.eXide.app.newDocument('<root><child attr="val"><nested>text</nested></child></root>', 'xml')
    })
    cy.get('.path', { timeout: 5000 }).should('contain', '__new__')
    cy.wait(500)

    var before
    getEditorContent().then((text) => {
      before = text
    })

    cy.get('#menu-edit-format').click({ force: true })
    cy.wait(1000)

    // XML should be indented/reformatted
    getEditorContent().then((text) => {
      expect(text).to.not.eq(before)
      // Formatted XML should have newlines (indentation)
      expect(text).to.contain('\n')
    })
  })

  it('formats CSS code', () => {
    cy.window().then((win) => {
      win.eXide.app.newDocument('body{color:red;margin:0;padding:0}h1{font-size:2em}', 'css')
    })
    cy.get('.path', { timeout: 5000 }).should('contain', '__new__')
    cy.wait(500)

    cy.get('#menu-edit-format').click({ force: true })
    cy.wait(1000)

    getEditorContent().then((text) => {
      // Formatted CSS should have newlines and proper structure
      expect(text).to.contain('\n')
      expect(text).to.match(/color:\s*red/)
    })
  })

  it('shows error toast for unparseable code', () => {
    // Completely broken XQuery that Prettier can't parse
    setEditorContent('{{{{{')

    cy.get('#menu-edit-format').click({ force: true })
    cy.wait(1000)

    // Error toast should appear
    cy.get('.eXide-toast', { timeout: 5000 })
      .should('contain', 'could not be formatted')
  })
})
