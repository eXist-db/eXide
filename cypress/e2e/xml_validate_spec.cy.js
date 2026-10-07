describe('XML validation (api/editor/validate)', () => {
  beforeEach(() => {
    cy.loginXHR('admin', '')
  })

  const validate = (xml) =>
    cy.request({
      method: 'POST',
      url: '/eXide/api/editor/validate',
      headers: {
        'Content-Type': 'application/xml',
        Accept: 'application/json'
      },
      body: xml
    })

  it('accepts a valid collection.xconf via native schema when available', () => {
    const xml = `<?xml version="1.0"?>
<collection xmlns="http://exist-db.org/collection-config/1.0">
  <index/>
</collection>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'valid')
      expect(res.body).to.have.property('schema', 'collection.xconf.xsd')
      // Docker/CI with exist#6528 ships $EXIST_HOME/schema/; assert native path.
      expect(res.body.grammar).to.equal('native')
    })
  })

  it('rejects an invalid collection.xconf', () => {
    // Empty collection fails the XSD 1.1 assert that at least one of
    // index / triggers / validation must be present.
    const xml = `<?xml version="1.0"?>
<collection xmlns="http://exist-db.org/collection-config/1.0"/>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'invalid')
      expect(res.body).to.have.property('schema', 'collection.xconf.xsd')
      expect(res.body.errors).to.be.an('array').that.is.not.empty
      expect(res.body.errors[0].message).to.match(/assert|count\(\*\)/i)
    })
  })

  it('honours xsi:schemaLocation for collection.xconf', () => {
    const xml = `<?xml version="1.0"?>
<collection xmlns="http://exist-db.org/collection-config/1.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://exist-db.org/collection-config/1.0 collection.xconf.xsd">
  <index/>
</collection>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'valid')
      expect(res.body).to.have.property('schema', 'collection.xconf.xsd')
      expect(res.body.grammar).to.be.oneOf(['native', 'bundled'])
    })
  })

  it('validates expath-pkg.xml', () => {
    const xml = `<?xml version="1.0"?>
<package xmlns="http://expath.org/ns/pkg"
         name="http://example.org/test-pkg"
         abbrev="test-pkg"
         version="1.0.0"
         spec="1.0">
  <title>Test package</title>
</package>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'valid')
      expect(res.body).to.have.property('schema', 'expath-pkg.xsd')
      expect(res.body.grammar).to.equal('native')
    })
  })

  it('validates no-namespace mime-types.xml', () => {
    const xml = `<?xml version="1.0"?>
<mime-types>
  <mime-type name="application/xml" type="xml">
    <description>XML</description>
    <extensions>.xml</extensions>
  </mime-type>
</mime-types>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'valid')
      expect(res.body).to.have.property('schema', 'mime-types.xsd')
      expect(res.body.grammar).to.equal('native')
    })
  })

  it('rejects invalid no-namespace mime-types.xml', () => {
    const xml = `<?xml version="1.0"?>
<mime-types>
  <mime-type name="not-a-mime" type="xml">
    <description>bad</description>
    <extensions>.xml</extensions>
  </mime-type>
</mime-types>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'invalid')
      expect(res.body).to.have.property('schema', 'mime-types.xsd')
      expect(res.body.errors).to.be.an('array').that.is.not.empty
    })
  })

  it('marks plain XML without a known grammar as well-formed only', () => {
    const xml = `<?xml version="1.0"?><note><text>hi</text></note>`
    validate(xml).then((res) => {
      expect(res.body).to.have.property('status', 'valid')
      expect(res.body).to.have.property('grammar', 'none')
    })
  })
})
