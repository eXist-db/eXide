describe('Monitor panel', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  it('token endpoint returns a token for admin user', () => {
    cy.window().then((win) => {
      return win.fetch('api/admin/status')
        .then((r) => r.json())
    }).then((data) => {
      expect(data).to.have.property('jmxToken')
      expect(data.jmxToken).to.have.length.greaterThan(0)
    })
  })

  it('app.login.isAdmin is true after login', () => {
    cy.window().then((win) => {
      expect(win.eXide.app.login).to.not.be.null
      expect(win.eXide.app.login.isAdmin).to.be.true
    })
  })

  it('starts polling when toggled open by admin', () => {
    cy.intercept('GET', '**/api/admin/status').as('fetchToken')
    cy.intercept('GET', /\/status\?/).as('poll')

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')
    cy.get('.mon-title').should('contain', 'MONITOR')

    cy.wait('@fetchToken', { timeout: 5000 }).its('response.statusCode').should('eq', 200)
    cy.wait('@poll', { timeout: 10000 }).its('response.statusCode').should('eq', 200)

    cy.get('#mon-mem-nums', { timeout: 5000 }).invoke('text').should('match', /\d+ \/ \d+ MB/)
  })

  it('updates memory bar on poll', () => {
    cy.intercept('GET', /\/status\?/).as('poll')

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('be.visible')

    cy.wait('@poll', { timeout: 10000 })

    cy.get('#mon-mem-used').invoke('css', 'width').should('not.eq', '0px')
  })

  it('shows chip data after polling', () => {
    cy.intercept('GET', /\/status\?/).as('poll')

    cy.get('#toggle-monitor').click()
    cy.wait('@poll', { timeout: 10000 })

    cy.get('#mon-chip-db', { timeout: 5000 }).invoke('text').should('match', /DB \d+\/\d+/)
    cy.get('#mon-chip-uptime').invoke('text').should('match', /Up .+/)
  })

  it('stops polling when toggled closed', () => {
    cy.intercept('GET', /\/status\?/).as('poll')

    cy.get('#toggle-monitor').click()
    cy.wait('@poll', { timeout: 10000 })

    cy.get('#toggle-monitor').click()
    cy.get('.panel-east').should('not.be.visible')

    cy.get('@poll.all').then((interceptions) => {
      var count = interceptions.length
      cy.wait(3000)
      cy.get('@poll.all').should('have.length', count)
    })
  })

  it('restores monitor on reload if it was open', () => {
    cy.intercept('GET', /\/status\?/).as('poll')

    // Open the monitor
    cy.get('#toggle-monitor').click()
    cy.wait('@poll', { timeout: 10000 })

    // Set up intercept for after reload, then reload
    cy.intercept('GET', /\/status\?/).as('pollAfterReload')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')

    // Monitor panel should be visible again and polling
    cy.get('.panel-east', { timeout: 5000 }).should('be.visible')
    cy.wait('@pollAfterReload', { timeout: 10000 }).its('response.statusCode').should('eq', 200)
    cy.get('#mon-mem-nums', { timeout: 5000 }).invoke('text').should('match', /\d+ \/ \d+ MB/)
  })
})
