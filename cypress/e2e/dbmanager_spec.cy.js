/**
 * Each test drives one DB Manager workflow end to end and owns the collections
 * it touches: unique names per test, and an afterEach sweep so a failure cannot
 * leave residue for the next test to trip over.
 *
 * Previously each workflow was split across several `it`s — "create", then
 * "rename", then "delete" — so the later ones depended on the earlier ones
 * having run, and the copy and cut blocks even shared two collection names, so
 * a failure in copy's cleanup broke cut. With retries enabled (#866) Cypress
 * re-runs only the failing test and not the ones that built its state, which
 * makes that shape actively misleading.
 */
const PREFIX = 'cypress-dbmgr-'

function uniqueName(label) {
  return `${PREFIX}${label}-${Cypress._.random(1000, 9999)}`
}

function openDbManager() {
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
}

function removeTestCollections() {
  cy.loginXHR('admin', '')
  cy.execXQuery(`xquery version "3.1";
    for $col in xmldb:get-child-collections("/db")
    where starts-with($col, "${PREFIX}")
    return xmldb:remove("/db/" || $col)`)
}

// ── DB Manager UI helpers ──────────────────────────────────────────────────
function createCollection(name) {
  cy.get('#eXide-browse-toolbar-create').click()
  cy.get('#eXide-browse-collection-name').type(name)
  cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
  shouldList(name)
}

function shouldList(name) {
  cy.get('div.eXide-browse-main').within(() => {
    cy.contains('.browse-table tbody td.col-name', name, { timeout: 5000 }).should('exist')
  })
}

function shouldNotList(name) {
  cy.get('div.eXide-browse-main').within(() => {
    cy.contains('.browse-table tbody td.col-name', name, { timeout: 5000 }).should('not.exist')
  })
}

function select(name) {
  cy.get('div.eXide-browse-main').within(() => {
    cy.contains('.browse-table tbody td.col-name', name).click()
  })
}

function openCollection(name) {
  cy.get('div.eXide-browse-main').within(() => {
    cy.contains('.browse-table tbody td.col-name', name).dblclick()
  })
}

function deleteSelected() {
  cy.get('#eXide-browse-toolbar-delete-resource').click()
  cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
}

