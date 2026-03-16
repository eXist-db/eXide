// TODO: remove LSP skip once lsp:* module is available on CI's eXist-db
describe('Outline view', () => {
  var lspAvailable = false

  before(() => {
    cy.loginXHR('admin', '')
    cy.request({
      method: 'POST',
      url: '/eXide/api/query/symbols',
      body: { query: 'declare function local:test() { 1 };', base: 'xmldb:exist:///db' },
      headers: { 'Content-Type': 'application/json' },
      failOnStatusCode: false
    }).then((resp) => {
      try {
        var body = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body
        lspAvailable = resp.status === 200 && Array.isArray(body) && body.length > 0 && body[0].name !== undefined
      } catch (e) {
        lspAvailable = false
      }
    })
  })

  it('should show XQuery functions after opening a library module via collections pane', function () {
    if (!lspAvailable) this.skip()

    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')

    cy.get('#directory li').contains('span', 'apps', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'eXide', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'modules', { timeout: 5000 }).click()
    cy.get('#directory li').contains('span', 'config.xqm', { timeout: 5000 }).click()

    cy.get('.path', { timeout: 10000 }).should('contain', '/db/apps/eXide/modules/config.xqm')

    cy.get('#tabs-outline').contains('outline').click()

    cy.get('#outline li', { timeout: 10000 }).should('have.length.at.least', 1)

    cy.get('#outline li a .outline-name').contains('config:access-allowed').should('exist')
    cy.get('#outline li a .outline-name').contains('config:repo-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:expath-descriptor').should('exist')
    cy.get('#outline li a .outline-name').contains('config:app-info').should('exist')
  })
})
