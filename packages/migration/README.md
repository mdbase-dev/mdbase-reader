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

## Readwise Reader

Paste a personal Readwise token and scan. Requests are read-only GETs to Reader
v3 and Readwise v2; highlights are joined by explicit IDs (or an unambiguous exact
quote within the same document), not by book title. Ambiguous overlap is retained
and warned about. Feed items are excluded unless explicitly selected. The current
scan retrieves saved HTML alongside metadata and annotations; binary PDF/EPUB
transfers wait until destination confirmation. A strictly metadata-only initial
scan remains future work.

The adapter imports saved HTML, downloadable original PDFs/EPUBs, metadata,
reading state, tags, highlights, comments and document notes. It does not fetch a
live website as a substitute for the saved article. Exact PDF rectangles/EPUB
CFIs are not promised. Native export JSON is archived without signed source URLs.

Tokens stay in memory, are cleared from the input after scanning and forgotten
on successful completion, replacement or page exit. They are never forwarded to
file hosts or written to browser storage. Readwise tokens themselves are **not**
read-only credentials. The API adapter honours rate limits and `Retry-After`;
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
then sources, then annotations bound to committed file IDs and content digests.
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
