/**
 * Each test here owns its state: it seeds whatever file it needs and cleans up
 * after itself, so no test depends on one that ran before it. That matters now
 * that the suite runs with retries (#866) — Cypress retries only the failing
 * test, not the ones that set up its state, so a chained spec retried against
 * a half-built fixture can pass or fail for reasons unrelated to the failure.
 */
describe('File save', () => {
  const testCollection = '/db'

  // Unique per test, so a leftover from an earlier run can never satisfy an
  // assertion here. The `cypress-test-` prefix is what cleanupTestFiles sweeps.
  function newFileName() {
    return `cypress-test-${Date.now()}-${Cypress._.random(1000, 9999)}.xq`
  }

  // Seed a file server-side rather than by driving the UI, so tests that are
  // about *opening* or *re-saving* a file do not silently depend on the test
  // that is about saving one.
  function seedFile(name, content) {
    cy.execXQuery(`xquery version "3.1";
      xmldb:store("${testCollection}", "${name}", "${content}", "application/xquery")`)
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

  function setEditorContent(text) {
    cy.window().then((win) => {
      const doc = win.eXide.app.getEditor().getActiveDocument()
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
    const name = path.split('/').pop()
    cy.window().then((win) => {
      win.eXide.app.$doOpenDocument({ path: path, name: name })
    })
  }

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
    const testFile = newFileName()
    setEditorContent('(: test file :)\n1 + 1')
    cy.get('#save').click()

    waitForSaveDialog()

    // The dialog starts in /db, type filename and save
    cy.get('#open-dialog input[name="resource"]').clear().type(testFile)
    clickDialogButton('Save')

    // Dialog should close and path should update
    saveDialogShouldBeClosed()
    cy.get('.path', { timeout: 5000 }).should('contain', testFile)

    // …and the resource is really in the database, not just in the tab label.
    cy.request(`/eXide/api/storage${testCollection}`).then((response) => {
      expect(response.body.items.map((item) => item.name)).to.include(testFile)
    })
  })

  it('saves an existing document without opening dialog', () => {
    const testFile = newFileName()
    seedFile(testFile, '(: seeded :)&#10;1 + 1')

    openFileDirectly(`${testCollection}/${testFile}`)
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
    const testFile = newFileName()
    seedFile(testFile, '(: modified :)&#10;2 + 2')

    openFileDirectly(`${testCollection}/${testFile}`)
    cy.get('.path', { timeout: 10000 }).should('contain', testFile)

    // The editor holds what the database holds.
    cy.window().then((win) => {
      const text = win.eXide.app.getEditor().getActiveDocument().getText()
      expect(text).to.contain('modified')
    })
  })
})
