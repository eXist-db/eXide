const collectionName = 'abc'

function openDbManager() {
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > a').click()
  cy.get('#fullscreen > div.editor-header > div > ul > li:nth-child(1) > ul').find('#menu-file-manager').click()
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

    it('should open the db manager', () => {
      cy.get('#ui-id-11').should('be.visible')
      cy.get('#ui-id-11').invoke('text').should('eq', 'DB Manager')
    })

    it('should select the clicked document', () => {
      cy.get('div.eXide-browse-main').within(() => {
        cy.get('div[role=row][row-id=0]').find('div').first().click()
        cy.get('div[role=row][row-id=0]').should('have.attr', 'aria-selected', 'true')
      })
    })
    describe('collection creation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type(collectionName)
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', collectionName).should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', collectionName).click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', collectionName).should('not.exist')
        })
      })
    })

    describe('renaming operation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeRenamed')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeRenamed').should('exist')
        })
      })

      it('should rename selected', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeRenamed').click()
        })
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-rename').click()
        cy.focused().type('AéB{enter}')
        cy.wait(1000)

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').should('not.exist')
        })
      })
    })

    describe('properties operation', () => {
      it('should create a new collection', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('AéB')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').should('exist')
        })
      })

      it('should check for properties', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').click()
        })

        cy.get('#eXide-browse-toolbar-properties').click()

        cy.contains('Resource/collection properties').should('be.visible')
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').should('not.exist')
        })
      })
    })

    describe('copy operation', () => {
      it('should create collection to be copied', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedAéB')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should create collection to be copied in', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedInAéB')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').should('exist')
        })
      })

      it('should copy the collection', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').click()
        })
        cy.wait(500)
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-copy').click()

        //navigate into collection
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').dblclick()
        })

        //paste the collection
        cy.get('#eXide-browse-toolbar-paste').click()

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.wait(500)
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').click()
        })
        cy.wait(500)
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()
        cy.wait(500)

        cy.get('div.eXide-browse-main').within(() => {
          cy.wait(500)
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').click()
        })
        cy.wait(500)

        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').should('not.exist')
        })
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('not.exist')
        })
      })
    })

    describe('cut operation', () => {
      it('should create collection to be copied', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedAéB')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should create collection to be copied in', () => {
        cy.get('#eXide-browse-toolbar-create').click()
        cy.get('#eXide-browse-collection-name').type('toBeCopiedInAéB')
        cy.wait(500)
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').should('exist')
        })
      })

      it('should cut the collection', () => {
        //click on file by name
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').click()
        })
        //click on toolbar action
        cy.get('#eXide-browse-toolbar-cut').click()

        //navigate into collection
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').dblclick()
        })

        //paste the collection
        cy.get('#eXide-browse-toolbar-paste').click()

        //check for modification
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('exist')
        })
      })

      it('should delete the created collection', () => {
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedInAéB').should('not.exist')
        })
        // check the collection is removed by cutting it
        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'toBeCopiedAéB').should('not.exist')
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
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').dblclick()
          cy.contains('div[role=gridcell][col-id=name]', 'AéB.xml').dblclick()
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
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').click()
        })
        cy.get('#eXide-browse-toolbar-delete-resource').click()
        cy.get('body > div:nth-child(4) > div.ui-dialog-buttonpane.ui-widget-content.ui-helper-clearfix > div > button:nth-child(1)').click()

        cy.get('div.eXide-browse-main').within(() => {
          cy.contains('div[role=gridcell][col-id=name]', 'AéB').should('not.exist')
        })
      })
    })
  })
})