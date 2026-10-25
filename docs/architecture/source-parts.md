# Source parts: independently citable works in shared documents

Status: approved model; design only, not implemented. The three decisions in
[Open decisions](#open-decisions) still need maintainer confirmation.
Extends [source workspace](source-workspace.md),
[citation metadata](citation-metadata.md), and [citation claims](citation-claims.md).
Product constraints: portable collection data, immediate reading, no silent
substitution, and WCAG 2.2 AA.

## Model and boundaries

A source describes a work; a document describes its readable representation.
Neither a PDF boundary nor a file import defines bibliographic identity.

- The edited book/anthology is an ordinary source. Its `primary` document is the
  whole PDF/EPUB; its CSL describes the book, editors, publisher and ISBN.
- Each chapter is another ordinary source, with its own ID, literature note,
  reading state, citekey and CSL (`type: chapter`, title, authors, printed `page`,
  and `container-title` naming the book). CSL remains optional for reading.
- The chapter links upward through the **existing** `relations` field:
  `{ relation: "part-of", target: <source record link> }`. No `parent_id`, special
  chapter record type, reverse child list, or second bibliography is introduced.
- Its `documents` entry references the **same** file identity and path, with an
  optional `range`. The chapter may call this representation `primary` too;
  roles are local to a source. The parent is the conceptual file owner, not an
  exclusive storage owner or a file-deletion authority.
- Proceedings papers, journal-issue articles and encyclopedia entries follow the
  same model, with appropriate CSL types (`paper-conference`, `article-journal`,
  `entry-encyclopedia`). Do not coerce every part or container to `chapter`/`book`.
- A separately supplied chapter PDF uses the same `part-of` relation and its own
  whole-file document entry, **without** a range. It need not share parent bytes.

Never split, crop into new chapter files, copy, or re-upload the shared file.
A part can have several representations; each range belongs to exactly one
entry, not to the source or parent relation. PDF coordinates cannot be reused
for an EPUB alternative. Containers may be metadata-only sources.

## Portable record example

Illustrative frontmatter below omits record identity/timestamps and abbreviates
CSL. `REV` means the same real `sha256:` plus 64 lowercase hex digits in both
records; it is not a literal valid revision.

```yaml
# Book: sources/collected-essays.md
kind: document
csl:
  id: collected-essays
  type: book
  title: Collected Essays
  editor: [{ family: Editor, given: Ada }]
  publisher: Example Press
  ISBN: "9780000000002"
documents:
  - file_id: file_book
    file: "[[files/collected-essays.pdf]]"
    role: primary
    format: pdf
    media_type: application/pdf
    revision: REV
```

```yaml
# Chapter: sources/ways-of-reading.md
kind: document
relations:
  - relation: part-of
    target: "[[sources/collected-essays|Collected Essays]]"
csl:
  id: ways-of-reading
  type: chapter
  title: Ways of Reading
  author: [{ family: Writer, given: Bea }]
  page: "41-67"
  container-title: Collected Essays
  editor: [{ family: Editor, given: Ada }]
  publisher: Example Press
csl-provenance:
  container-title:
    value: Collected Essays
    source: parent:src_book
    agreed: ["parent record revision record_rev_7; csl.title"]
documents:
  - file_id: file_book
    file: "[[files/collected-essays.pdf]]"
    role: primary
    format: pdf
    media_type: application/pdf
    revision: REV
    range:
      kind: pages
      start: 52
      end: 78
      labels: { start: "41", end: "67" }
```

Generate targets with the collection's existing source-link conventions:
`sourceLink` currently writes `[[path-without-md|title]]`; mdbase resolves that
path to stable identity. Never put a bare source ID in `target` and assume it
resolves: this link declaration has no `id_field`. Resolve links through
Connect/mdbase, not title matching or a hand-written wikilink parser.
`relations[].target` already targets `reader-source`, with
`validate_exists: false`; missing parents must remain readable and diagnosable.

## Range vocabulary and validation

Range is optional. Absence means the whole representation, not a missing chapter
boundary. The document entry's `revision` is the range's revision; do not add a
second, potentially divergent range revision.

```yaml
# PDF: absolute, zero-based page indexes, both endpoints inclusive
range: { kind: pages, start: 52, end: 78, labels: { start: "41", end: "67" } }
# EPUB: package-relative spine resource hrefs in spine reading order
range:
  kind: epub-spine
  start: text/ch03.xhtml
  end: text/ch04.xhtml
  start_cfi: "epubcfi(...)" # optional, actual validated CFIs required
  end_cfi: "epubcfi(...)" # optional
# Safe archived HTML: fragment IDs, never selectors or executable URLs
range: { kind: fragment, start: "#entry-a", end: "#entry-b" }
```

- PDF requires integer `0 <= start <= end < pageCount`. Labels are optional
  display/citation evidence, not coordinates. Printed pages can be Roman,
  discontinuous or offset; CSL `page` must not be fabricated from PDF indexes.
- EPUB endpoints must resolve to spine items in the exact package revision,
  with start no later than end. Without CFIs include the whole endpoint items;
  with CFIs use the specified start point and end boundary. CFIs must resolve
  inside their respective endpoint resources, in reading order. Reject external
  hrefs, path traversal, non-spine resources and inverted same-item boundaries.
- HTML start resolves to one ID in the archived document. With end, the interval
  runs from start to immediately before end in DOM reading order; end must follow
  start. Without end, the range is the start element's subtree, not the rest of
  the page. Fragment lookup never executes page scripts or relaxes sandboxing.
- Recognized kinds must match the entry's media type. A ranged entry written by
  Reader requires file identity, file link and valid revision even though the
  current contract requires only `file`. One contiguous range per entry; disjoint
  works need a future explicit vocabulary, not overloaded arrays.
- Reject invalid new writes with field-specific errors. On external malformed
  data keep the source and raw entry, report the problem, and offer whole-file
  reading. Never silently discard `range` and present an unrestricted chapter.
  Unknown kinds are unsupported, preserved, and handled the same way.
- Sibling ranges can overlap: introductions, nested sections and shared pages
  make this legitimate. Warn with the conflicting sources, offer correction,
  and require acknowledgement during creation; never trim or shift either one.
  Do not infer annotation ownership from an ambiguous overlap.
- Validate against bytes only when available. Missing files, unavailable lengths,
  unresolved fragments or offline parent records mean **unverified**, not valid.
  Metadata editing and ordinary reading do not wait for background validation.

## Relations, chains and derived indexes

Reader's creation flow writes one immediate `part-of` parent per part. Preserve
other relation kinds unchanged. Multiple distinct `part-of` parents found in
external data are an ambiguity: show all, but disable automatic ownership and
inheritance until the user chooses; do not silently pick the first.

Reject self-parenting and cycles on Reader writes, checking resolved source IDs
rather than link spelling. On externally introduced cycles, stop traversal with
an explicit diagnostic and a visited set. Incomplete indexes cannot certify
acyclicity: resolve the proposed ancestor chain before committing a change.
A missing parent is a repairable broken link, never grounds to delete a part.

Chains such as chapter → volume → series are valid. Traverse them for breadcrumbs
and descendant annotation aggregation, not for blind CSL inheritance. Immediate
container semantics win: volume title becomes the chapter's `container-title`;
a series may contribute `collection-title` only through an explicit mapping.
A range refers directly to its file even when an ancestor has a different file.
Do not compose offsets down a chain or invent a file on a metadata-only ancestor.

Maintain disposable per-collection indexes of resolved parent/children and of
(file ID, revision) → ranged sources. Invalidate on source/link/file changes,
including path moves and external edits. Bounded, paginated descendant queries
must expose partial coverage; a partial index must never claim there are no
parts or shared-file references. Keep these indexes out of frontmatter.

## Reading and workspace context

Opening a chapter creates/focuses a source-bound workspace session and opens the
shared file at the range start, unless that chapter has a compatible saved
position. Positions and selectors remain **absolute document coordinates**.
A saved position outside the range is not resumed: the chapter quietly opens at
its start. The chapter chip's Go to chapter start command returns there.

Measure progress only within the validated interval: normalize the renderer's
position between its start and end boundaries and clamp to `[0, 1]`. PDF uses
`end - start + 1` pages, including intra-page progress where available; EPUB/HTML
use logical content positions, not viewport pixels. If a renderer cannot measure
reliably, show location/range without a percentage. Keep completion status an
explicit reading-state decision, not a side effect of opening a one-page part.
Book and chapter progress do not update each other.

The file remains freely navigable; never trap scrolling or change the active
source automatically. Chapter reading adds no row of chrome: a compact chip in the
document actions names the chapter and its progress, and its menu offers Go to
chapter start, Continue in the book and the next part. Only once the reader leaves
the chapter's pages does a single slim, dismissible hint float over the foot of the document
(“You’ve left this chapter · Back to chapter · Continue in book”), announced
politely; the chip then reads “Outside”. It takes no row, since resizing the viewer
makes the PDF renderer lose the reader’s place. A selection crossing a boundary is not clipped or split;
show its proposed owner and let the user change it before creation.

Retain Dockview's stable session identities, focus bridge, draft ownership and
close guards. Source tools follow the focused **source**, not just the file ID.
The book and two chapters can open the same bytes in distinct sessions with
independent positions/drafts. Share downloaded bytes and revision-keyed parsing
caches, not source context, progress writers or mutable renderer instances.
Include source/session and range identity in derived location/progress caches;
file/revision alone is insufficient to isolate chapters.

## Annotation identity, ownership and visibility

A document annotation continues to target file ID + file link + exact revision +
selector. Range is navigation context, not part of that target: page indexes,
CFIs and text positions are never made chapter-relative. Source-only notes remain
allowed; the current annotation model does not require a document for every note.

Each annotation has exactly one owning `sourceId`, persisted as the existing
`source` record link. In a chapter session it defaults to that chapter. Ownership
in a book session is an open decision below. Always expose the chosen owner in
the creation/edit UI; a setting must not make ownership invisible.

- Automatic source-note listing/materialisation includes only owned annotations.
  The book's annotation **view** aggregates its own and its descendants', labels
  each by owning chapter, and deduplicates by annotation ID. It does not copy
  records or insert chapter annotations into the book's Markdown note.
- On the book surface, render compatible descendant highlights on the same exact
  document revision; a per-chapter PDF's highlights cannot be projected onto the
  book PDF. Its annotations still appear in the aggregate with their own links.
- In a chapter view, owned annotations outside its range remain discoverable and
  labelled; do not lose them when a range is corrected. Existing annotations do
  not move merely because chapters were added, removed, or their ranges changed.
- Re-parenting an annotation between book and chapter changes only ownership
  (`source`/resolved `sourceId`, plus normal modification bookkeeping), never its
  ID, document target, selector, quotation or body. Confirm when the new owner
  does not list that document or its range excludes the selector.
- Move commands use revision-guarded updates and refresh both ownership indexes.
  Do not regenerate source-note bodies. Explicit user-authored embeds may exist
  in several notes; these are references, not multiple owners, and are not moved
  automatically. Explain that distinction rather than promise exclusive embeds.

## Parent-derived citation claims

Add `ClaimSource` kind `parent` to the existing claims/resolver system, not a
second inheritance engine. Proposed shape is `{ kind: "parent", sourceId: string }`;
round-trip its stable label as `parent:<sourceId>`. Claims carry parent record
revision and source CSL field in `evidence`, with `observedAt` from the read.
The relation is authoritative for finding the parent; labels are explanatory,
not alternate relation links. Do not treat two fields copied from the same
parent, or a parent and its copied registry value, as independent corroboration.

Use a field allowlist by container/part type:

- Book `title` → chapter `container-title`; `editor`, `publisher`,
  `publisher-place`, `edition`, `ISBN`, `volume` and applicable `issued` → the
  corresponding chapter variables, when present and applicable to that edition.
- Journal issue metadata can supply journal `container-title`, `volume`, `issue`,
  `ISSN` and applicable publication date; an issue's special title is not
  automatically the journal title. Proceedings/encyclopedia mappings likewise
  distinguish work, container and series titles.
- Never inherit parent `id`, `DOI`, `URL`, `page`, `title` as chapter title, or book
  authors as chapter authors. Chapter DOI, authors, title and page evidence come
  from the chapter itself. Outline headings supply provisional title candidates,
  not authors or printed pagination.

Parent claims start below chapter registry claims and above generic extraction
(recommend the existing site-adapter tier); user values/removals stay pinned.
Freshness alone cannot defeat stronger chapter evidence. A changed parent value
must be compared against the old parent-derived pin so even a same-tier change
becomes a reviewable suggestion, not a tie that hides the update.

Creation previews resolve chapter evidence plus allowed parent claims; explicit
Save copies the accepted values into ordinary `csl` and writes matching
`csl-provenance` beside it. Never embed relation objects or claims inside CSL.
Parent changes trigger lazy/background suggestions on affected parts, not child
writes. A missing/unreadable parent leaves the last saved CSL intact. Re-parenting
proposes a new container; it does not rewrite previously accepted citations.

Reuse external-edit detection, deliberate-removal pins, remembered dismissals,
Accept/Dismiss/Save and guarded CSL conflict handling from citation claims.
Untouched derived values remain explainable; manual edits stay pinned even after
parent updates. Read current parent/child revisions again before saving a stale
preview; changed inputs require review, not silent rebasing. No network lookup
is needed to derive claims from a local parent.

## Revision safety

`range` is valid only for its entry's revision. The current
`ConnectDocumentRepository` intentionally stats by stable file ID and returns the
**current** content digest; a matching path with a different ID is accepted only
when its digest matches. This is not permission to apply an old range to new bytes.

Compare the opened handle's revision with the ranged entry before navigation,
progress or default-owner inference. On mismatch:

1. Keep the old entry/revision/range unchanged. Mark the range **uncertain**.
2. Re-check PDF page count and outline destinations, EPUB spine/TOC and CFIs, or
   HTML fragment presence/order against current bytes. Equal length or surviving
   headings are evidence, not proof of identical chapter boundaries.
3. Offer current whole-file reading immediately with the warning; do not jump to
   an unverified old start or apply range-based progress/ownership on those bytes.
   Old annotation targets remain old; use existing incompatible-revision states.
4. Present proposed endpoints and labels for explicit confirmation. Save the
   confirmed range and entry revision together under a source revision guard.
   Never silently shift indexes, regenerate labels, or update revision alone.

Validation status is derived/cacheable by file ID, stored revision, opened
revision and range; losing a cache cannot turn uncertainty into confidence.
Replacing the book file invalidates every referencing part, not just the book.
Other representations validate independently. Offline/unavailable bytes retain
an unverified state; never assume historical revisions can be downloaded.

## Creation flows

All flows preview new source records, parent, document, ranges and citation
candidates before mutation. Assign stable IDs/paths to the reviewed plan; retries
reuse them, reconcile unknown outcomes and report partial completion rather than
create duplicate chapters. Re-check the source/file revisions before execution.

1. **Add chapters as sources…** on the book reads its exact PDF outline/EPUB TOC.
   Show a keyboard-operable checklist with hierarchy and editable boundaries;
   user picks entries. Propose an inclusive PDF end from the next peer TOC entry's
   start minus one (even if that peer is unselected), or document end; EPUB uses
   spine order and TOC CFIs. Nested headings and same-page starts need review,
   not automatic negative/overlapping intervals. A TOC destination alone does not
   establish the end; offer manual correction. Title-only metadata is acceptable.
2. **From a chapter DOI:** resolve chapter claims; inspect Crossref's container
   ISBN when supplied (not every chapter response has one). Find candidate book
   sources by normalized ISBN and edition, or preview creating one. Multiple
   editions/matches require choice; never merge by title alone. DOI printed pages
   do not reveal PDF page indexes. Attach a shared file/range only after matching
   its edition and confirming boundaries; otherwise create a metadata-only part
   or attach its separately supplied chapter PDF.
3. **From selected pages:** take the book's current exact PDF revision and absolute
   selected page interval; prompt for chapter title/authors and optional printed
   labels, preview overlap warnings and parent-derived CSL, then save one source.

Use a reference-existing-file creation path, not `sourceFrontmatter`'s current
upload-oriented representation pipeline. Duplicate-import checks by file digest
must allow intentional part sources sharing that digest while still detecting
retries and duplicate DOI/parent/range candidates. Adding chapters does not move
old book annotations; offer a separate reviewed ownership move if wanted.

## Deletion, detachment and re-parenting

Preserve existing source deletion semantics: revision-checked preflight, show
backlinks, delete the source record only; keep files and annotation records.
Deleting a chapter never deletes the shared file or sibling sources. Deleting a
book warns about its parts and offers cancel or explicit detach/re-parent work;
confirmed record-only deletion leaves diagnosable broken parent links, not a
cascade. Owned annotations likewise remain with broken owner links until repaired.

A separate detach/re-parent operation patches only the intended `part-of`
relation, checks cycles and new parent identity, and preserves documents, ranges,
CSL, note bodies and annotation owners. Changing a chapter's parent is not moving
its annotations to that parent. Propose citation updates separately. Detachment
can leave a useful standalone ranged source; do not expand its range automatically.

A separately requested file deletion must check **all** source references and
annotation targets, including missing parents and partial indexes, and disclose
the impact. Do not add automatic garbage collection under this feature. Multi-
record repairs use individually guarded, resumable writes with a visible partial
result; do not assume the SDK supplies a cross-record transaction.

## Open decisions

1. **New annotation ownership while reading the book inside a part:** recommend
   defaulting to the uniquely matching chapter, with a per-collection setting
   “Keep new annotations on the book” and a per-annotation owner control. Match
   only validated ranges on the exact revision; no match, uncertain range,
   overlap or cross-boundary selection defaults to book with a visible choice.
   This does not retroactively move annotations or switch the active source.
2. **Library display:** recommend parts nested under the book in ordinary library
   browsing, with independent reading state/counts, orphan parts visible at root,
   and search showing both book and chapter hits with container breadcrumbs.
   Counts describe source records, not unique files. Respect existing saved-view
   filters/sorts: nesting is presentation, not a replacement query system; a part
   must not disappear when its parent is filtered out. Flat view remains useful.
3. **Contract declaration versus extension-only:** recommend formally documenting
   `part-of` semantics and an optional discriminated `range` in a new minor source
   contract release, plus matching starter-type schema. Keep relation strings
   extensible, no parent/range requirement on ordinary sources, and annotation
   contract unchanged. During prerelease development choose an unused release
   identity under project policy, not the historically used `1.0.0-beta.2`.
   Additional properties already permit storage, but do not promise consumer
   support or validation. Declaring types for formerly arbitrary `range` values
   tightens validation: audit extension collisions and preserve/report malformed
   existing values rather than calling this universally backward-compatible.

## Contract delivery, migration and Connect/SDK implications

At this HEAD source/annotation contracts are `1.0.0-beta.1`, starter types are
integer version `2`, and Reader type pack is `1.0.0-beta.5`. These are independent
of manifest `requirements.capabilities.contract_version: 2` (the protocol).
The source contract's top level is closed, but document/relation items are open;
the starter source type itself is open, so `csl-provenance` already survives as
collection data without being a projected contract field.

**No existing-data migration is needed:** missing `range` means whole file;
missing `part-of` means ordinary source. Do not infer chapters, rewrite CSL, move
annotations or touch literature notes on upgrade. Contract/type-pack setup
upgrades, if decision 3 is accepted, are separate from record migration.

`reader-manifest.mjs` manages contract resources and seeds collection-owned types.
Publish a new immutable pack version/digest; never edit released baselines under
`apps/reader/mdbase/baselines` or reuse pinned release identities. Snapshot the
current version-2 starter's exact bytes as a new baseline before changing it,
retain all older baselines, and extend `upgrade_from`; increment the changed
type's integer version. Test replacement of unedited seeds and reviewed three-way
merge/conflict of customized seeds, including alternate explicit type keys.

Regenerate manifests through the existing writer. `verify-manifest.mjs` checks
provided/required contract identities, resource digests, empty-collection install,
implementations and simple source/view projection. Its source projection currently
hard-codes `1.0.0-beta.1`; update it deliberately for the selected contract version
and add shared-file/range fixtures. It does **not** currently prove upgrades,
range validity or preservation through custom contract mappings. Released-pack
test helpers reconstruct beta.3/beta.4 from current resources; freeze their old
contract/starter bytes before changing those resources so historical digest pins
remain meaningful, rather than changing expected released hashes.

Connect mapping needs typed optional ranges and resolved relations on source
summaries/full records; today `mapping.ts` drops both from the typed domain view
although raw properties remain. Keep portable snake_case fields at the adapter
boundary, preserve unknown fields on writes, and carry invalid/unsupported range
diagnostics instead of projecting a valid-looking whole-file chapter. Existing
`DocumentTarget` and selector contracts need no chapter-relative extensions.
Add guarded part creation, range confirmation and annotation-owner move commands
to Reader ports/adapters; reuse record/link/file stat/read APIs. No new upload
permission or SDK wire feature is inherently needed. Verify nested properties
survive contract projection in custom collections and in web/native adapters;
request broader SDK work only if those tests expose a missing capability.

## Accessibility and interaction requirements

Extend existing Reader controls, not a second workspace or visual language.
Checklist, range editor, owner selector, nesting disclosure and citation review
must work without dragging or pointer-only selection. Provide labelled numeric
page controls with both human page labels and explicit file-page indexes; announce
validation errors and resulting source counts. Keep focus through background
validation and restore it to the launching control on cancel/close.

Use semantic lists/disclosures for nested library rows and chapter-grouped
annotations; expose expanded state and chapter labels to assistive technology.
End-of-chapter and uncertain-range statuses require text, sufficient contrast and
polite announcements only on meaningful transitions, not every scroll event.
Markers must not steal focus or become modal barriers. Support zoom/reflow,
keyboard navigation, reduced motion, high contrast and touch targets on narrow
screens. Ownership must be announced before committing an annotation, including
when its default differs from the open source.

## Independently mergeable implementation slices

Each slice leaves ordinary sources working; new writes/UI stay gated until their
read path and validation are present. Decisions above are approval gates, not
permission for an implementer to choose silently.

1. **Core read model and validators.** Add optional range union, relation/diagnostic
   projections, pure bounds/progress/graph helpers. Tests: all endpoint cases,
   labels versus indexes, unknown/malformed kinds, overlaps, cycles, missing and
   multiple parents, chapter → volume → series, and unchanged ordinary records.
2. **Contract delivery, after decision 3.** Ship the reviewed contract/starter/pack
   upgrade independently of UI. Test immutable historical digests, fresh installs,
   old/customized seed upgrades, explicit type keys, range projection and the
   updated manifest verifier. No source-record migration or file writes.
3. **Connect read/write support.** Parse/preserve ranges and relations, create a
   part by file reference, guard range/owner/relation edits and recover retries.
   Tests: no upload/copy, shared digests allowed, external fields preserved,
   conflicts, partial batches, path moves, web/native parity and partial indexes.
4. **Revision-safe reading.** Add range-aware navigation/progress/end marker and
   uncertain-revision review behind a flag, initially with fixtures. Renderer
   tests cover PDF first/last/single pages, EPUB CFIs/spine and HTML fragments;
   integration tests replace same-ID bytes, keep old selectors unchanged, and
   isolate book/chapter sessions through docking, resume and offline reopening.
5. **Ownership and aggregation, after decision 1.** Add owner chooser/move and
   labelled descendant views without note rewriting. Tests: exact-revision
   filtering, overlap/cross-boundary defaults, per-chapter PDFs, deduplication,
   guarded moves, preserved embeds/drafts and record-only deletion repairs.
6. **Parent claims.** Extend claim labels/parsing, allowlisted adapters and refresh
   suggestions in the existing citation editor. Tests: plain CSL export, no parent
   DOI/author leakage, registry precedence, updated same-tier parent claims,
   manual pins/removals/dismissals, re-parenting and concurrent CSL/parent edits.
7. **Creation and library UI, after decision 2.** Wire outline/TOC, DOI and page-
   range previews, nesting/search and repair actions. Tests: ambiguous ISBNs,
   incomplete TOCs, cancelled/partially retried plans, filter-visible orphans,
   accessible keyboard flows, focus retention and non-colour warning states.
   Run isolated browser/accessibility audits and Connect LAB acceptance before
   enabling writes; never test these mutations against the user's real library.
