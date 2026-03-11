const collectionName = 'abc'

function openDbManager() {
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
}

context('DB Manager', () => {
  after(() => {
    // Clean up any test collections left behind by failed or interrupted tests
    cy.loginXHR('admin', '')
    cy.request({
      method: 'POST',
      url: '/exist/rest/db',
      headers: { 'Content-Type': 'application/xquery' },
      body: `for $col in ("${collectionName}", "def", "AéB")
             where xmldb:collection-available("/db/" || $col)
             return xmldb:remove("/db/" || $col)`,
      failOnStatusCode: false
    })
  })

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
    describe('collection creation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type(collectionName)
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', collectionName).should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', collectionName).click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', collectionName).should('not.exist')
        })
      })
    })

    describe('renaming operation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeRenamed')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeRenamed').should('exist')
        })
      })

      it('should rename selected', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeRenamed').click()
        })
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-rename').click()
        cy.focused().type('AéB{enter}')

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB', { timeout: 5000 }).should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').should('not.exist')
        })
      })
    })

    describe('properties operation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('AéB')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').should('exist')
        })
      })

      it('should check for properties', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').click()
        })

        cy.get('#eXide-browse-toolbar-properties').click()

        cy.contains('Resource/collection properties').should('be.visible')
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').should('not.exist')
        })
      })
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

    describe('copy operation', () => {
      it('should create collection to be copied', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedAéB')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should create collection to be copied in', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedInAéB')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').should('exist')
        })
      })

      it('should copy the collection', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').click()
        })
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-copy').click()

        //navigate into collection
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').dblclick()
        })

        //paste the collection
        cy.get('#eXide-browse-toolbar-paste').click()

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB', { timeout: 5000 }).should('not.exist')
        })

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').click()
        })

        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').should('not.exist')
        })
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('not.exist')
        })
      })
    })

    describe('cut operation', () => {
      it('should create collection to be copied', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedAéB')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should create collection to be copied in', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedInAéB')
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').should('exist')
        })
      })

      it('should cut the collection', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').click()
        })
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-cut').click()

        //navigate into collection
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').dblclick()
        })

        //paste the collection
        cy.get('#eXide-browse-toolbar-paste').click()

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedInAéB').should('not.exist')
        })
        // check the collection is removed by cutting it
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'toBeCopiedAéB').should('not.exist')
        })
      })
    })

    describe('create resource', () => {
      it('should create resource using xmldb', () => {
        cy.request({
          method: 'POST',
          url: `/eXide/execute`,
          form: true,
          body: {
            qu: `xquery version "3.1";

            xmldb:create-collection("/db","AéB"),
            xmldb:store(xmldb:encode("/db/AéB"), xmldb:encode("AéB.xml"), <foo/>)`,
            base: 'xmldb:exist://__new__1',
            output: 'adaptive'
          }
        })
      })

      it('should open resource', () => {
        cy.visit(`/eXide/index.html`)
        cy.dismissDialog()
        cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
        cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').dblclick()
          cy.contains('.browse-table tbody td.col-name', 'AéB.xml').dblclick()
        })

        cy.contains('/db/AéB/AéB.xml').should('exist')
        cy.contains('/db/AéB/AéB.xml').should('be.visible')

        cy.get('#close').click()
      })

      it('should delete the created collection', () => {
        cy.visit(`/eXide/index.html`)
        cy.dismissDialog()
        cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
        cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('dialog.eXide-dialog[open] .eXide-dialog-buttons button:first-of-type').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('.browse-table tbody td.col-name', 'AéB').should('not.exist')
        })
      })
    })
  })
})
