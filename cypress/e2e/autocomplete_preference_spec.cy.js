/**
 * Tests for the "Autocomplete as you type" preference.
 *
 * Verifies that:
 *  - The preference defaults to off — typing characters does not trigger
 *    the completion popup (only explicit Ctrl-Space does).
 *  - Toggling the preference ON via Edit → Preferences makes typing
 *    trigger the popup.
 *  - Toggling it back OFF stops typing from triggering.
 *  - The setting is persisted across reload.
 *
 * CM6's autocompletion extension only fires its activateOnTyping logic
 * when the transaction's userEvent matches "input.type" or "delete.*".
 * Plain view.dispatch({ changes: ... }) without a userEvent doesn't
 * exercise that path. These tests dispatch with userEvent: "input.type"
 * to simulate user keystrokes through the same code path activateOnTyping
 * watches.
 */
describe('Autocomplete-on-type preference', () => {
  // The completion source talks to the existdb-openapi /api/query/completions
  // endpoint; skip these tests if the server doesn't have it (older eXist
  // images, no roaster, etc.).
  var lspAvailable = false

  before(() => {
    cy.loginXHR('admin', '')
    cy.request({
      method: 'POST',
      url: '/eXide/api/query/completions',
      body: { query: 'util:', prefix: 'util:', base: 'xmldb:exist:///db' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false
    }).then((resp) => {
      lspAvailable = resp.status === 200 && Array.isArray(resp.body) && resp.body.length > 0
    })
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
    // Wipe any persisted preference from prior runs so each test starts
    // from the application-default state.
    cy.clearLocalStorage()
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  afterEach(() => {
    // Reset the preference to the default-off state so the next test in
    // the file starts clean (covers tests that leave the toggle on).
    cy.window().then((win) => {
      try {
        var prefs = JSON.parse(win.localStorage.getItem('eXide.preferences') || '{}')
        prefs.autocompleteOnType = false
        win.localStorage.setItem('eXide.preferences', JSON.stringify(prefs))
      } catch (e) { /* ignore */ }
    })
  })

  /**
   * Simulate a user typing each character of `text` into the editor.
   * Uses cy.type on the .cm-content contenteditable so the browser
   * dispatches real keydown/beforeinput/input events; that's what
   * CM6's activate-on-typing logic watches for (synthetic
   * view.dispatch transactions don't reliably exercise the same path).
   */
  function typeIntoEditor(text) {
    // First clear any existing content via the view API
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      editor.validator.setEnabled(false)
      var view = editor.editor
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: '' }
      })
      view.focus()
    })
    // Then type via real keyboard events
    cy.get('.cm-content').type(text, { delay: 30 })
  }

  function openPreferences() {
    cy.get('#menu-edit-preferences').click({ force: true })
    cy.get('#preferences-dialog').should('be.visible')
  }

  function closePreferences() {
    // Matches the same selector path used in preferences_spec.cy.js
    cy.get('#preferences-dialog').closest('.eXide-dialog')
      .find('.eXide-dialog-buttons button').contains('Close').click()
  }

  // ── Default-off behavior ────────────────────────────────────────────────

  it('default — toggle is unchecked', () => {
    openPreferences()
    cy.get('#pref-autocomplete-on-type').should('not.be.checked')
  })

  it('default — typing characters does not trigger the popup', function () {
    if (!lspAvailable) this.skip()
    typeIntoEditor('util:wai')
    // Give the (potential) activate-on-typing debounce + network call
    // plenty of time to fire.
    cy.wait(1500)
    cy.get('.cm-tooltip-autocomplete').should('not.exist')
  })

  it('default — Ctrl-Space still triggers the popup', function () {
    if (!lspAvailable) this.skip()
    typeIntoEditor('util:wai')
    cy.window().then((win) => {
      win.CM6.startCompletion(win.eXide.app.getEditor().editor)
    })
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 }).should('be.visible')
  })

  // ── Toggling the preference ─────────────────────────────────────────────

  it('toggled ON — typing characters triggers the popup', function () {
    if (!lspAvailable) this.skip()
    openPreferences()
    cy.get('#pref-autocomplete-on-type').check()
    closePreferences()

    // Confirm the preference actually took effect in the running app
    cy.window().then((win) => {
      expect(win.eXide.app.getPreference('autocompleteOnType')).to.equal(true)
    })

    typeIntoEditor('util:wai')
    cy.get('.cm-tooltip-autocomplete', { timeout: 5000 }).should('be.visible')
  })

  it('toggled OFF after being ON — typing no longer triggers the popup', function () {
    if (!lspAvailable) this.skip()
    // Turn on
    openPreferences()
    cy.get('#pref-autocomplete-on-type').check()
    closePreferences()
    // Then turn off
    openPreferences()
    cy.get('#pref-autocomplete-on-type').uncheck()
    closePreferences()

    typeIntoEditor('util:wai')
    cy.wait(1500)
    cy.get('.cm-tooltip-autocomplete').should('not.exist')
  })

  // ── Persistence ─────────────────────────────────────────────────────────

  it('persists toggled-on state across reload', function () {
    openPreferences()
    cy.get('#pref-autocomplete-on-type').check()
    closePreferences()

    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')

    openPreferences()
    cy.get('#pref-autocomplete-on-type').should('be.checked')
  })
})
