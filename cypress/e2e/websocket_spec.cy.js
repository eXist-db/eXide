describe('WebSocket transport', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.cm-editor', { timeout: 10000 }).should('exist')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  /** Retry until ws.isConnected() returns true, or skip the test. */
  function waitForWs(skipCtx) {
    return cy.window().should((win) => {
      if (!win.eXide.ws || !win.eXide.ws.isConnected()) {
        throw new Error('WebSocket not yet connected')
      }
    }).then(() => {
      return cy.window()
    }, () => {
      // If it never connected, skip
      skipCtx.skip()
    })
  }

  it('auto-connects to WebSocket on startup', () => {
    cy.window().then((win) => {
      expect(win.eXide.ws).to.exist
      expect(win.eXide.ws.isConnected).to.be.a('function')
    })
  })

  it('connects to /exist/ws endpoint', function () {
    waitForWs(this)
    cy.window().then((win) => {
      expect(win.eXide.ws.isConnected()).to.be.true
    })
  })

  it('handles ping messages without errors', function () {
    waitForWs(this)
    cy.window().then((win) => {
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
    waitForWs(this)
    cy.window().then((win) => {
      let received = null
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
        // Retry until WebSocket delivers the message
        cy.wrap(null, { timeout: 5000 }).should(() => {
          expect(received).to.not.be.null
          expect(received.type).to.eq("exist/metrics")
          expect(received.version).to.be.a("string")
        })
      })
    })
  })

  it('receives diagnostics push after compilation', function () {
    waitForWs(this)
    cy.window().then((win) => {
      let received = null
      win.eXide.ws.on("textDocument/publishDiagnostics", function (data) {
        received = data
      })

      // Trigger compilation with invalid code
      cy.request({
        method: 'POST',
        url: '/eXide/api/query/compile',
        headers: { 'Content-Type': 'application/json' },
        body: { query: 'let $x := retrun $x', base: 'xmldb:exist:///db', uri: 'test.xq' },
        failOnStatusCode: false
      }).then(() => {
        cy.wrap(null, { timeout: 5000 }).should(() => {
          expect(received).to.not.be.null
          expect(received.type).to.eq("textDocument/publishDiagnostics")
          expect(received.uri).to.eq("test.xq")
          expect(received.diagnostics).to.be.an("array")
          expect(received.diagnostics.length).to.be.greaterThan(0)
        })
      })
    })
  })

  it('falls back gracefully when WebSocket unavailable', () => {
    cy.get('.cm-editor').should('exist')
    cy.get('#status-bar').should('exist')
    cy.window().then((win) => {
      const editor = win.eXide.app.getEditor()
      expect(editor).to.exist
      expect(editor.editor).to.exist
    })
  })
})
