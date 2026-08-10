# Citation metadata: native CSL, reviewable enrichment

Status: accepted for the initial Reader product

## Decision

Reader stores one complete CSL JSON item directly on its source record. The
stored object is canonical: editing, bibliography export, Pandoc insertion,
materialisation, and validation all use that same value. Reader preserves
recognized CSL fields exactly and never maintains a second lossy citation
model.

Metadata inferred from a source, web capture, DOI, ISBN, or external service is
a **candidate**, not a write. The citation editor must show that distinction,
validate the candidate, and require an explicit save. Refreshing metadata must
not overwrite user-edited CSL.

## Lessons from BibLib

The local BibLib implementations demonstrate three useful boundaries:

- CSL JSON is the durable interchange value; BibTeX and Zotero objects are
  import formats that should be converted at an adapter boundary.
- Translation Server is substantially better suited to URL and identifier
  discovery than a growing set of client-side scrapers.
- citekey generation and collision handling are separate concerns. Generating
  a plausible key does not establish that it is unique in the collection.

Reader adopts those boundaries without importing BibLib's Obsidian service/UI
architecture or making Citation.js its domain model.

## Enrichment boundary

Future identifier lookup belongs behind a same-origin Reader service. That
service may use Translation Server, Citoid, Crossref, or another reviewed
provider, but it returns provenance-bearing CSL candidates and never receives
collection credentials. The browser validates and presents the candidate;
Connect persists it only after user approval.

URL capture remains useful when no external metadata service succeeds. Its
HTML metadata extraction produces a conservative candidate from title,
authors, publication date, site, language, description, and canonical URL.
Missing evidence stays missing rather than being fabricated.

## Import and conflicts

A single CSL object can be pasted and validated in the citation editor. Batch
CSL JSON, BibTeX, RIS, and Zotero imports require a content-free review plan
before mutation. That plan must report source matches, new sources, citekey
collisions, invalid entries, and preserved unsupported fields.

Library-wide bibliography construction is the authority for duplicate
citekeys. Exports include every valid unique item and visibly report missing,
invalid, and duplicate records. Citekey renames remain explicit migrations
because Pandoc citations in arbitrary Markdown may refer to the old key.
