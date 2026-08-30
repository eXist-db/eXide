const { defineConfig } = require('cypress')

module.exports = defineConfig({
  projectId: '6tyg6v',
  viewportWidth: 1200,
  viewportHeight: 860,
  // Assertions that wait on a server round trip need more than Cypress's 4s
  // default against a cold or loaded instance; retries absorb the rest of the
  // timing noise without hand-tuning individual specs.
  defaultCommandTimeout: 10000,
  retries: { runMode: 2, openMode: 0 },
  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      return require('./cypress/plugins/index.js')(on, config)
    },
    baseUrl: 'http://localhost:8080/exist/apps',
    specPattern: 'cypress/e2e/**/*.{js,jsx,ts,tsx}',
  },
})
