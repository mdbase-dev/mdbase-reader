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

## Editing and rendering

Reader exposes the canonical object through two lossless surfaces:

- a structured editor for identity, contributors, partial or literal dates,
  publication details, identifiers, access, and the common CSL item types;
- a Raw CSL editor for the complete schema and specialist fields.

Both surfaces edit the same draft. Structured edits remove only the field being
cleared and preserve every other property. Validity errors identify affected
fields; publication-quality suggestions remain non-blocking. Citekey
regeneration consults the complete library and resolves collisions
deterministically.

Live proofs run citeproc in the browser against bundled styles and locales.
Style selection changes presentation only. Citation drags expose Pandoc
Markdown and CSL JSON, with the portable Pandoc citekey as the default text.

## Enrichment boundary

Identifier lookup belongs behind the optional `ReaderWorkspaceGateway`
resolution capability. The production resolver will use a private Zotero
Translation Server behind an authenticated mdbase façade. It returns
provenance-bearing CSL candidates and never receives collection credentials.
The browser validates and presents a field-level comparison; Connect persists
it only after user approval.

URL capture remains useful when no external metadata service succeeds. Its
HTML metadata extraction produces a conservative candidate from title,
authors, publication date, site, language, description, and canonical URL.
Missing evidence stays missing rather than being fabricated.

## Deferred import and library maintenance

Batch CSL JSON, BibTeX, RIS, and Zotero imports are intentionally outside the
current feature. They require a review plan before mutation. Library-wide
citation maintenance views are also deferred until the mdbase view model can
represent them without a second custom filtering system.

Library-wide bibliography construction is the authority for duplicate
citekeys. Exports include every valid unique item and visibly report missing,
invalid, and duplicate records. Citekey renames remain explicit migrations
because Pandoc citations in arbitrary Markdown may refer to the old key.
