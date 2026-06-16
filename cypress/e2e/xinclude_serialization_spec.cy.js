// Guards db:load-document's expand-xincludes handling.

const COLLECTION = '/db/cypress-xinclude'
const MAIN = COLLECTION + '/main.xml'

function storageUrl(dbPath) {
  return '/eXide/api/storage/' + dbPath.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')
}

function cleanup() {
  cy.loginXHR('admin', '')
  cy.execXQuery(`xquery version "3.1";
    if (xmldb:collection-available("${COLLECTION}"))
    then xmldb:remove("${COLLECTION}") else ()`)
}

context('XInclude serialization on open', () => {
  before(() => {
    cleanup()
    cy.loginXHR('admin', '')
    // A target doc and a main doc that pulls it in via xi:include. xmldb:store keeps
    // the literal xi:include element; expansion happens only at serialization time.
    cy.execXQuery(`xquery version "3.1";
      xmldb:create-collection("/db", "cypress-xinclude"),
      xmldb:store("${COLLECTION}", "target.xml", <para>INCLUDED-CONTENT</para>),
      xmldb:store("${COLLECTION}", "main.xml",
        <doc xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="target.xml"/></doc>)`)
  })

  after(() => { cleanup() })

  beforeEach(() => { cy.loginXHR('admin', '') })

  it('open (default) preserves xi:include -- no expand, no open->save data loss', () => {
    cy.request(storageUrl(MAIN)).then((r) => {
      expect(r.body.content).to.contain('<xi:include')
      expect(r.body.content).to.not.contain('INCLUDED-CONTENT')
    })
  })

  it('?expand-xincludes=true expands the include', () => {
    cy.request(storageUrl(MAIN) + '?expand-xincludes=true').then((r) => {
      expect(r.body.content).to.contain('INCLUDED-CONTENT')
      expect(r.body.content).to.not.contain('<xi:include')
    })
  })

  // Anticipates the cutover described in the PR's Scope/notes: once the open path moves
  // to existdb-openapi's /api/db/resource, db-core honors expand-xincludes server-side
  // and db:load-document's own serialization handling goes away. This asserts that
  // endpoint's contract directly. Skipped until the cutover lands -- it needs the
  // consolidated db-core (existdb-openapi #55/#59), which is not in eXide's current
  // test environment.
  it.skip('future: existdb-openapi /api/db/resource honors expand-xincludes server-side', () => {
    const path = encodeURIComponent('/db/cypress-xinclude/main.xml')
    cy.request('/existdb-openapi/api/db/resource?path=' + path + '&expand-xincludes=false').then((r) => {
      expect(r.body).to.contain('<xi:include')
    })
    cy.request('/existdb-openapi/api/db/resource?path=' + path + '&expand-xincludes=true').then((r) => {
      expect(r.body).to.contain('INCLUDED-CONTENT')
    })
  })
})
