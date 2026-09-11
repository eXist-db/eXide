/**
 * Regression guard for eXide#820: a new leaf name containing a space must be
 * accepted by the create and rename actions of POST /api/storage/{path}.
 *
 * Before the fix, `db:post` passed `$body?name` / `$body?target` to
 * xmldb:create-collection / xmldb:rename un-encoded, while every *path* in the
 * module already went through db:encode-path. Those functions reject a raw
 * space, so the request came back as:
 *
 *   400  "failed to convert My Folder into an XmldbURI:
 *         Illegal character in path at index 2: My Folder"
 *
 * (Non-ASCII names such as AéB happened to work, because the xmldb:* functions
 * escape those internally — which is why dbmanager_spec never caught this.)
 *
 * The assertions below cover all three call sites the fix touches: create, the
 * collection branch of rename, and the resource branch of rename. Each one also
 * checks the round trip — the listing must show the *decoded* name, so a space
 * survives storage as %20 and comes back as a space.
 */
describe('Names containing spaces (eXide#820)', () => {
  const base = '/db/cypress-test-spaces'
  const collWithSpace = 'My Folder'
  const renamedColl = 'My Renamed Folder'
  const resource = 'plain.xml'
  const renamedResource = 'renamed file.xml'
  const uiColl = 'UI Made Folder'

  function removeTestCollections() {
    cy.execXQuery(
      'xquery version "3.1"; ' +
      'for $c in ("' + base + '", "/db/' + uiColl.replace(/ /g, '%20') + '") ' +
      'where xmldb:collection-available($c) return xmldb:remove($c)'
    )
  }

  function storagePost(path, body) {
    return cy.request({
      method: 'POST',
      url: '/eXide' + '/api/storage' + path,
      headers: { 'Content-Type': 'application/json' },
      body: body,
      failOnStatusCode: false
    })
  }

  function listing(path) {
    return cy.request({
      method: 'GET',
      url: '/eXide/api/storage' + path,
      failOnStatusCode: false
    })
  }

  function names(response) {
    return (response.body.items || []).map((item) => item.name)
  }

  before(() => {
    cy.loginXHR('admin', '')
    removeTestCollections()
    cy.execXQuery('xquery version "3.1"; xmldb:create-collection("/db", "cypress-test-spaces")')
  })

  beforeEach(() => {
    cy.loginXHR('admin', '')
  })

  after(() => {
    cy.loginXHR('admin', '')
    removeTestCollections()
  })

  it('creates a collection whose name contains a space', () => {
    storagePost(base, { action: 'create', name: collWithSpace }).then((response) => {
      // The pre-fix failure mode was a 400 carrying "Illegal character in path".
      expect(JSON.stringify(response.body)).to.not.contain('Illegal character in path')
      expect(response.status).to.eq(200)
      expect(response.body).to.have.property('status', 'ok')
      // Stored encoded — the leaf is escaped, not rejected.
      expect(response.body.path).to.contain('My%20Folder')
    })

    // …and the listing shows it decoded, so the user sees the name they typed.
    listing(base).then((response) => {
      expect(response.status).to.eq(200)
      expect(names(response)).to.include(collWithSpace)
    })
  })

  it('renames a collection to a name containing a space', () => {
    storagePost(base + '/My%20Folder', { action: 'rename', target: renamedColl })
      .then((response) => {
        expect(JSON.stringify(response.body)).to.not.contain('Illegal character in path')
        expect(response.status).to.eq(200)
        expect(response.body).to.have.property('status', 'ok')
      })

    listing(base).then((response) => {
      expect(names(response)).to.include(renamedColl)
      expect(names(response)).to.not.include(collWithSpace)
    })
  })

  it('renames a resource to a name containing a space', () => {
    // Store a resource with a space-free name first, so the rename is the only
    // thing under test.
    cy.request({
      method: 'PUT',
      url: '/eXide/api/storage' + base + '/' + resource,
      headers: { 'Content-Type': 'application/xml' },
      body: '<test/>'
    }).its('status').should('eq', 200)

    storagePost(base + '/' + resource, { action: 'rename', target: renamedResource })
      .then((response) => {
        expect(JSON.stringify(response.body)).to.not.contain('Illegal character in path')
        expect(response.status).to.eq(200)
        expect(response.body).to.have.property('status', 'ok')
      })

    listing(base).then((response) => {
      expect(names(response)).to.include(renamedResource)
      expect(names(response)).to.not.include(resource)
    })
  })

  it('creates and deletes a collection with a space through the DB manager UI', () => {
    cy.visit('/eXide/index.html', {
      onBeforeLoad(win) {
        win.localStorage.setItem('eXide.firstTime', '0')
      }
    })
    cy.dismissDialog()
    // Open the DB manager from the File menu, the way dbmanager_spec does.
    cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
    cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul')
      .find('#menu-file-manager').click()
    cy.get('div.eXide-browse-main', { timeout: 10000 }).should('be.visible')

    // Create in the default collection (/db), as the manager opens there.
    cy.get('#eXide-browse-toolbar-create').click()
    cy.get('#eXide-browse-collection-name').type(uiColl)
    cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

    cy.get('div.eXide-browse-main').within(() => {
      cy.contains('.browse-table tbody td.col-name', uiColl, { timeout: 10000 })
        .should('exist')
    })

    // Delete it again through the UI, so the round trip covers a path whose
    // encoded and displayed forms differ.
    cy.get('div.eXide-browse-main').within(() => {
      cy.contains('.browse-table tbody td.col-name', uiColl).click()
    })
    cy.get('#eXide-browse-toolbar-delete-resource').click()
    cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
    cy.get('div.eXide-browse-main').within(() => {
      cy.contains('.browse-table tbody td.col-name', uiColl).should('not.exist')
    })
  })
})
