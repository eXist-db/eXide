// Derive expected URLs from Cypress's baseUrl so the spec works against any
// port/host the test runner is pointed at (CI defaults to localhost:8080).
const indexPage = `${Cypress.config('baseUrl')}/eXide/index.html`
const loginPage = `${Cypress.config('baseUrl')}/eXide/login.html`

describe('with guest=yes (default)', function() {
    before(function () {
        cy.setConf(true, true);
    })

    describe('as guest user', function() {
        it('login page shows the login form for an unauthenticated visitor', function() {
            cy.visit('/eXide/login.html')
            cy.url().should('eq', loginPage)
        })

        it('index page should show editor', function () {
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })

    describe('as admin user', function() {
        it('login page should redirect admin to index.html', function() {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/login.html')
            cy.url().should('eq', indexPage)
        })

        it('index page should show editor', function () {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })

        it('reload after logout still shows editor', function () {
            cy.loginXHR('guest', 'guest')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })
})

describe('with guest=no', function() {
    before(function () {
        cy.setConf(true, false);
    })
    after(function () {
        cy.setConf(true, true);
    })

    describe('as guest', function() {
        before(function () { cy.loginXHR('guest', 'guest') })
        it('login page should show', function() {
            cy.visit('/eXide/login.html')
            // cy.reload(true)
            cy.url().should('eq', loginPage)
        })

        // Authentication is no longer a server-side page gate — the controller
        // always serves the app and Roaster enforces access on the API. So the
        // page loads for a guest even under guest=no; the API denies privileged
        // operations (see the login-form and whoami tests below).
        it('index page still loads (the API, not a page redirect, enforces access)', function () {
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })

    describe('as admin', function() {    
        it('login page should redirect admin to index.html', function() {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/login.html')
            cy.url().should('eq', indexPage)
        })

        it('index page should show editor', function () {
            cy.loginXHR('admin', '')
            cy.visit('/eXide/index.html')
            cy.url().should('eq', indexPage)
        })
    })
})

describe('login using form', function () {
    before(function () {
        cy.setConf(true, false);
    })
    beforeEach(function () {
        cy.loginXHR('guest', 'guest')
    })
    after(function () {
        cy.setConf(true, true);
        cy.loginXHR('guest', 'guest')
    })

    it('login page should show', function() {
        cy.visit('/eXide/login.html')
        cy.url().should('eq', loginPage)
    })

    describe('with valid admin credentials', function () {
        it('should login in', function() {
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
    describe('with invalid admin credentials', function () {
        it('should not allow access', function() {
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
    describe('with valid guest credentials', function () {
        it('should still not allow guest', function() {
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

// The privileged /execute route (arbitrary XQuery -> XQueryServlet) is not a
// Roaster route, so it is gated in the controller: under guest=no a guest cannot
// run queries (403), but a dba still can (200). This is the API-level enforcement
// that replaced the old controller page-redirect for guest=no.
describe('query execution gate (/execute) with guest=no', function () {
    const execute = (overrides) => cy.request(Object.assign({
        method: 'POST',
        url: '/eXide/execute',
        form: true,
        body: { qu: '1 + 1', output: 'adaptive' }
    }, overrides))

    before(function () { cy.setConf(true, false) })   // execute-query=yes, guest=no
    after(function () { cy.setConf(true, true) })

    it('denies a guest with 403', function () {
        cy.clearCookies()
        execute({ failOnStatusCode: false }).then((res) => {
            expect(res.status).to.eq(403)
        })
    })

    it('allows a dba (admin) to execute', function () {
        cy.loginXHR('admin', '')
        execute().then((res) => {
            expect(res.status).to.eq(200)
        })
    })
})

// GET /api/auth/whoami must report identity from the eXist subject (sm:id()),
// not the persistent-login request attribute. The attribute is only populated
// by the cookie/param flow, so before this fix a request authenticated with the
// HTTP Basic header reported as "guest" even though it executed as the real
// user. These assert identity is consistent across all three auth mechanisms.
describe('whoami identity source (sm:id, not the login attribute)', function () {
    const whoami = '/eXide/api/auth/whoami'

    it('reports the real user under HTTP Basic auth (regression)', function () {
        cy.request({
            url: whoami,
            auth: { user: 'admin', pass: '' }
        }).then((res) => {
            expect(res.body.user).to.eq('admin')
            expect(res.body.isLoggedIn).to.eq(true)
            expect(res.body.isAdmin).to.eq(true)
        })
    })

    it('reports guest when unauthenticated', function () {
        // Cypress shares a cookie jar across requests; clear it so no
        // remember-me cookie leaks into this assertion.
        cy.clearCookies()
        cy.request({ url: whoami }).then((res) => {
            expect(res.body.user).to.eq('guest')
            expect(res.body.isLoggedIn).to.eq(false)
            expect(res.body.isAdmin).to.eq(false)
        })
    })

    it('reports the real user via the persistent-login cookie', function () {
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
