describe('Layout fills viewport', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
  })

  it('layout-horizontal extends to the bottom of the viewport', () => {
    cy.window().then((win) => {
      const viewportHeight = win.innerHeight
      cy.get('.layout-horizontal').then(($el) => {
        const rect = $el[0].getBoundingClientRect()
        expect(rect.bottom).to.be.closeTo(viewportHeight, 2)
      })
    })
  })

  it('west panel tabs align with editor tabs in light mode', () => {
    cy.get('#tabs-outline-container').then(($west) => {
      cy.get('#tabs-container').then(($editor) => {
        const westTop = $west[0].getBoundingClientRect().top
        const editorTop = $editor[0].getBoundingClientRect().top
        expect(westTop).to.be.closeTo(editorTop, 1)
      })
    })
  })

  it('west panel tabs align with editor tabs in dark mode', () => {
    // Switch to dark mode
    cy.get('#toggle-dark-mode').click()
    // Wait for theme to apply
    cy.get('body').should('have.class', 'dark')
    // Small wait for any reflow
    cy.wait(100)

    cy.get('#tabs-outline-container').then(($west) => {
      cy.get('#tabs-container').then(($editor) => {
        const westTop = $west[0].getBoundingClientRect().top
        const editorTop = $editor[0].getBoundingClientRect().top
        expect(westTop).to.be.closeTo(editorTop, 1)
      })
    })
  })

  it('layout fills viewport in dark mode', () => {
    cy.get('#toggle-dark-mode').click()
    cy.get('body').should('have.class', 'dark')
    cy.wait(100)

    cy.window().then((win) => {
      const viewportHeight = win.innerHeight
      cy.get('.layout-horizontal').then(($el) => {
        const rect = $el[0].getBoundingClientRect()
        expect(rect.bottom).to.be.closeTo(viewportHeight, 2)
      })
    })
  })
})
