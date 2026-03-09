describe('Tab bar overflow controls', () => {
  beforeEach(() => {
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.path', { timeout: 10000 }).should('contain', '__new__1')
  })

  describe('control buttons exist', () => {
    it('should render scroll-left, scroll-right, and list buttons', () => {
      cy.get('#tab-scroll-left').should('exist').and('be.visible')
      cy.get('#tab-scroll-right').should('exist').and('be.visible')
      cy.get('#tab-list-btn').should('exist').and('be.visible')
    })

    it('scroll-left should be disabled initially (single tab)', () => {
      cy.get('#tab-scroll-left').should('be.disabled')
    })
  })

  describe('dropdown menu', () => {
    it('tab-list-menu element should exist in DOM', () => {
      cy.get('#tab-list-menu').should('exist')
    })

    it('tab-list-menu should be hidden initially', () => {
      cy.get('#tab-list-menu').should('not.have.class', 'open')
      cy.get('#tab-list-menu').should('have.css', 'display', 'none')
    })

    it('clicking the ▾ button should add .open class to menu', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
    })

    it('clicking the ▾ button should make menu visible', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu')
        .should('have.class', 'open')
        .and('have.css', 'display', 'block')
    })

    it('menu should contain at least one tab entry', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu li').should('have.length.at.least', 1)
    })

    it('active tab should be marked in the dropdown', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu li.active').should('have.length', 1)
    })

    it('menu should have non-zero dimensions when open', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      cy.get('#tab-list-menu').then(($menu) => {
        const rect = $menu[0].getBoundingClientRect()
        expect(rect.width, 'menu width').to.be.gt(50)
        expect(rect.height, 'menu height').to.be.gt(10)
      })
    })

    it('menu should be within the viewport when open', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      cy.window().then((win) => {
        cy.get('#tab-list-menu').then(($menu) => {
          const rect = $menu[0].getBoundingClientRect()
          expect(rect.top, 'top within viewport').to.be.at.least(0)
          expect(rect.bottom, 'bottom within viewport').to.be.at.most(win.innerHeight)
          expect(rect.left, 'left within viewport').to.be.at.least(0)
          expect(rect.right, 'right within viewport').to.be.at.most(win.innerWidth)
        })
      })
    })

    it('menu should not be clipped by parent overflow', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      // Walk up the DOM checking no ancestor clips the menu
      cy.get('#tab-list-menu').then(($menu) => {
        let el = $menu[0].parentElement
        const menuRect = $menu[0].getBoundingClientRect()
        const ancestors = []
        while (el) {
          const style = window.getComputedStyle(el)
          const overflow = style.overflow + ' ' + style.overflowX + ' ' + style.overflowY
          if (/hidden|clip/.test(overflow)) {
            const parentRect = el.getBoundingClientRect()
            ancestors.push({
              tag: el.tagName,
              id: el.id,
              class: el.className,
              overflow,
              clips: menuRect.bottom > parentRect.bottom ||
                     menuRect.top < parentRect.top ||
                     menuRect.right > parentRect.right ||
                     menuRect.left < parentRect.left
            })
          }
          el = el.parentElement
        }
        // Log all ancestors with overflow hidden/clip
        ancestors.forEach(a => {
          cy.log(`${a.tag}#${a.id}.${a.class} overflow="${a.overflow}" clips=${a.clips}`)
        })
        // Fail if any ancestor actually clips the menu
        const clippers = ancestors.filter(a => a.clips)
        const desc = clippers.map(c => `${c.tag}#${c.id}.${c.class} overflow="${c.overflow}"`).join('; ')
        expect(clippers, 'no ancestor should clip the menu [' + desc + ']').to.have.length(0)
      })
    })

    it('clicking ▾ again should close the menu (toggle)', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('not.have.class', 'open')
    })

    it('pressing Escape should close the menu', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      cy.get('body').type('{esc}')
      cy.get('#tab-list-menu').should('not.have.class', 'open')
    })

    it('clicking outside should close the menu', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu').should('have.class', 'open')
      cy.get('#editor').click({ force: true })
      cy.get('#tab-list-menu').should('not.have.class', 'open')
    })

    it('clicking a tab entry should switch to that tab and close menu', () => {
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-menu li').first().click()
      cy.get('#tab-list-menu').should('not.have.class', 'open')
    })
  })

  describe('ui-init.js script loading', () => {
    it('should have loaded ui-init.js (button has click handler)', () => {
      // Verify the script attached handlers by checking aria-expanded toggles
      cy.get('#tab-list-btn').should('have.attr', 'aria-expanded', 'false')
      cy.get('#tab-list-btn').click()
      cy.get('#tab-list-btn').should('have.attr', 'aria-expanded', 'true')
    })
  })
})
