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

  it('reports a matching root so getProjectFor can match an open document', () => {
    // root must be a prefix of where the app's documents live; getProjectFor
    // matches doc.getBasePath().startsWith(project.root). It was "/db/<target>"
    // (e.g. "/db/eXide"), which is not where files are, so nothing matched.
    cy.request('/eXide/api/packages?collection=/db/apps/eXide/modules').then((r) => {
      expect(r.body.root).to.eq('/db/apps/eXide')
      expect('/db/apps/eXide/modules'.startsWith(r.body.root)).to.be.true
    })
  })
})

// End-to-end: opening a document inside an app lights up the toolbar's
// current-app indicator. This exercises the whole chain — the by-collection
// route, the corrected `root`, and getProjectFor — through the real UI.
describe('Current-app detection in the toolbar', () => {
  it('shows the owning app when a document inside an app is opened', () => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html?open=/db/apps/eXide/expath-pkg.xml')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
    cy.get('#toolbar-current-app', { timeout: 15000 }).should('have.text', 'eXide')
  })
})

// Optional package descriptors: a collection under /db/apps without an
// expath-pkg.xml, or an app without a git.xml, is a normal state. Since
// eXist-db 7 (eXist-db/exist#6812) fn:doc raises err:FODC0002 for a missing
// document, so every read of an optional descriptor has to be guarded by
// doc-available(). Without the guard these requests answer 500.
context('GET /api/packages with missing optional descriptors', () => {
  let nonPackage

  beforeEach(() => {
    cy.loginXHR('admin', '')
    nonPackage = `cypress-not-a-package-${Date.now()}-${Cypress._.random(1000, 9999)}`
    cy.execXQuery(`xmldb:create-collection("/db/apps", "${nonPackage}")`)
  })

  afterEach(() => {
    cy.execXQuery(`xmldb:remove("/db/apps/${nonPackage}")`)
  })

  it('lists packages and skips a collection without expath-pkg.xml', () => {
    cy.request('/eXide/api/packages').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body.packages).to.be.an('array').that.is.not.empty
      const paths = r.body.packages.map((p) => p.path)
      expect(paths).to.not.include(`/db/apps/${nonPackage}`)
    })
  })

  it('returns info for an app without git.xml', () => {
    cy.request('/eXide/api/packages/eXide').then((r) => {
      expect(r.status).to.eq(200)
      expect(r.body).to.have.property('abbrev', 'eXide')
    })
  })

  it('returns 404 for an unknown abbrev', () => {
    cy.request({
      url: '/eXide/api/packages/zz-nope-' + Date.now(),
      failOnStatusCode: false
    }).then((r) => {
      expect(r.status).to.eq(404)
    })
  })
})
