// Derive expected URLs from Cypress's baseUrl so the spec works against any
// port/host the test runner is pointed at (CI defaults to localhost:8080).
const indexPage = `${Cypress.config('baseUrl')}/eXide/index.html`
const loginPage = `${Cypress.config('baseUrl')}/eXide/login.html`

describe('with guest=yes (default)', () => {
    before(() => {
        cy.setConf(true, true);
    })

    describe('as guest user', () => {
        it('login page shows the login form for an unauthenticated visitor', () => {
            cy.visit('/eXide/login.html')
            cy.url().should('eq', loginPage)
        })

        it('index page should show editor', () => {
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })

        it('return login info as json', () => {
            // check the login xhr request is returning JSON
            cy.intercept('GET', '/exist/apps/eXide/api/auth/whoami').as('loginRequest')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
            cy.wait('@loginRequest')
                .its('response.headers').should('have.property', 'content-type').and('include', 'application/json')
        })
    })

    describe('as admin user', () => {
        it('login page should redirect admin to index.html', () => {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/login.html')
            cy.url().should('eq', indexPage)
        })

        it('index page should show editor', () => {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })

        it('reload after logout still shows editor', () => {
            cy.loginXHR('guest', 'guest')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })
})

describe('with guest=no', () => {
    before(() => {
        cy.setConf(true, false);
    })
    after(() => {
        cy.setConf(true, true);
    })

    describe('as guest', () => {
        before(() => { cy.loginXHR('guest', 'guest') })
        it('login page should show', () => {
            cy.visit('/eXide/login.html')
            // cy.reload(true)
            cy.url().should('eq', loginPage)
        })

        // Hard guest gate: the app shell is served by a Roaster route (view:index)
        // that refuses a disallowed guest and redirects to login — so under
        // guest=no the editor never loads for an anonymous visitor.
        it('index page refuses a guest and redirects to login', () => {
            cy.visit('/eXide/index.html')
            cy.url().should('eq', loginPage)
        })

        it('index page returns 302 -> login.html for a guest (no app HTML served)', () => {
            cy.clearCookies()
            cy.request({ url: '/eXide/index.html', followRedirect: false }).then((res) => {
                expect(res.status).to.eq(302)
                expect(res.redirectedToUrl).to.match(/login\.html$/)
            })
        })
    })

    describe('as admin', () => {    
        it('login page should redirect admin to index.html', () => {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/login.html')
            cy.url().should('eq', indexPage)
        })

        it('index page should show editor', () => {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })
})

describe('login using form', () => {
    before(() => {
        cy.setConf(true, false);
    })
    beforeEach(() => {
        cy.loginXHR('guest', 'guest')
    })
    after(() => {
        cy.setConf(true, true);
        cy.loginXHR('guest', 'guest')
    })

    it('login page should show', () => {
        cy.visit('/eXide/login.html')
        cy.url().should('eq', loginPage)
    })

    describe('with valid admin credentials', () => {
        it('should login in', () => {
            cy.session(['form', 'admin', ''], () => {
                cy.visit('/eXide/login.html')
                cy.get('[name=user]').type('admin')
                // this will throw an error as .type cannot handle an empty string
                // cy.get('[name=password]').type('')
                cy.get('[type=submit]').click()
                cy.url().should('eq', indexPage)
            })
        })
    })
    describe('with invalid admin credentials', () => {
        it('should not allow access', () => {
            cy.session(['form', 'admin', 'nimda'], () => {
                cy.visit('/eXide/login.html')
                cy.get('[name=user]').type('admin')
                // this will throw an error as .type cannot handle an empty string
                cy.get('[name=password]').type('nimda')
                cy.get('[type=submit]').click()
                cy.url().should('eq', loginPage)
            })
        })
    })
    describe('with valid guest credentials', () => {
        it('should still not allow guest', () => {
            cy.session(['form', 'guest', 'guest'], () => {
                cy.visit('/eXide/login.html')
                cy.get('[name=user]').type('guest')
                // this will throw an error as .type cannot handle an empty string
                cy.get('[name=password]').type('guest')
                cy.get('[type=submit]').click()
                cy.url().should('eq', loginPage)
            })
        })
    })

})

// (The controller /execute route — and its authorization gate — has been retired;
// query execution now goes through the existdb-openapi /api/query cursor, which
// owns that authorization. See the guest-gate tests above for the page-level gate.)

// GET /api/auth/whoami must report identity from the eXist subject (sm:id()),
// not the persistent-login request attribute. The attribute is only populated
// by the cookie/param flow, so before this fix a request authenticated with the
// HTTP Basic header reported as "guest" even though it executed as the real
// user. These assert identity is consistent across all three auth mechanisms.
describe('whoami identity source (sm:id, not the login attribute)', () => {
    const whoami = '/eXide/api/auth/whoami'

    it('reports the real user under HTTP Basic auth (regression)', () => {
        cy.request({
            url: whoami,
            auth: { user: 'admin', pass: '' }
        }).then((res) => {
            expect(res.body.user).to.eq('admin')
            expect(res.body.isLoggedIn).to.eq(true)
            expect(res.body.isAdmin).to.eq(true)
        })
    })

    it('reports guest when unauthenticated', () => {
        // Cypress shares a cookie jar across requests; clear it so no
        // remember-me cookie leaks into this assertion.
        cy.clearCookies()
        cy.request({ url: whoami }).then((res) => {
            expect(res.body.user).to.eq('guest')
            expect(res.body.isLoggedIn).to.eq(false)
            expect(res.body.isAdmin).to.eq(false)
        })
    })

    it('reports the real user via the persistent-login cookie', () => {
        cy.clearCookies()
        // Mint the cookie the way the login form does (form params).
        cy.request({
            method: 'POST',
            url: '/eXide/api/auth/session',
            form: true,
            body: { user: 'admin', password: '' }
        }).then((res) => {
            expect(res.body.user).to.eq('admin')
        })
        // Subsequent request carries the cookie; whoami must agree.
        cy.request({ url: whoami }).then((res) => {
            expect(res.body.user).to.eq('admin')
            expect(res.body.isLoggedIn).to.eq(true)
            expect(res.body.isAdmin).to.eq(true)
        })
    })
})
