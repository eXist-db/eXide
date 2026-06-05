describe('Apply configuration', () => {
  // Use /db which always exists; clean up test files after
  const testCollection = '/db/test-collection-' + Date.now()
  const testFile = 'testcontent.xml'
  const testConfigFile = 'collection.xconf'
  const testConfig = `<collection xmlns="http://exist-db.org/collection-config/1.0">
    <index xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <range>
            <create qname="p"/>
        </range>
    </index>
</collection>`

  before(() => {
    cy.loginXHR('admin', '')
    createTestCollection(testCollection)
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  function createTestCollection(path) {
    cy.request({
      method: 'POST',
      url: '/existdb-openapi/api/db/collection',
      body: {path}
    })
  }

  function cleanTestCollection(path) {
    cy.request({
      method: 'DELETE',
      url: '/existdb-openapi/api/db/collection?path=' + path + '&force=true'
    })
  }

  function setEditorContent(text) {
    cy.window().then((win) => {
      let doc = win.eXide.app.getEditor().getActiveDocument()
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

  function waitForApplyConfigDialog() {
    cy.get('.eXide-dialog[open]', { timeout: 5000 })
      .get('.eXide-dialog-title').should('contain', 'Apply Configuration?')

    cy.get('.eXide-dialog[open]')
      .closest('.eXide-dialog').find('.eXide-dialog-buttons button').contains("OK").click()

    // cy.get('[open=""] > .eXide-dialog-buttons > :nth-child(2)').click()
  }
  function applyConfigDialogShouldBeClosed() {
    // all dialogs have the same class, so just check that no dialog is open
    cy.get('.eXide-dialog[open]').should('not.exist')
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

  function openNewXMLFile() {
    cy.get('#new').click()
    cy.get('#dialog-templates').closest('.eXide-dialog', { timeout: 5000 }).should('have.attr', 'open')
    // Select XML template
    cy.get('select.type-select').select('XML')
    cy.get('#dialog-templates').closest('.eXide-dialog')
      .find('.eXide-dialog-buttons button').contains("Create").click()
  }

  after(() => {
    cy.loginXHR('admin', '')
    cleanTestCollection(testCollection)
  })

  it('saves a new test file to the database', () => {
    openNewXMLFile()
    cy.wait(500) // wait for editor to initialize
    setEditorContent('<p>Test</p>')
    cy.get('#save').click()

    waitForSaveDialog()

    // select the test collection
    cy.get('tr[data-key="' + testCollection + '"]',{ timeout: 5000 }).dblclick()

    // The dialog starts in /db, type filename and save
    cy.get('#open-dialog input[name="resource"]').clear().type(testFile)
    clickDialogButton('Save')

    // Dialog should close and path should update
    saveDialogShouldBeClosed()
    cy.get('.path', { timeout: 5000 }).should('contain', testFile)
  })

  it('saves a new collection configuration for the test collection', () => {
    openNewXMLFile()
    setEditorContent(testConfig)

    cy.get('#save').click()

    waitForSaveDialog()

    // select the test collection
    cy.get('tr[data-key="' + testCollection + '"]',{ timeout: 5000 }).dblclick()

    // The dialog starts in /db, type filename and save
    cy.get('#open-dialog input[name="resource"]').clear().type(testConfigFile)
    clickDialogButton('Save')

    // Dialog should close and path should update
    saveDialogShouldBeClosed()
    cy.get('.path', { timeout: 5000 }).should('contain', testConfigFile)
  })

  it('saves the configuration and shows the apply configuration dialog', () => {
    // Open the file we saved in the previous test directly
    openFileDirectly(testCollection + '/' + testConfigFile)
    cy.get('.path', { timeout: 10000 }).should('contain', testConfigFile)

    // Save unedited
    cy.get('#save').click()
    // waitForSaveDialog()

    // Toast should confirm save
    cy.get('.eXide-toast', { timeout: 5000 }).should('contain', 'stored')


    // Dialog should have opened
    waitForApplyConfigDialog()

    // Toast should confirm application of configuration
    cy.get('.eXide-toast', { timeout: 5000 }).should('contain', 'Configuration applied.')

    // Dialog should not have opened
    saveDialogShouldBeClosed()
  })

  // it('can query the database and confirms the configuration is applied', () => {
  //   // Open the file we saved and modified earlier
  //   openFileDirectly(testCollection + '/' + testFile)
  //   cy.get('.path', { timeout: 10000 }).should('contain', testFile)

  //   // Verify the document was loaded with the modified content
  //   cy.window().then((win) => {
  //     let text = win.eXide.app.getEditor().getActiveDocument().getText()
  //     expect(text).to.contain('modified')
  //   })
  // })
})
