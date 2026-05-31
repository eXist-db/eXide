// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Global safety-net cleanup: removes any /db/cypress-test-*.xq files that
// individual specs left behind. Runs after the whole test session, on top of
// any per-spec `after()` cleanup hooks. Catches stragglers from specs that
// failed mid-test (before reaching their own after-hook) and from older runs
// that pre-date the per-spec cleanup convention. Idempotent — safe to run
// even when no test files exist.
//
// Raised by @duncdrum in PR #794 review (item 5: 'during test execution
// cypress creates multiple copies of /db/cypress-test-[some digits].xq
// files in the db, it should clean up after itself').
after(() => {
  cy.cleanupTestFiles()
})
