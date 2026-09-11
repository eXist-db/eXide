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
            url: '/eXide/api/auth/session',
            form: true,
            body: { user, password },
            headers: { 'Accept': 'application/json' }
        })
    })
})

// cy.dismissDialog() -- wait for editor to load and login to complete, then dismiss any visible dialog
Cypress.Commands.add("dismissDialog", () => {
    // Wait for the editor to be initialized
    cy.get('#editor .cm-editor', { timeout: 10000 }).should('exist')
    // Wait for the login check to complete (user text changes from default)
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login')
    // Dismiss any startup dialogs
    cy.get('body').then(($body) => {
        const btn = $body.find('.eXide-dialog[open] .eXide-dialog-buttons button')
        if (btn.length) {
            btn[0].click()
        }
    })
})

// cy.execXQuery() -- run a setup/cleanup XQuery as admin, via eXist-db's REST
// query envelope. NOTE: this PR retires eXide's /execute route (query execution
// belongs to existdb-openapi's /api/query cursor now), so the helper posts an
// <exist:query> envelope as application/xml instead. Posting raw XQuery text to
// /exist/rest does NOT execute it -- eXist parses the body as XML and 400s
// ("Content is not allowed in prolog") -- so the envelope, and the status
// assertion below, are what keep a broken setup from silently no-opping.
Cypress.Commands.add("execXQuery", (query) => {
    return cy.request({
        method: 'POST',
        url: '/exist/rest/db',
        headers: { 'Content-Type': 'application/xml' },
        auth: { user: 'admin', pass: '' },
        body: `<query xmlns="http://exist.sourceforge.net/NS/exist"><text><![CDATA[${query}]]></text></query>`
    }).then((response) => {
        expect(response.status, 'setup/cleanup XQuery ran').to.be.within(200, 299)
        return response
    })
})

// cy.cleanupTestFiles() -- removes cypress-test-* files from /db
Cypress.Commands.add("cleanupTestFiles", () => {
    cy.loginXHR('admin', '')
    cy.execXQuery('xquery version "3.1"; for $r in xmldb:get-child-resources("/db") where starts-with($r, "cypress-test-") return xmldb:remove("/db", $r)')
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
        method: 'PUT',
        url: `/eXide/api/storage${confFilePath}`,
        headers: {
            'Content-Type': 'application/xml'
        },
        body
    })
    .then((response) => {
        expect(response.body).to.have.property('status', 'ok')
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
