// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// cy.login()
Cypress.Commands.add("login", (username, password) => {
    cy.session(['form', username, password], () => {
        cy.visit('/eXide/login.html')
        cy.get('[name=user]').type(username)
        if (password.length) {
            cy.get('[name=password]').type(password)
        }
        cy.get('[type=submit]').click()
        cy.url().should('contain', '/index.html')
    })
})

// cy.loginXHR()
Cypress.Commands.add("loginXHR", (user, password) => {
    cy.session(['xhr', user, password], () => {
        cy.request({
            method: 'POST',
            url: '/eXide/login',
            form: true,
            body: { user, password },
            headers: { 'Accept': 'application/json' }
        })
    })
})

// cy.logout() -- does not work reliably
Cypress.Commands.add("logout", () => cy.request('/eXide/index.html', {logout: true}))

const setBoolean = (value) => value ? 'yes' : 'no'
const getConf = function (executeQuery, restrictAccess) {
    return `<configuration>
    <restrictions execute-query="${setBoolean(executeQuery)}" guest="${setBoolean(restrictAccess)}"/>
</configuration>
`
}

Cypress.Commands.add("setConf", function (executeQuery, restrictAccess) {
    cy.loginXHR('admin', '')
    const body = getConf(executeQuery, restrictAccess);
    const confFilePath = "/apps/eXide/configuration.xml"
    cy.request({
        method: 'POST',
        url: `/eXide/store/db${confFilePath}`,
        headers: {
            'Content-Type': 'application/xml',
            'Content-length': body.length
        },
        body
    })
    .then((response) => {
        const parsed = JSON.parse(response.body)
        expect(parsed).to.have.property('status', 'ok')
        expect(parsed).to.have.property('externalLink', `/exist${confFilePath}`)
    })
})

//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This is will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })
