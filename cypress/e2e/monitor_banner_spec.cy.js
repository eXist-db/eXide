describe('Monitor error banner', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html', {
      onBeforeLoad (win) {
        win.localStorage.setItem('eXide.firstTime', '0')
      }
    })
    cy.dismissDialog()
  })

  it('keeps panel markup after showError and recovers on the next update', () => {
    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')
    cy.get('#mon-mem-nums', { timeout: 15000 }).should('exist')

    cy.window().then((win) => {
      // Exercise the API on a fresh instance bound to the same DOM.
      const m = new win.eXide.app.Monitor()
      m.init()
      m.showError('boom')
      expect(win.document.getElementById('mon-banner').hidden).to.eq(false)
      expect(win.document.getElementById('mon-mem-nums')).to.not.eq(null)
      m.clearBanner()
      expect(win.document.getElementById('mon-banner').hidden).to.eq(true)
      expect(win.document.getElementById('mon-mem-nums')).to.not.eq(null)
      // update() must also clear the banner and leave metrics nodes intact
      m.showError('boom again')
      m.update({
        MemoryImpl: {
          HeapMemoryUsage: { used: 1048576, committed: 2097152, max: 4194304 }
        }
      })
      expect(win.document.getElementById('mon-banner').hidden).to.eq(true)
      expect(win.document.getElementById('mon-mem-nums').textContent).to.match(/MB/)
    })
  })
})
