describe('File save', () => {
  // Use /db which always exists; clean up test files after
  var testCollection = '/db'
  var testFile = 'cypress-test-' + Date.now() + '.xq'

  before(() => {
    // Clean up stale test files from previous interrupted runs
    cy.loginXHR('admin', '')
    cy.request({
      method: 'POST',
      url: '/exist/rest/db',
      headers: { 'Content-Type': 'application/xquery' },
      body: 'for $r in xmldb:get-child-resources("/db") where starts-with($r, "cypress-test-") return xmldb:remove("/db", $r)',
      failOnStatusCode: false
    })
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  function setEditorContent(text) {
    cy.window().then((win) => {
      var doc = win.eXide.app.getEditor().getActiveDocument()
      doc.setText(text)
    })
  }

  /**
   * Wait for the save/open dialog to appear.
   * The open-dialog is non-modal (wrapped in a <div class="eXide-dialog">).
   */
  function waitForSaveDialog() {
    cy.get('#open-dialog').closest('.eXide-dialog', { timeout: 5000 })
      .should('have.attr', 'open')
  }

  function saveDialogShouldBeClosed() {
    cy.get('#open-dialog').closest('.eXide-dialog')
      .should('not.have.attr', 'open')
  }

  function clickDialogButton(label) {
    cy.get('#open-dialog').closest('.eXide-dialog')
      .find('.eXide-dialog-buttons button').contains(label).click()
  }

  function openFileDirectly(path) {
    var name = path.split('/').pop()
    cy.window().then((win) => {
      win.eXide.app.$doOpenDocument({ path: path, name: name })
    })
  }

  after(() => {
    // Clean up test file
    cy.loginXHR('admin', '')
    cy.request({
      method: 'DELETE',
      url: '/exist/rest/db/' + testFile,
      failOnStatusCode: false
    })
  })

  it('opens the save dialog for a new document', () => {
    setEditorContent('1 + 1')
    cy.get('#save').click()

    waitForSaveDialog()
    cy.get('#open-dialog input[name="resource"]').should('exist')

    // Close without saving
    clickDialogButton('Cancel')
    saveDialogShouldBeClosed()
  })

  it('saves a new XQuery file to the database', () => {
    setEditorContent('(: test file :)\n1 + 1')
    cy.get('#save').click()

    waitForSaveDialog()

    // The dialog starts in /db, type filename and save
    cy.get('#open-dialog input[name="resource"]').clear().type(testFile)
    clickDialogButton('Save')

    // Dialog should close and path should update
    saveDialogShouldBeClosed()
    cy.get('.path', { timeout: 5000 }).should('contain', testFile)
  })

  it('saves an existing document without opening dialog', () => {
    // Open the file we saved in the previous test directly
    openFileDirectly(testCollection + '/' + testFile)
    cy.get('.path', { timeout: 10000 }).should('contain', testFile)

    // Modify the content
    setEditorContent('(: modified :)\n2 + 2')

    // Save — should NOT open dialog since file already exists
    cy.get('#save').click()

    // Toast should confirm save
    cy.get('.eXide-toast', { timeout: 5000 }).should('contain', 'stored')

    // Dialog should not have opened
    saveDialogShouldBeClosed()
  })

  it('warns when saving XQuery with non-XQuery extension', () => {
    setEditorContent('1 + 1')
    cy.get('#save').click()

    waitForSaveDialog()

    // Try to save with .txt extension
    cy.get('#open-dialog input[name="resource"]').clear().type('bad-name.txt')
    clickDialogButton('Save')

    // Warning dialog should appear about wrong extension
    cy.get('.eXide-dialog[open]', { timeout: 5000 })
      .should('contain', 'non-XQuery file extension')
  })

  it('can open a saved file and verify content', () => {
    // Open the file we saved and modified earlier
    openFileDirectly(testCollection + '/' + testFile)
    cy.get('.path', { timeout: 10000 }).should('contain', testFile)

    // Verify the document was loaded with the modified content
    cy.window().then((win) => {
      var text = win.eXide.app.getEditor().getActiveDocument().getText()
      expect(text).to.contain('modified')
    })
  })
})
