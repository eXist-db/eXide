describe('Find and Replace', () => {
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

  function getEditorContent() {
    return cy.window().then((win) => {
      return win.eXide.app.getEditor().getActiveDocument().getText()
    })
  }

  it('opens find panel via menu', () => {
    cy.get('#menu-edit-find').click({ force: true })
    // CM6 search panel should appear
    cy.get('.cm-search').should('be.visible')
  })

  it('finds text in document', () => {
    setEditorContent('let $x := 1\nlet $y := 2\nreturn $x + $y')
    cy.get('#menu-edit-find').click({ force: true })
    cy.get('.cm-search').should('be.visible')

    // Type search query
    cy.get('.cm-search input[name="search"]').clear().type('$x')

    // Should show match count or highlight matches
    cy.get('.cm-editor .cm-searchMatch').should('have.length.at.least', 1)
  })

  it('navigates between matches', () => {
    setEditorContent('apple banana apple cherry apple')
    cy.get('#menu-edit-find').click({ force: true })
    cy.get('.cm-search input[name="search"]').clear().type('apple')

    // Multiple matches should be highlighted
    cy.get('.cm-editor .cm-searchMatch').should('have.length.at.least', 2)

    // Click next to navigate
    cy.get('.cm-search button[name="next"]').click()
  })

  it('opens find-replace panel via menu', () => {
    cy.get('#menu-edit-find-replace').click({ force: true })
    cy.get('.cm-search').should('be.visible')
    // Replace input should be visible
    cy.get('.cm-search input[name="replace"]').should('be.visible')
  })

  it('replaces text', () => {
    setEditorContent('hello world hello')
    cy.get('#menu-edit-find-replace').click({ force: true })

    cy.get('.cm-search input[name="search"]').clear().type('hello')
    cy.get('.cm-search input[name="replace"]').clear().type('goodbye')

    // Click replace all
    cy.get('.cm-search button[name="replaceAll"]').click()

    getEditorContent().should('contain', 'goodbye').and('not.contain', 'hello')
  })

  it('closes search panel with Escape', () => {
    cy.get('#menu-edit-find').click({ force: true })
    cy.get('.cm-search').should('be.visible')
    cy.get('.cm-search input[name="search"]').type('{esc}')
    cy.get('.cm-search').should('not.exist')
  })

  it('case-sensitive search', () => {
    setEditorContent('Hello hello HELLO')
    cy.get('#menu-edit-find').click({ force: true })
    cy.get('.cm-search input[name="search"]').clear().type('Hello')

    // Toggle case sensitivity (checkbox labeled "match case")
    cy.get('.cm-search input[name="case"]').check({ force: true })

    // Should match only exact case
    cy.get('.cm-editor .cm-searchMatch').should('have.length', 1)
  })
})
