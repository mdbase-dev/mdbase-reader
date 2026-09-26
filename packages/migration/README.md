# Library migration

Reader's `/import` landing page links to `/import/zotero` and `/import/readwise`.
This package holds service extraction, validation, stable identities, preview and
repeatable one-way import. It has no Connect SDK dependency. The Connect adapter
is `packages/connect/src/migration-target.ts`; the UI owns authorization and
explicit destination confirmation.

## Zotero

Install the experimental exporter linked from `/import/zotero`. Export to a new
folder, then select that complete folder in Reader—not Zotero's data directory.
Reader verifies the manifest, record relationships, paths, file lengths and
SHA-256 checksums before allowing destination writes. Failed, cancelled and
unlisted-file bundles are rejected.

Original files, snapshot assets, all native metadata JSON, CSL, collection
membership, notes and native annotations are preserved. Missing attachments and
orphan notes are reported. CSL extensions not supported by Reader are retained
under `csl.custom.mdbase_zotero_extensions`; the untouched originals remain in
the import metadata/archive.

PDF highlight, page-note and image-region rectangles are converted into Reader's
page-point profiles using the original PDF's crop/media-box intersection and
intrinsic rotation. Native selectors and quotations remain untouched. PDF bytes
are read only, never rewritten. Highlights render; page notes can navigate to the
page; image regions render as area frames, not generated crops.

Missing/unreadable PDFs, non-default PDF UserUnit, malformed positions, multi-page
rectangles, ink and non-PDF selectors remain native-only and are counted in the
preview warning. There is no PDF quotation-search fallback. Snapshot-relative
images and embedded note images may not display. Preservation alone is not a
claim that Reader can navigate to an annotation's exact location.

Re-import does not overwrite existing records, including old native-only targets.
An existing collection requires a separately confirmed, revision-guarded repair
that adds only `target.pdf`, preserves every other field and the body, verifies
the bound PDF digest, and retains before-images outside the collection.

## Readwise and Readwise Reader

Paste a personal Readwise token and scan. Requests are read-only GETs to Reader
v3 (`/api/v3/list/`) and the Readwise v2 highlight export (`/api/v2/export/`),
both paginated with `pageCursor`/`nextPageCursor` (string or numeric cursors are
followed). Reader documents, highlights and notes are listed at Reader's
documented 20 requests/minute.

**Reader documents.** Without "Include unsaved Feed items", each library
location (`new`, `later`, `shortlist`, `archive`) and the highlight and note
categories are listed separately, so Feed items and their HTML are never
downloaded; the number of Feed items left out is counted in the warnings. v2
books are joined to Reader documents by explicit ID (`external_id`), never by
title; Reader highlights by explicit ID or an unambiguous exact quote within the
same document. Ambiguous overlap is retained once and warned about, and notes on
a reconciled highlight follow it. The scan retrieves saved HTML alongside
metadata and annotations; binary PDF/EPUB transfers wait until destination
confirmation. A strictly metadata-only initial scan remains future work.

The adapter imports saved HTML, downloadable original PDFs/EPUBs, metadata,
reading state, tags, highlights, comments and document notes. It does not fetch a
live website as a substitute for the saved article. Exact PDF rectangles/EPUB
CFIs are not promised. Native export JSON is archived without signed source URLs;
saved HTML is stored once, as the file, not repeated in frontmatter or the archive.

**Classic Readwise books.** Every non-deleted v2 book that is not a Reader
document (Kindle, Apple Books, Instapaper, Pocket, podcasts, tweets, manual
entries…) becomes a source with no file, identified as `v2-book:<user_book_id>`
in the `readwise:reader` namespace (Reader document IDs never contain a colon).
Title (`readable_title`), author, category (as `kind`), `source_url`, book tags,
summary, `cover_image_url` (as `cover_url`) and ASIN are mapped; the book's
`document_note` becomes a note. Highlights import as quote annotations keyed
`v2:<highlight id>`, with colour, tags, note, `highlighted_at` (else
`created_at`) and Readwise's `location_type`/`location` as the locator label, for
example `location 152`. That label is evidence, not a position Reader can open.
A source's `saved_at` is its earliest highlight time, since v2 has no save date.

**Skipped items are counted, never silent.** The preview shows sources and
annotations per category, and warnings count deleted books and highlights,
discarded highlights (still in the native archive), highlights without an ID or
text, Feed items, and v2 books or Reader highlights/notes whose Reader document
is outside the import. A highlight still present in Reader is imported whatever
its v2 state.

Tokens stay in memory, are cleared from the input after scanning and forgotten
on successful completion, replacement or page exit. They are never forwarded to
file hosts or written to browser storage. Readwise tokens themselves are **not**
read-only credentials. The API adapter honours rate limits and `Retry-After`, retries
429/502/503/504 responses a bounded number of times;
signed download links are renewed when expired or of unknown freshness. Browser
CORS or unavailable source files can stop an import without losing earlier writes.

Authenticated real-account Readwise coverage remains outstanding. Unit tests and
LAB browser tests use synthetic API responses and exercise actual Connect writes
and opening the resulting stored HTML.

## Destination, recovery and integrity

The current writable collection is the default. Select another authorized
collection or create a hosted collection through Connect, inspect the preview,
then explicitly confirm the named destination. The job captures that collection;
changing the app selection cannot redirect it.

Files commit first (up to three concurrent Zotero uploads; Readwise stays serial),
then sources, then annotations bound to committed file IDs and content digests
(classic Readwise sources have no files, so their annotations carry quotes only).
Large-file uploads and approval popups have separate ten-minute budgets rather
than inheriting short interactive RPC deadlines. Readable source descriptors include media types, roles and
revisions. Identities, checksums and stored references are verified. Existing
records are not overwritten. Different bytes or incompatible existing
representations stop the import instead of silently replacing user data.

Cancellation keeps committed data. Reselect the same bundle (or rescan Readwise
with a token) and the same destination to resume/deduplicate. Pending record
mutations have a browser-local recovery journal; file transfers use stable IDs.
This is **not** an unattended background job, persistent token store, continuous
sync, rollback operation, or update-overwrite workflow. Keep the browser open.

## Checks

```sh
pnpm --filter @mdbase-reader/migration test
pnpm --filter @mdbase-reader/connect test
pnpm --filter @mdbase-reader/app test
pnpm --filter @mdbase-reader/app typecheck
pnpm check:architecture
```

Use the isolated Connect LAB and disposable `[test]` collections for development
acceptance tests; never route fixture imports into a production collection.
