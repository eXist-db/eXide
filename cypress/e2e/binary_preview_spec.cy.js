describe('Binary file preview', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
    cy.wait(1000)
  })

  function openBinaryFile(path) {
    var name = path.split('/').pop()
    cy.window().then((win) => {
      win.eXide.app.$doOpenDocument({ path: path, name: name })
    })
  }

  it('shows preview overlay when opening an image', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    // Preview overlay should appear
    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    cy.get('.binary-preview-panel').should('exist')
  })

  it('displays image element for image files', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    cy.get('.binary-preview-content img').should('exist')
  })

  it('shows filename in preview header', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('.binary-preview-title', { timeout: 5000 })
      .should('contain', 'logo.png')
  })

  it('has Open in New Tab, Download, and Close buttons', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('.binary-preview-footer', { timeout: 5000 }).within(() => {
      cy.contains('button', 'Open in New Tab').should('exist')
      cy.contains('button', 'Download').should('exist')
      cy.contains('button', 'Close').should('exist')
    })
  })

  it('closes preview with close button (x)', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    cy.get('.binary-preview-close').click()
    cy.get('#binary-preview-overlay').should('not.exist')
  })

  it('closes preview with footer Close button', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    cy.get('.binary-preview-footer').contains('button', 'Close').click()
    cy.get('#binary-preview-overlay').should('not.exist')
  })

  it('closes preview with Escape key', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    cy.get('body').type('{esc}')
    cy.get('#binary-preview-overlay').should('not.exist')
  })

  it('closes preview when clicking outside the panel', () => {
    openBinaryFile('/db/apps/eXide/resources/images/logo.png')

    cy.get('#binary-preview-overlay', { timeout: 5000 }).should('exist')
    // Click on the overlay backdrop (not the panel)
    cy.get('#binary-preview-overlay').click('topLeft')
    cy.get('#binary-preview-overlay').should('not.exist')
  })
})