context('DB Manager', () => {
  describe('DB Manager operations', () => {
    beforeEach(() => {
      cy.loginXHR('admin', '')
      cy.visit('/eXide/index.html', {
        onBeforeLoad(win) {
          win.localStorage.setItem('eXide.firstTime', '0')
        }
      })
      cy.dismissDialog()
      openDbManager()
    })

    afterEach(() => {
      removeTestCollections()
    })

    it('should open the db manager', () => {
      cy.get('#open-dialog').closest('.eXide-dialog').should('be.visible')
      cy.get('#open-dialog').closest('.eXide-dialog').find('.eXide-dialog-title').invoke('text').should('eq', 'DB Manager')
    })

    it('should select the clicked document', () => {
      cy.get('div.eXide-browse-main').within(() => {
        cy.get('.browse-table tbody tr').first().click()
        cy.get('.browse-table tbody tr').first().should('have.attr', 'aria-selected', 'true')
      })
    })

    it('creates a collection and deletes it again', () => {
      const name = uniqueName('abc')

      createCollection(name)

      select(name)
      deleteSelected()
      shouldNotList(name)
    })

    it('renames a collection', () => {
      // The new name carries non-ASCII deliberately: the xmldb:* functions
      // escape those internally, so a rename exercises the encoding round trip.
      const name = uniqueName('toBeRenamed')
      const renamed = uniqueName('AéB')

      createCollection(name)

      select(name)
      cy.get('#eXide-browse-toolbar-rename').click()
      cy.focused().clear().type(`${renamed}{enter}`)

      shouldList(renamed)
      shouldNotList(name)
    })

    it('shows properties for a collection', () => {
      const name = uniqueName('AéB')

      createCollection(name)

      select(name)
      cy.get('#eXide-browse-toolbar-properties').click()

      cy.contains('Resource/collection properties').should('be.visible')
    })

    it('copies a collection into another collection', () => {
      const source = uniqueName('toBeCopiedAéB')
      const target = uniqueName('toBeCopiedInAéB')

      createCollection(source)
      createCollection(target)

      select(source)
      cy.get('#eXide-browse-toolbar-copy').click()

      openCollection(target)
      cy.get('#eXide-browse-toolbar-paste').click()

      // The copy landed inside the target…
      shouldList(source)
      // …and the original is still where it was.
      cy.request('/eXide/api/storage/db').then((response) => {
        expect(response.body.items.map((item) => item.name)).to.include(source)
      })
    })

    it('cuts a collection into another collection', () => {
      const source = uniqueName('toBeCutAéB')
      const target = uniqueName('toBeCutInAéB')

      createCollection(source)
      createCollection(target)

      select(source)
      cy.get('#eXide-browse-toolbar-cut').click()

      openCollection(target)
      cy.get('#eXide-browse-toolbar-paste').click()

      shouldList(source)
      // …and unlike a copy, the original is gone from where it came from.
      // Asserted against the storage API rather than by navigating back up,
      // since the browser has no "up" control — parent navigation is bound to
      // backspace on the table.
      cy.request('/eXide/api/storage/db').then((response) => {
        expect(response.body.items.map((item) => item.name)).to.not.include(source)
      })
    })

    it('opens a resource created outside the UI, then deletes its collection', () => {
      const name = uniqueName('AéB')

      cy.execXQuery(`xquery version "3.1";
        xmldb:create-collection("/db", "${name}"),
        xmldb:store(xmldb:encode("/db/${name}"), xmldb:encode("AéB.xml"), <foo/>)`)

      // Re-open the manager so the new collection is listed.
      cy.visit('/eXide/index.html')
      cy.dismissDialog()
      openDbManager()

      openCollection(name)
      cy.get('div.eXide-browse-main').within(() => {
        cy.contains('.browse-table tbody td.col-name', 'AéB.xml').dblclick()
      })

      cy.contains(`/db/${name}/AéB.xml`).should('be.visible')
      cy.get('#close').click()

      cy.visit('/eXide/index.html')
      cy.dismissDialog()
      openDbManager()
      select(name)
      deleteSelected()
      shouldNotList(name)
    })

    describe('resource properties for README.md', () => {
      it('should navigate to /db/apps/eXide and open properties for README.md', () => {
        // Navigate into apps
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'apps').dblclick()
        })
        // Navigate into eXide
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'eXide').dblclick()
        })
        // Select README.md
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'README.md').click()
        })
        // Open properties
        cy.get('#eXide-browse-toolbar-properties').click()

        // Confirm properties dialog is visible with correct title
        cy.get('#resource-properties-dialog').closest('dialog.eXide-dialog[open]').should('be.visible')
        cy.get('#resource-properties-dialog').closest('dialog.eXide-dialog[open]')
          .find('.eXide-dialog-title').should('contain', 'Resource/collection properties')

        // Confirm the permissions fieldset with legend exists
        cy.get('#resource-properties-content').within(() => {
          cy.contains('legend', 'Permissions').should('be.visible')

          // Confirm the permissions table has header row with User/Group/Other
          cy.get('table th').should('have.length', 3)
          cy.get('table th').eq(0).should('have.text', 'User')
          cy.get('table th').eq(1).should('have.text', 'Group')
          cy.get('table th').eq(2).should('have.text', 'Other')

          // Confirm checkboxes exist (4 rows x 3 columns = 12 checkboxes)
          cy.get('table input[type="checkbox"]').should('have.length', 12)

          // Confirm labels exist next to checkboxes
          cy.contains('table label', 'read').should('exist')
          cy.contains('table label', 'write').should('exist')
          cy.contains('table label', 'execute').should('exist')

          // Confirm owner/group selects exist
          cy.get('select[name="owner"]').should('exist')
          cy.get('select[name="group"]').should('exist')
        })
      })
    })
  })
})
