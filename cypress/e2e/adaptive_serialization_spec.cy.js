/**
 * Adaptive serialization: verifies that eXide's results panel displays each
 * XDM atomic type using the W3C adaptive serialization form, as-is, with no
 * additional escaping or decoding by the client.
 *
 * The rendering path is:
 *   lsp:fetch() → AdaptiveWriter → eXide /api/query/{id}/results (items[].value)
 *   → contentDiv.textContent = item.value  (eXide.js fetchCursorPage)
 *
 * Test values are drawn from the XQTS ser/method-adaptive.xml test cases.
 */
describe('Adaptive serialization of atomic types', () => {
  /**
   * Set the active editor document content directly via the eXide JS API.
   * Avoids slow keyboard simulation.
   */
  function setEditorContent(text) {
    cy.window().then((win) => {
      const doc = win.eXide.app.getEditor().getActiveDocument();
      doc.setText(text);
    });
  }

  /**
   * Run the current editor content and return a Cypress chain that asserts on
   * the text of the first result item in the results panel.
   */
  function runAndGetFirstResult(timeout = 10000) {
    cy.get('#run').click();
    return cy.get('.panel-south .results .content', { timeout })
      .first()
      .invoke('text');
  }

  beforeEach(() => {
    cy.loginXHR('admin', '');
    cy.visit('/eXide/index.html');
    cy.reload(true);
    cy.get('.path', { timeout: 10000 }).should('contain', 'untitled-1');
    cy.get('#user', { timeout: 10000 }).should('not.have.text', 'Login');
    // Serialization mode defaults to "adaptive" (first option); no need to set it.
  });

  // ── Numerics with XQuery literal syntax ──────────────────────────────────

  it('xs:integer — bare number, no quoting (XQTS adaptive-46)', () => {
    setEditorContent('xs:integer(1)');
    runAndGetFirstResult().should('eq', '1');
  });

  it('xs:decimal — bare decimal, no quoting (XQTS adaptive-45)', () => {
    setEditorContent('xs:decimal(1.2)');
    runAndGetFirstResult().should('eq', '1.2');
  });

  it('xs:double — exponential notation, no quoting (XQTS adaptive-44)', () => {
    setEditorContent('xs:double(1e0)');
    runAndGetFirstResult().should('match', /^1\.0e0$/);
  });

  it('xs:float — constructor syntax xs:float("…") (XQTS adaptive-43)', () => {
    // xs:float has no XQuery literal form; serialized as xs:float("value").
    setEditorContent('xs:float("1e0")');
    runAndGetFirstResult().should('match', /^xs:float\("/);
  });

  it('xs:boolean true — true() function-call syntax (XQTS adaptive-74)', () => {
    setEditorContent('xs:boolean(true())');
    runAndGetFirstResult().should('eq', 'true()');
  });

  it('xs:boolean false — false() function-call syntax (XQTS adaptive-74)', () => {
    setEditorContent('xs:boolean(false())');
    runAndGetFirstResult().should('eq', 'false()');
  });

  // ── String-like types: double-quoted, no client escaping needed ──────────

  it('xs:string — double-quoted, displayed with quotes (XQTS adaptive-05)', () => {
    setEditorContent('"simple string"');
    runAndGetFirstResult().should('eq', '"simple string"');
  });

  it('xs:string — internal double-quotes are doubled, not backslash-escaped (XQTS adaptive-80)', () => {
    // XQuery "hello ""world""" → string value: hello "world"
    // Adaptive output: "hello ""world""" (outer quotes + doubled inner quotes)
    setEditorContent('"hello ""world"""');
    runAndGetFirstResult().should('eq', '"hello ""world"""');
  });

  it('xs:anyURI — double-quoted like xs:string (XQTS adaptive-77)', () => {
    setEditorContent('xs:anyURI("http://www.example.org/")');
    runAndGetFirstResult().should('eq', '"http://www.example.org/"');
  });

  it('xs:untypedAtomic — double-quoted (XQTS adaptive-35)', () => {
    setEditorContent('xs:untypedAtomic("untypedAtomic")');
    runAndGetFirstResult().should('eq', '"untypedAtomic"');
  });

  // ── Date/time types: constructor syntax typename("lexical-value") ─────────

  it('xs:dateTime — constructor syntax (XQTS adaptive-36)', () => {
    setEditorContent('xs:dateTime("1999-05-31T13:20:00-05:00")');
    runAndGetFirstResult().should('eq', 'xs:dateTime("1999-05-31T13:20:00-05:00")');
  });

  it('xs:date — constructor syntax (XQTS adaptive-38)', () => {
    setEditorContent('xs:date("1999-05-31")');
    runAndGetFirstResult().should('eq', 'xs:date("1999-05-31")');
  });

  it('xs:time — constructor syntax (XQTS adaptive-39)', () => {
    setEditorContent('xs:time("12:00:00")');
    runAndGetFirstResult().should('eq', 'xs:time("12:00:00")');
  });

  it('xs:duration — constructor syntax (XQTS adaptive-40)', () => {
    setEditorContent('xs:duration("P1Y2M3DT10H30M23S")');
    runAndGetFirstResult().should('eq', 'xs:duration("P1Y2M3DT10H30M23S")');
  });

  // ── Binary types: constructor syntax ──────────────────────────────────────

  it('xs:base64Binary — constructor syntax (XQTS adaptive-75)', () => {
    setEditorContent('xs:base64Binary("01001010")');
    runAndGetFirstResult().should('eq', 'xs:base64Binary("01001010")');
  });

  it('xs:hexBinary — constructor syntax, uppercase hex (XQTS adaptive-76)', () => {
    setEditorContent('xs:hexBinary("D74D35D35D35")');
    runAndGetFirstResult().should('eq', 'xs:hexBinary("D74D35D35D35")');
  });

  // ── QName: Q{namespace}localname syntax ───────────────────────────────────

  it('xs:QName — Q{namespace}localname syntax (XQTS adaptive-78)', () => {
    setEditorContent('xs:QName("xs:integer")');
    runAndGetFirstResult().should('eq', 'Q{http://www.w3.org/2001/XMLSchema}integer');
  });
});
