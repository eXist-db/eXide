# eXide schema fallbacks (eXide#842)

Copies of eXist-db native grammars from `$EXIST_HOME/schema/` (exist#6528).

`editor:validate` prefers the native files when present; these copies are the
fallback for older servers. Keep them in sync with exist's `schema/` tree.

Long-term these files (and `catalog.xml`) can be removed once catalog-based
jaxp validation against the native set — fixed upstream (exist#6686,
exist-core#6687) as of eXist 7.0.0-beta4 — reaches a stable release, and
unsupported servers without `$EXIST_HOME/schema/` are gone.
