describe('Find in Files (search API)', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
  })

  it('POST /api/search returns JSON results', () => {
    cy.request({
      method: 'POST',
      url: '/eXide/api/search',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'function',
        collection: '/db/apps/eXide/modules',
        type: 'xquery'
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.have.property('query', 'function')
      expect(response.body).to.have.property('collection', '/db/apps/eXide/modules')
      expect(response.body).to.have.property('hits')
      expect(response.body.hits).to.be.an('array')
      expect(response.body.hits.length).to.be.greaterThan(0)

      const hit = response.body.hits[0]
      expect(hit).to.have.property('resource')
      expect(hit).to.have.property('name')
      expect(hit).to.have.property('line')
      expect(hit).to.have.property('text')
    })
  })

  it('returns 400 for empty query', () => {
    cy.request({
      method: 'POST',
      url: '/eXide/api/search',
      headers: { 'Content-Type': 'application/json' },
      body: { query: '', collection: '/db' },
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status).to.eq(400)
      expect(response.body).to.have.property('error')
    })
  })

  it('filters by type', () => {
    cy.request({
      method: 'POST',
      url: '/eXide/api/search',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'import',
        collection: '/db/apps/eXide/modules',
        type: 'xquery'
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
      response.body.hits.forEach((hit) => {
        expect(hit.resource).to.match(/\.(xq|xqm|xql|xquery)$/)
      })
    })
  })

  it('supports case-sensitive search', () => {
    cy.request({
      method: 'POST',
      url: '/eXide/api/search',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'FUNCTION',
        collection: '/db/apps/eXide/modules',
        type: 'xquery',
        caseSensitive: true
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
      // XQuery uses lowercase 'function', so case-sensitive 'FUNCTION' should find fewer/no hits
      expect(response.body.hits.length).to.eq(0)
    })
  })

  it('supports regex search', () => {
    cy.request({
      method: 'POST',
      url: '/eXide/api/search',
      headers: { 'Content-Type': 'application/json' },
      body: {
        query: 'declare\\s+function',
        collection: '/db/apps/eXide/modules',
        type: 'xquery',
        regex: true
      }
    }).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.hits.length).to.be.greaterThan(0)
      response.body.hits.forEach((hit) => {
        expect(hit.text).to.match(/declare\s+function/)
      })
    })
  })

  it('opens Find in Files dialog and renders results in iframe', () => {
    // Intercept the API call before any UI interaction
    cy.intercept('POST', '**/api/search').as('searchApi')

    // Open the dialog via menu
    cy.get('#menu-edit-find-files').click({ force: true })
    cy.get('#find-dialog', { timeout: 5000 }).should('be.visible')

    // Fill in search form
    cy.get('#find-dialog input[name="search"]').clear().type('function')
    cy.get('#find-dialog select[name="type"]').select('xquery')
    cy.get('#find-dialog input[name="target"][value="all"]').check()

    // Click Search button (in the dialog's button bar, sibling of #find-dialog)
    cy.get('#find-dialog').closest('.eXide-dialog').find('.eXide-dialog-buttons button').contains('Search').click()

    // Verify API was called and results rendered
    cy.wait('@searchApi').then((interception) => {
      expect(interception.response.statusCode).to.eq(200)
      expect(interception.response.body.hits.length).to.be.greaterThan(0)
    })

    // Results should appear in the iframe (re-query body to avoid detached DOM)
    cy.get('#results-iframe', { timeout: 10000 }).should('be.visible')
    cy.get('#results-iframe').its('0.contentDocument.body', { timeout: 10000 })
      .should('not.be.empty')
    cy.get('#results-iframe').its('0.contentDocument.body')
      .find('.sourceinfo')
      .should('have.length.greaterThan', 0)
  })

  it('clicking a search result opens the document', () => {
    // Intercept before UI interaction
    cy.intercept('POST', '**/api/search').as('searchApi')

    // Open dialog and search
    cy.get('#menu-edit-find-files').click({ force: true })
    cy.get('#find-dialog', { timeout: 5000 }).should('be.visible')
    cy.get('#find-dialog input[name="search"]').clear().type('declare function')
    cy.get('#find-dialog select[name="type"]').select('xquery')
    cy.get('#find-dialog input[name="target"][value="all"]').check()

    cy.get('#find-dialog').closest('.eXide-dialog').find('.eXide-dialog-buttons button').contains('Search').click()
    cy.wait('@searchApi')

    // Click the first result link inside the iframe
    cy.get('#results-iframe', { timeout: 10000 })
      .its('0.contentDocument.body')
      .find('.resource')
      .first()
      .click()

    // A new tab should open with the file
    cy.get('.path', { timeout: 10000 })
      .invoke('text')
      .should('not.eq', 'untitled-1')
  })
})
