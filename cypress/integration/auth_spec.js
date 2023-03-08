const indexPage = 'http://localhost:8080/exist/apps/eXide/index.html'
const loginPage = 'http://localhost:8080/exist/apps/eXide/login.html'

describe('with guest=yes (default)', function() {
    before(function () {
        cy.setConf(true, true);
    })

    describe('as guest user', function() {
        it('login page should redirect guest to index.html', function() {
            cy.visit('/eXide/login.html')
            cy.url().should('eq', indexPage)
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

        it('index page should redirect to login', function () {
            cy.visit('/eXide/index.html')
            cy.url().should('eq', loginPage)
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
