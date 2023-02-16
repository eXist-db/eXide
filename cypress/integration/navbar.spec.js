describe('Navbar', function () {

  it.skip("should display notification", () => {
    cy.visit('/eXide/index.html')
    cy.wait(500)
    cy.get("#ui-id-1").parents("div.ui-dialog ").within(() => {
      cy.get("div.ui-dialog-buttonset button").click()
    })
    cy.wait(500)
    cy.get("div.ui-dialog div.ui-dialog-buttonset button").filter(':visible').click()
    cy.get('#editor > div.ace_scroller > div').type("<weeeeeeeeeeeeeeeeee/>")
    cy.get("#eval").click()
    cy.wait(1300)

    cy.get("#copy-all-clipboard").click({ force: true })
    cy.get('body > div:nth-child(8) > div > div.ui-pnotify-text').contains('Copied to clipboard')
  })

  // as of now cypress does not provide a way to provide clipboard permissions
  it.skip('should copy to clipboard', function () {
    cy.visit('/eXide/index.html')
    cy.wait(500)
    cy.get("#ui-id-1").parents("div.ui-dialog ").within(() => {
      cy.get("div.ui-dialog-buttonset button").click()
    })
    cy.wait(500)
    cy.get("div.ui-dialog div.ui-dialog-buttonset button").filter(':visible').click()
    cy.get('#editor > div.ace_scroller > div').type("<weeeeeeeeeeeeeeeeee/>")
    cy.get("#eval").click()
    cy.wait(1300)

    cy.get("#copy-all-clipboard").click({ force: true })

    cy.wrap(Cypress.automation('remote:debugger:protocol', {
      command: 'Browser.grantPermissions',
      params: {
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        // make the permission tighter by allowing the current origin only
        // like "http://localhost:56978"
        origin: window.location.origin,
      }
    }))

    cy.window().then((win) => {
      win.navigator.clipboard.readText().then((text) => {
        expect(text.trim()).to.eq('<weeeeeeeeeeeeeeeeee/>');
      });
    });
  })

  // more tests here
})