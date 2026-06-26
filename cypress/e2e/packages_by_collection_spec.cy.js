// Guards the by-collection package lookup: GET /api/packages?collection=<path>.
//
// Discovered while investigating eXist-db/eXide#835: the editor's
// `api/packages/?collection=` request (used to discover which app an open
// document belongs to) was routing to the bare /api/packages list handler,
// which ignored ?collection= and returned the full {packages:[...]} list.
// That abbrev-less list was then mis-stored, which is what poisoned
// localStorage in #835. These tests pin that ?collection= now resolves the
// single owning package (or 404), and that the no-arg call still lists.

context('GET /api/packages?collection=', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
  })

  it('resolves the single package that owns a collection', () => {
    cy.request('/eXide/api/packages?collection=/db/apps/eXide').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body).to.have.property('abbrev', 'eXide')
      // a single descriptor, NOT the full list shape
      expect(r.body).to.not.have.property('packages')
    })
  })

  it('resolves the owning package from a sub-collection path', () => {
    cy.request('/eXide/api/packages?collection=/db/apps/eXide/modules').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body).to.have.property('abbrev', 'eXide')
    })
  })

  it('still returns the full list when no collection is given', () => {
    cy.request('/eXide/api/packages').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body).to.have.property('packages')
      expect(r.body.packages).to.be.an('array')
      expect(r.body.packages.length).to.be.greaterThan(0)
    })
  })

  it('returns 404 for a collection not inside any app (no abbrev-less list to poison localStorage)', () => {
    cy.request({
      url: '/eXide/api/packages?collection=/db/not-an-app-' + Date.now(),
      failOnStatusCode: false
    }).then((r) => {
      expect(r.status).to.eq(404)
      expect(r.body).to.not.have.property('abbrev')
      expect(r.body).to.not.have.property('packages')
    })
  })
})
