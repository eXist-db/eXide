// Guards against the module catalogue reaching out to the network. When eXide's
// own helper modules were reachable through util:mapped-modules() under a
// namespace eXist could not resolve locally, inspect:inspect-module-uri()
// fetched the namespace URI from exist-db.org — unbounded, while holding a
// broker. Under a slow remote that exhausted the broker pool and hung the
// server for every request. The catalogue must answer from local state only.

context('Editor module catalogue — resolves without remote lookups', () => {
  it('lists modules promptly and without eXide-internal helpers', () => {
    cy.request({
      url: '/eXide/api/editor/modules',
      auth: { username: 'guest', password: 'guest' },
      timeout: 15000
    }).then((r) => {
      expect(r.status).to.eq(200)
      expect(r.duration, 'response time (ms)').to.be.lessThan(5000)

      const uris = r.body.map((m) => m.uri)
      expect(uris).to.include('http://exist-db.org/xquery/util')
      uris.forEach((u) => {
        expect(u, 'eXide-internal namespace not listed')
          .not.to.match(/^http:\/\/exist-db\.org\/apps\/eXide\//)
      })
    })
  })
})
