// Guards the storage-listing resilience fix (same family as existdb-openapi#72,
// #69): one child whose permissions a user can't read must not 500 the whole
// listing — it degrades to accessible:false. As guest, /db/system/security is
// rwxrwx--- (guest outside owner/group), so sm:get-permissions on it throws;
// db:browse-collection must catch that per-child rather than failing the listing.

context('Storage listing resilience — unreadable child does not 500', () => {
  it('lists /db/system as guest with the locked child degraded, not fatal', () => {
    cy.request({
      url: '/eXide/api/storage/db/system',
      auth: { username: 'guest', password: 'guest' }
    }).then((r) => {
      expect(r.status).to.eq(200)

      const byName = {}
      r.body.items.forEach((it) => { byName[it.name] = it })

      // World-readable children stay visible and accessible.
      expect(byName.config, 'config present').to.exist
      expect(byName.config.accessible).to.eq(true)
      expect(byName.repo, 'repo present').to.exist
      expect(byName.repo.accessible).to.eq(true)

      // The unreadable child is present but flagged — not an exception.
      expect(byName.security, 'security present').to.exist
      expect(byName.security.accessible).to.eq(false)
    })
  })

  it('marks readable entries accessible:true', () => {
    cy.loginXHR('admin', '')
    cy.request('/eXide/api/storage/db').then((r) => {
      expect(r.status).to.eq(200)
      // admin can read everything under /db — every entry carries accessible:true
      r.body.items.forEach((it) => {
        expect(it.accessible, it.name + ' accessible').to.eq(true)
      })
    })
  })
})
