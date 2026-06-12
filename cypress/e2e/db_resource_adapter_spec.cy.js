// Coverage for the db-core adapter (modules/api/db.xqm) — the paths the broader
// suite leaves unguarded. The adapter delegates /api/storage to existdb-openapi's
// db-core in-process; db-core's get-resource no longer bundles metadata (meta=full
// is gone) so db:load re-sources owner/group/mode/last-modified from dbc:properties.
// These tests assert that re-sourced metadata reaches the real consumers, plus the
// serialization, ?download, db:patch, and resource-delete branches.

const COLLECTION = '/db/cypress-dbcore'
const XML_DOC = COLLECTION + '/meta.xml'
const BLOB_DOC = COLLECTION + '/blob.bin'
const PATCH_DOC = COLLECTION + '/patch.xml'
const DEL_DOC = COLLECTION + '/del.xml'
const XML_BODY = '<a><b>x</b><c>y</c></a>'
const BLOB_BODY = 'BINARYBLOB1234'

// /eXide/api/storage URL with each path segment encoded (mirrors the frontend).
function storageUrl(dbPath) {
  return '/eXide/api/storage/' + dbPath.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')
}

function putResource(dbPath, body, contentType) {
  return cy.request({
    method: 'PUT',
    url: storageUrl(dbPath),
    headers: { 'Content-Type': contentType },
    body
  })
}

function cleanup() {
  cy.loginXHR('admin', '')
  // Adapter DELETE -> db:delete -> dbc:remove-collection (tolerate a missing collection)
  cy.request({ method: 'DELETE', url: storageUrl(COLLECTION), failOnStatusCode: false })
}

