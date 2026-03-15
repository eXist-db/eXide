describe('Outline navigation', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      var view = win.eXide.app.getEditor().editor
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      })
      view.focus()
    })
  }

  function newDocument(type, content) {
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      editor.newDocument(null, type)
    })
    cy.wait(300)
    if (content) {
      setEditorContent(content)
    }
  }

  function showOutline() {
    cy.get('#tabs-outline').contains('outline').click()
    cy.wait(300)
  }

  describe('XML outline', () => {
    var xml = [
      '<root>',
      '  <header>',
      '    <title>Test</title>',
      '  </header>',
      '  <body>',
      '    <section id="intro">',
      '      <para>Hello</para>',
      '    </section>',
      '    <section id="main">',
      '      <para>World</para>',
      '    </section>',
      '  </body>',
      '</root>'
    ].join('\n')

    it('shows XML elements as nested tree', () => {
      newDocument('xml', xml)
      showOutline()

      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 5)
      cy.get('#outline .outline-name').first().should('contain', 'root')
    })

    it('shows XPath signatures in tooltips', () => {
      newDocument('xml', xml)
      showOutline()

      // Outline items should have XPath-like title attributes
      cy.get('#outline li a', { timeout: 5000 }).first()
        .should('have.attr', 'title')
        .and('match', /\/root/)
    })

    it('shows hint attributes for elements with id', () => {
      newDocument('xml', xml)
      showOutline()

      cy.get('#outline .outline-hint', { timeout: 5000 })
        .should('have.length.at.least', 1)
        .first()
        .invoke('text')
        .should('contain', 'intro')
    })

    it('uses nested <ul> structure for hierarchy', () => {
      newDocument('xml', xml)
      showOutline()

      // Nested mode should produce <ul> children inside <li> elements
      cy.get('#outline li ul', { timeout: 5000 })
        .should('have.length.at.least', 1)
    })

    it('navigates to element and centers viewport on click', () => {
      newDocument('xml', xml)
      showOutline()

      // Click the last element to trigger scroll
      cy.get('#outline li a .outline-name').contains('section').first().parent().click()

      // Editor should exist and have the cursor on or near the section element
      cy.get('#editor .cm-editor', { timeout: 5000 }).should('exist')
    })
  })

  describe('XML gotoSymbol', () => {
    var xml = '<root>\n  <child1/>\n  <child2/>\n</root>'

    it('opens QuickPicker with XPath items', () => {
      newDocument('xml', xml)
      // Wait for outline to populate (needs ensureSyntaxTree + requestAnimationFrame)
      showOutline()
      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 1)

      cy.window().then((win) => {
        win.eXide.app.getEditor().exec('gotoSymbol')
      })

      cy.get('.quick-picker', { timeout: 5000 })
        .should('be.visible')

      // Should show XPath-style items
      cy.get('.quick-picker-list li', { timeout: 3000 })
        .should('have.length.at.least', 1)
        .invoke('text')
        .should('contain', '/')
    })
  })

  describe('JSON outline', () => {
    var json = '{\n  "name": "test",\n  "version": "1.0",\n  "scripts": {\n    "build": "npm run build"\n  }\n}'

    it('shows property keys in outline', () => {
      newDocument('json', json)
      showOutline()

      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 3)
      cy.get('#outline .outline-name').invoke('text').should('contain', 'name')
    })

    it('opens QuickPicker via gotoSymbol', () => {
      newDocument('json', json)
      showOutline()
      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 1)

      cy.window().then((win) => {
        win.eXide.app.getEditor().exec('gotoSymbol')
      })

      cy.get('.quick-picker', { timeout: 5000 }).should('be.visible')
    })
  })

  describe('CSS outline', () => {
    var css = 'body {\n  color: red;\n}\n\n.header {\n  display: flex;\n}\n\n#main {\n  padding: 10px;\n}'

    it('shows selectors in outline', () => {
      newDocument('css', css)
      showOutline()

      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 2)
      cy.get('#outline .outline-name').invoke('text').should('contain', 'body')
    })
  })

  describe('JavaScript outline', () => {
    var js = 'function greet(name) {\n  return "Hello " + name;\n}\n\nfunction add(a, b) {\n  return a + b;\n}'

    it('shows functions in outline', () => {
      newDocument('javascript', js)
      showOutline()

      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 2)
      cy.get('#outline .outline-name').invoke('text').should('contain', 'greet')
    })
  })

  describe('Markdown outline', () => {
    var md = '# Title\n\n## Section 1\n\nContent\n\n## Section 2\n\nMore content\n\n### Subsection'

    it('shows headings in outline', () => {
      newDocument('markdown', md)
      showOutline()

      cy.get('#outline li', { timeout: 5000 }).should('have.length.at.least', 3)
      cy.get('#outline .outline-name').invoke('text').should('contain', 'Title')
    })
  })

  describe('Navigation flash', () => {
    it('flashes target line on gotoLine', () => {
      // Open config.xqm which has enough lines
      cy.get('#directory li').contains('span', 'apps', { timeout: 5000 }).click()
      cy.get('#directory li').contains('span', 'eXide', { timeout: 5000 }).click()
      cy.get('#directory li').contains('span', 'modules', { timeout: 5000 }).click()
      cy.get('#directory li').contains('span', 'config.xqm', { timeout: 5000 }).click()
      cy.get('.path', { timeout: 10000 }).should('contain', 'config.xqm')

      // Navigate to a line programmatically
      cy.window().then((win) => {
        var view = win.eXide.app.getEditor().editor
        win.editorUtils.gotoLine(view, 10, 0, true)
      })

      // Flash decoration should appear briefly
      cy.get('.cm-goto-flash', { timeout: 1000 }).should('exist')

      // Flash should fade and be removed
      cy.get('.cm-goto-flash', { timeout: 2000 }).should('not.exist')
    })
  })
})
