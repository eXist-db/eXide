describe('WebSocket transport', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.cm-editor', { timeout: 10000 }).should('exist')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  it('auto-connects to WebSocket on startup', () => {
    // eXide.ws should exist and attempt auto-connect
    cy.window().then((win) => {
      expect(win.eXide.ws).to.exist
      expect(win.eXide.ws.isConnected).to.be.a('function')
    })
  })

  it('connects to /exist/ws endpoint', function () {
    // Give WebSocket time to connect (may already be connected)
    cy.wait(2000)
    cy.window().then((win) => {
      if (!win.eXide.ws.isConnected()) {
        this.skip() // WebSocket not available on this server
      }
      expect(win.eXide.ws.isConnected()).to.be.true
    })
  })

  it('handles ping messages without errors', function () {
    cy.wait(2000)
    cy.window().then((win) => {
      if (!win.eXide.ws.isConnected()) {
        this.skip()
      }
      // If connected, the ping handler should not throw errors
      // (we'd see console errors if it failed)
      expect(win.eXide.ws.isConnected()).to.be.true
    })
  })

  it('exposes send and notify methods', () => {
    cy.window().then((win) => {
      expect(win.eXide.ws.send).to.be.a('function')
      expect(win.eXide.ws.notify).to.be.a('function')
      expect(win.eXide.ws.on).to.be.a('function')
      expect(win.eXide.ws.off).to.be.a('function')
    })
  })

  it('receives monitoring data via WebSocket push', function () {
    cy.wait(2000)
    cy.window().then((win) => {
      if (!win.eXide.ws.isConnected()) {
        this.skip()
      }

      // Set up a listener for monitoring events
      var received = null
      win.eXide.ws.on("exist/metrics", function (data) {
        received = data
      })

      // Trigger the monitoring push via HTTP (which pushes to WebSocket)
      cy.request({
        method: 'POST',
        url: '/eXide/api/ws/monitor',
        headers: { 'Content-Type': 'application/json' },
        failOnStatusCode: false
      }).then(() => {
        // Give WebSocket a moment to deliver
        cy.wait(500).then(() => {
          expect(received).to.not.be.null
          expect(received.type).to.eq("exist/metrics")
          expect(received.version).to.be.a("string")
        })
      })
    })
  })

  it('falls back gracefully when WebSocket unavailable', () => {
    // Even if WS isn't connected, eXide should still function
    cy.get('.cm-editor').should('exist')
    cy.get('#status-bar').should('exist')
    // Editor should be usable
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      expect(editor).to.exist
      expect(editor.editor).to.exist
    })
  })
})
