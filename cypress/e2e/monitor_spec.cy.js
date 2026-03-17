describe('Monitor panel', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  it('token endpoint returns server status for admin user', () => {
    cy.window().then((win) => {
      return win.fetch('api/admin/status')
        .then((r) => r.json())
    }).then((data) => {
      expect(data).to.have.property('version')
    })
  })

  it('app.login.isAdmin is true after login', () => {
    cy.window().then((win) => {
      expect(win.eXide.app.login).to.not.be.null
      expect(win.eXide.app.login.isAdmin).to.be.true
    })
  })

  it('starts polling when toggled open by admin', () => {
    // Intercept both WebSocket and HTTP polling paths
    cy.intercept('POST', '**/api/ws/monitor').as('wsPoll')
    cy.intercept('GET', '**/api/admin/status').as('fetchToken')
    cy.intercept('GET', /\/status\?/).as('jmxPoll')

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')
    cy.get('.mon-title').should('contain', 'MONITOR')

    // Wait for either WebSocket or JMX polling to fire
    cy.wait(5000)
    cy.get('#mon-mem-nums', { timeout: 10000 }).invoke('text').should('match', /\d+ \/ \d+ MB/)
  })

  it('updates memory bar on poll', () => {
    cy.intercept('POST', '**/api/ws/monitor').as('wsPoll')
    cy.intercept('GET', /\/status\?/).as('jmxPoll')

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')

    cy.wait(5000)
    cy.get('#mon-mem-used').invoke('css', 'width').should('not.eq', '0px')
  })

  it('shows uptime after polling', () => {
    cy.get('#toggle-monitor').click()
    cy.wait(5000)

    cy.get('#mon-chip-uptime', { timeout: 5000 }).invoke('text').should('match', /Up .+/)
  })

  it('stops polling when toggled closed', () => {
    cy.intercept('POST', '**/api/ws/monitor').as('wsPoll')

    cy.get('#toggle-monitor').click()
    cy.wait(3000)

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('not.be.visible')

    cy.get('@wsPoll.all').then((interceptions) => {
      var count = interceptions.length
      cy.wait(3000)
      cy.get('@wsPoll.all').should('have.length', count)
    })
  })

  it('shows running query and allows killing it', () => {
    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')
    cy.wait(3000)

    // Run a slow query in the background via the editor
    cy.window().then((win) => {
      var editor = win.eXide.app.getEditor()
      var view = editor.editor
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'util:wait(10000)' }
      })
    })

    // Click Run to start the query
    cy.get('#run').click()

    // Wait for the running query to appear in the monitor
    cy.get('#mon-running-body .mon-running', { timeout: 5000 })
      .should('have.length.at.least', 1)

    // Click the kill button
    cy.get('#mon-running-body .mon-kill').first().click()

    // Wait for the query to disappear after the next poll cycle
    cy.get('#mon-running-body .mon-empty', { timeout: 15000 })
      .should('exist')
  })

  it('restores monitor on reload if it was open', () => {
    cy.get('#toggle-monitor').click()
    cy.wait(3000)

    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')

    // Monitor panel should be visible again
    cy.get('.panel-east', { timeout: 5000 }).should('be.visible')
    cy.wait(5000)
    cy.get('#mon-mem-nums', { timeout: 10000 }).invoke('text').should('match', /\d+ \/ \d+ MB/)
  })
})
