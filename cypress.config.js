const { defineConfig } = require('cypress')

module.exports = defineConfig({
  projectId: '6tyg6v',
  experimentalSessionAndOrigin: true,
  viewportWidth: 1200,
  viewportHeight: 860,
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
