describe('eXide', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    // Reload in case there is weird earlier version warning
    cy.reload(true)
  })

  it('loads the editor page', () => {
    cy.url()
      .should('include', '/eXide/index.html');
  })

  it('displays the editor with default document', () => {
    cy.get('.path').should('contain', '__new__1');
  })

  // Add more tests here
})
