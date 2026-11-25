/**
 * Saving must not destroy CDATA sections -- eXist-db/exist#2081.
 *
 * eXide PUTs the editor buffer to /api/storage/{path}. Labelling that body with the
 * document's own media type makes roaster parse it into a node before storing, and
 * request:get-data() historically discarded CDATA boundaries during that parse -- so
 * `<![CDATA[ ... ]]>` inside a <script> or <style> block came back escaped, turning `>`
 * into `&gt;` and corrupting embedded JavaScript. The buffer is already text; sending it
 * as opaque bytes skips a round trip that has nothing to gain.
 *
 * Each test seeds its own .xhtml document server-side and opens it, rather than typing
 * into the default untitled buffer: that buffer is in XQuery mode, and saving it under an
 * .xhtml name raises eXide's "non-XQuery file extension" warning instead of saving.
 */
describe('CDATA sections survive a save', () => {
  const testCollection = '/db'

  const SOURCE = [
    '<div xmlns="http://www.w3.org/1999/xhtml">',
    '<script type="text/javascript"><![CDATA[ if (a > b && c < d) { return 1; } ]]></script>',
    '</div>'
  ].join('\n')

  function newFileName() {
    return `cypress-test-${Date.now()}-${Cypress._.random(1000, 9999)}.xhtml`
  }

  /** Seeds an .xhtml resource so the editor opens in the right mode. */
  function seedXhtml(name) {
    cy.execXQuery(`xquery version "3.1";
      xmldb:store("${testCollection}", "${name}",
        <div xmlns="http://www.w3.org/1999/xhtml"><p>seed</p></div>, "application/xhtml+xml")`)
  }

  function openFileDirectly(path) {
    cy.window().then((win) => {
      win.eXide.app.$doOpenDocument({ path: path, name: path.split('/').pop() })
    })
  }

  function setEditorContent(text) {
    cy.window().then((win) => {
      win.eXide.app.getEditor().getActiveDocument().setText(text)
    })
  }

  beforeEach(() => {
    cy.cleanupTestFiles()
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  afterEach(() => {
    cy.cleanupTestFiles()
  })

  /** Seeds, opens, replaces the content and saves in place (no dialog for a known path). */
  function editAndSave(name, content) {
    seedXhtml(name)
    openFileDirectly(`${testCollection}/${name}`)
    cy.get('.path', { timeout: 10000 }).should('contain', name)
    setEditorContent(content)
    cy.get('#save').click()
  }

  it('sends the buffer as opaque bytes rather than as a parseable media type', () => {
    const testFile = newFileName()
    cy.intercept('PUT', '**/api/storage/**').as('put')

    editAndSave(testFile, SOURCE)

    cy.wait('@put').then(({ request }) => {
      // The point of the fix: nothing downstream should try to parse this body.
      expect(request.headers['content-type'], 'save must not label the buffer as XML')
        .to.match(/^application\/octet-stream/)
      expect(request.body, 'the section must leave the editor intact')
        .to.contain('<![CDATA[')
    })
  })

  // Round trip: the write path sends the buffer as bytes, and the read path asks the
  // serializer to keep stored CDATA sections (exist:preserve-cdata). Both halves are needed
  // -- without the read-path parameter fn:serialize escapes the section back into `&gt;`
  // even when the database holds it intact.
  it('round-trips a CDATA section through the database unescaped', () => {
    const testFile = newFileName()
    cy.intercept('PUT', '**/api/storage/**').as('put')

    editAndSave(testFile, SOURCE)
    cy.wait('@put')

    cy.request(`/eXide/api/storage${testCollection}/${testFile}`).then((response) => {
      expect(response.body.content, 'the CDATA section must survive the round trip')
        .to.contain('<![CDATA[')
      expect(response.body.content, 'brackets inside the section must not be escaped')
        .to.contain('a > b && c < d')
      expect(response.body.content).to.not.contain('&gt; b')
    })
  })

  it('does not mangle non-ASCII content on the same path', () => {
    const testFile = newFileName()
    const utf8 = '<div xmlns="http://www.w3.org/1999/xhtml"><p>café 文書 Привет</p></div>'
    cy.intercept('PUT', '**/api/storage/**').as('put')

    editAndSave(testFile, utf8)
    cy.wait('@put')

    cy.request(`/eXide/api/storage${testCollection}/${testFile}`).then((response) => {
      expect(response.body.content).to.contain('café')
      expect(response.body.content).to.contain('文書')
      expect(response.body.content).to.contain('Привет')
    })
  })
})