context('DB resource adapter (db-core)', () => {
  before(() => {
    cleanup()
    cy.loginXHR('admin', '')
    // Seed via the adapter's own PUT (db:put -> dbc:store) so store coverage is real.
    cy.request({
      method: 'POST',
      url: storageUrl('/db'),
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'create', name: 'cypress-dbcore' }
    })
    putResource(XML_DOC, XML_BODY, 'application/xml')
    putResource(PATCH_DOC, XML_BODY, 'application/xml')
    putResource(DEL_DOC, XML_BODY, 'application/xml')
    // octet-stream content lands as a true binary doc, so the binary download
    // branch (util:binary-doc -> stream-binary) is exercised.
    putResource(BLOB_DOC, BLOB_BODY, 'application/octet-stream')
  })

  after(() => { cleanup() })

  beforeEach(() => { cy.loginXHR('admin', '') })

  describe('db:load envelope (dbc:get-resource + dbc:properties)', () => {
    it('store (dbc:store) reports the stored path', () => {
      putResource(XML_DOC, XML_BODY, 'application/xml').then((r) => {
        expect(r.body).to.have.property('status', 'ok')
        expect(r.body).to.have.property('path', XML_DOC)
      })
    })

    it('GET an XML resource carries metadata re-sourced from dbc:properties', () => {
      cy.request(storageUrl(XML_DOC)).then((r) => {
        // get-resource shape { path, binary, content, mime-type }
        expect(r.body).to.have.property('path', XML_DOC)
        expect(r.body).to.have.property('binary', false)
        expect(r.body).to.have.property('mime', 'application/xml')
        expect(r.body.content).to.contain('<a>')
        // owner/group/mode/last-modified now come from dbc:properties, not meta=full
        expect(r.body).to.have.property('owner', 'admin')
        expect(r.body).to.have.property('group', 'dba')
        expect(r.body.permissions).to.match(/^rw.r..r../)
        expect(r.body.lastModified).to.match(/^\d{4}-\d\d-\d\dT/)
        // externalPath is eXide-derived (context-path aware), not db-core's dropped runPath
        expect(r.body).to.have.property('externalPath', '/exist/rest/db/cypress-dbcore/meta.xml')
      })
    })
  })

  describe('serialization params driven through db:load', () => {
    it('indent=false flattens, indent=true pretty-prints, and they differ', () => {
      cy.request(storageUrl(XML_DOC) + '?indent=false').then((flat) => {
        expect(flat.body.content).to.eq(XML_BODY)
        cy.request(storageUrl(XML_DOC) + '?indent=true').then((pretty) => {
          expect(pretty.body.content).to.contain('\n')
          expect(pretty.body.content).to.not.eq(flat.body.content)
        })
      })
    })

    it('omit-xml-decl=false includes the XML declaration', () => {
      cy.request(storageUrl(XML_DOC) + '?omit-xml-decl=false').then((r) => {
        expect(r.body.content).to.match(/^<\?xml/)
      })
      cy.request(storageUrl(XML_DOC) + '?omit-xml-decl=true').then((r) => {
        expect(r.body.content).to.not.contain('<?xml')
      })
    })
  })

  describe('?download raw streaming', () => {
    it('downloads an XML doc as application/xml bytes', () => {
      cy.request(storageUrl(XML_DOC) + '?download=true').then((r) => {
        expect(r.status).to.eq(200)
        expect(r.headers['content-type']).to.contain('application/xml')
        expect(r.body).to.contain('<b>x</b>')
      })
    })

    it('downloads a binary doc as raw octet-stream bytes', () => {
      cy.request({ url: storageUrl(BLOB_DOC) + '?download=true', encoding: 'binary' }).then((r) => {
        expect(r.status).to.eq(200)
        expect(r.headers['content-type']).to.contain('application/octet-stream')
        expect(r.body).to.eq(BLOB_BODY)
      })
    })
  })

  describe('properties dialog reflects dbc:properties metadata', () => {
    it('shows owner/group/mode for a true XML resource', () => {
      cy.visit('/eXide/index.html', {
        onBeforeLoad(win) { win.localStorage.setItem('eXide.firstTime', '0') }
      })
      cy.dismissDialog()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
      cy.get('div.eXide-browse-main').within(() => {
        cy.contains('.browse-table tbody td.col-name', 'cypress-dbcore').dblclick()
        cy.contains('.browse-table tbody td.col-name', 'meta.xml').click()
      })
      cy.get('#eXide-browse-toolbar-properties').click()

      cy.get('#resource-properties-content').within(() => {
        // owner/group selects carry the values db:load sourced from dbc:properties
        cy.get('select[name="owner"]').should('have.value', 'admin')
        cy.get('select[name="group"]').should('have.value', 'dba')
        // permission checkboxes reflect mode rw-r--r--
        cy.get('#ur').should('be.checked')
        cy.get('#uw').should('be.checked')
        cy.get('#ux').should('not.be.checked')
        cy.get('#gr').should('be.checked')
        cy.get('#gw').should('not.be.checked')
        cy.get('#or').should('be.checked')
        cy.get('#ow').should('not.be.checked')
      })
    })
  })

  describe('db:patch (dbc:set-permissions) via the properties dialog', () => {
    it('Apply changes the mode, confirmed by a re-read', () => {
      cy.visit('/eXide/index.html', {
        onBeforeLoad(win) { win.localStorage.setItem('eXide.firstTime', '0') }
      })
      cy.dismissDialog()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
      // Navigate into the test collection and open properties for patch.xml
      cy.get('div.eXide-browse-main').within(() => {
        cy.contains('.browse-table tbody td.col-name', 'cypress-dbcore').dblclick()
        cy.contains('.browse-table tbody td.col-name', 'patch.xml').click()
      })
      cy.get('#eXide-browse-toolbar-properties').click()

      const dialog = () => cy.get('#resource-properties-dialog').closest('dialog.eXide-dialog[open]')
      // Default mode is rw-r--r-- : group-write starts unchecked
      dialog().find('#gw').should('not.be.checked').check()
      dialog().contains('.eXide-dialog-buttons button', 'Apply').click()

      // db:patch -> dbc:set-permissions; verify the new mode through db:load
      cy.request(storageUrl(PATCH_DOC)).then((r) => {
        expect(r.body.permissions).to.eq('rw-rw-r--')
      })
    })
  })

  describe('resource-level delete (dbc:remove-resource)', () => {
    it('deletes a single resource via the db manager', () => {
      cy.visit('/eXide/index.html', {
        onBeforeLoad(win) { win.localStorage.setItem('eXide.firstTime', '0') }
      })
      cy.dismissDialog()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
      cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
      cy.get('div.eXide-browse-main').within(() => {
        cy.contains('.browse-table tbody td.col-name', 'cypress-dbcore').dblclick()
        cy.contains('.browse-table tbody td.col-name', 'del.xml').click()
      })
      cy.get('#eXide-browse-toolbar-delete-resource').click()
      cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
      cy.get('div.eXide-browse-main').within(() => {
        cy.contains('.browse-table tbody td.col-name', 'del.xml').should('not.exist')
      })
      // Confirmed gone at the adapter level too
      cy.request({ url: storageUrl(DEL_DOC), failOnStatusCode: false }).then((r) => {
        expect(r.status).to.eq(404)
      })
    })
  })
})
