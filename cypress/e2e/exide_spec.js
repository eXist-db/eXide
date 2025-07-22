describe('eXide', function() {
  it('should load', function() {
    // Go to eXide
    cy.visit('/eXide/index.html')

    // Reload in case there is weird earler version warning
    cy.reload(true)

  })
  it('should display editor', function () {
    cy.visit('/eXide/index.html')
    cy.get('.path')
    cy.contains('__new__1')
  })

  // more tests here
})
