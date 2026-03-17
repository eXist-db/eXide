describe('Local files pane (desktop simulation)', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
    cy.visit('/eXide/index.html')
    cy.reload(true)
    cy.get('.cm-editor', { timeout: 10000 }).should('exist')
    cy.get('#user', { timeout: 15000 }).should('not.have.text', 'Login')
  })

  function injectLocalFiles() {
    return cy.readFile('src-tauri/local-files.js').then((script) => {
      cy.window().then((win) => {
        win.eval(script)
      })
    })
  }

  function injectWithFolder(folderPath, entries) {
    return cy.readFile('src-tauri/local-files.js').then((script) => {
      cy.window().then((win) => {
        win.eval(script)
        if (win.__exideLocalFiles) {
          win.__exideLocalFiles.openFolderWithData(folderPath, entries)
        }
      })
    })
  }

  var mockEntries = [
    { name: 'src', path: '/mock/project/src', is_dir: true, children: [
      { name: 'app.xq', path: '/mock/project/src/app.xq', is_dir: false, children: null },
      { name: 'lib.xqm', path: '/mock/project/src/lib.xqm', is_dir: false, children: null }
    ]},
    { name: 'test', path: '/mock/project/test', is_dir: true, children: [] },
    { name: 'README.md', path: '/mock/project/README.md', is_dir: false, children: null },
    { name: 'pom.xml', path: '/mock/project/pom.xml', is_dir: false, children: null }
  ]

  it('injects LOCAL tab into the tab bar', () => {
    injectLocalFiles()

    cy.get('#tabs-outline li').should('have.length.at.least', 3)
    cy.get('#tabs-outline').invoke('text').should('contain', 'local')
  })

  it('shows local pane when LOCAL tab is clicked', () => {
    injectWithFolder('/mock/project', mockEntries)

    cy.get('#local-files-body').should('be.visible')
  })

  it('renders directory tree with folders and files', () => {
    injectWithFolder('/mock/project', mockEntries)

    // Check top-level entries only (direct children of #local-directory)
    cy.get('#local-directory > li.collection').should('have.length', 2)
    cy.get('#local-directory > li.resource').should('have.length', 2)
    cy.get('#local-directory > li.collection span').first().should('contain', 'src')
    cy.get('#local-directory > li.resource span').first().should('contain', 'README.md')
  })

  it('expands and collapses folders on click', () => {
    injectWithFolder('/mock/project', mockEntries)

    // src folder's children should be hidden initially
    cy.get('#local-directory > li.collection').first().find('> ul').should('not.be.visible')

    // Click the folder's label span to expand
    cy.get('#local-directory > li.collection').first().find('> span').click()
    cy.get('#local-directory > li.collection').first().find('> ul').should('be.visible')
    cy.get('#local-directory > li.collection').first().find('> ul > li.resource').should('have.length', 2)

    // Click the folder's label span again to collapse
    cy.get('#local-directory > li.collection').first().find('> span').click()
    cy.get('#local-directory > li.collection').first().find('> ul').should('not.be.visible')
  })

  it('switches between COLLECTIONS and LOCAL tabs', () => {
    injectWithFolder('/mock/project', mockEntries)

    // LOCAL should be visible
    cy.get('#local-files-body').should('be.visible')

    // Click COLLECTIONS
    cy.get('#tabs-outline li').first().click()
    cy.get('#local-files-body').should('not.be.visible')

    // Click LOCAL again
    cy.get('#tabs-outline').contains('local').click()
    cy.get('#local-files-body').should('be.visible')
  })

  it('filters local files', () => {
    injectWithFolder('/mock/project', mockEntries)

    cy.get('#local-filter').type('README')

    // Only README.md should be visible at root level
    cy.get('#local-directory > li.resource').filter(':visible').should('have.length', 1)
    cy.get('#local-directory > li.resource').filter(':visible').invoke('text').should('contain', 'README')
  })

  it('LOCAL tab shows active state when selected', () => {
    injectWithFolder('/mock/project', mockEntries)

    // LOCAL tab should be active
    cy.get('#tabs-outline').contains('a.tab', 'local')
      .should('have.class', 'active')

    // Other tabs should not be active
    cy.get('#tabs-outline').contains('a.tab', 'collections')
      .should('not.have.class', 'active')
  })

  it('LOCAL tab loses active when switching to COLLECTIONS', () => {
    injectWithFolder('/mock/project', mockEntries)

    // Click COLLECTIONS
    cy.get('#tabs-outline').contains('a.tab', 'collections').click()

    // LOCAL should no longer be active
    cy.get('#tabs-outline').contains('a.tab', 'local')
      .should('not.have.class', 'active')

    // COLLECTIONS should be active
    cy.get('#tabs-outline').contains('a.tab', 'collections')
      .should('have.class', 'active')
  })

  it('all three tabs cycle active state correctly', () => {
    injectWithFolder('/mock/project', mockEntries)

    // LOCAL is active
    cy.get('#tabs-outline').contains('a.tab', 'local').should('have.class', 'active')

    // Switch to COLLECTIONS
    cy.get('#tabs-outline').contains('a.tab', 'collections').click()
    cy.get('#tabs-outline').contains('a.tab', 'collections').should('have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'local').should('not.have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'outline').should('not.have.class', 'active')

    // Switch to OUTLINE
    cy.get('#tabs-outline').contains('a.tab', 'outline').click()
    cy.get('#tabs-outline').contains('a.tab', 'outline').should('have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'collections').should('not.have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'local').should('not.have.class', 'active')

    // Switch back to LOCAL
    cy.get('#tabs-outline').contains('a.tab', 'local').click()
    cy.get('#tabs-outline').contains('a.tab', 'local').should('have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'outline').should('not.have.class', 'active')
    cy.get('#tabs-outline').contains('a.tab', 'collections').should('not.have.class', 'active')
  })

  it('has correct folder icon classes', () => {
    injectWithFolder('/mock/project', mockEntries)

    cy.get('#local-directory li.collection i').first().should('have.class', 'fa-folder')
    cy.get('#local-directory li.resource i').first().should('have.class', 'fa-file-o')
  })
})
