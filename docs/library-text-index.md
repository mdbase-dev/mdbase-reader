# Device-local library text index (HTML vertical slice)

Reader indexes saved HTML files without opening their reading surfaces. PDF and
EPUB still use the existing resident-document search. This is deliberately a
bounded first slice, not a claim of complete PDF/EPUB library coverage.

## Ownership and revision safety

- A collection-owned module worker owns IndexedDB, normalization, queries and
  excerpts. Nothing is uploaded. Database: `mdbase-reader-library-text-v1`.
- Entries are partitioned by collection identity and stable file identity, with
  the content-digest revision stored alongside the text. One slot per file means
  writes replace old revisions, not accumulate them. Source titles/paths are
  resolved against the current library, not copied into the index.
- Reconciliation drops changed revisions before extraction; complete library
  snapshots also remove deleted files. Partial snapshots retain undiscovered
  entries. Current descriptors filter every query response again, so stale
  revisions cannot appear while reconciliation is pending.
- Retained unchanged revisions require no download or extraction, including after
  closing/reopening Reader. Failed/evicted revisions are attempted at most once
  per collection session to avoid eviction churn. A later session may rebuild an
  evicted entry; the cache is not a permanent archive.

## Reading priority and limits

One serial queue uses the existing `gateway.readFile(file, revision, options)`
path, preserving Connect's read concurrency, revision checks and cancellation.
`maxBytes: 256 * 1024` refuses oversized HTML before download/allocation; the
queue defensively checks the returned bytes too. There is no first-million-text
truncation for accepted HTML files. Oversized and failed files are skipped, not
recorded as completely indexed.

The queue waits separately before reading, DOM extraction and worker writes.
Idle callbacks have **no timeout**; recent input, hidden documents and focus in a
reading iframe pause work. A three-second startup grace period leaves reading
startup alone. Browsers without idle callbacks use delayed, input-aware work.
Users can pause/resume from document search. Closing the collection aborts the
queue, cancels idle callbacks and terminates the worker, including pending RPCs.

HTML extraction reuses the renderer's blocked-element policy and body-text path.
It parses an inert document, never mounts a hidden renderer, and never fetches
embedded resources. DOM parsing remains synchronous, hence the conservative
256 KiB input ceiling; this is not a guarantee against every pathological HTML
layout on a slow device. Moving parsing off-thread requires a worker-compatible
HTML parser. PDF/EPUB background extraction needs separate renderer-owned,
resource-bounded adapters; opening hidden full renderers is intentionally avoided.

## Search and storage

Queries AND whitespace-separated substring terms; double quotes preserve a
phrase. Case and diacritics fold using Unicode NFD. Substring matching also works
for CJK without depending on whitespace segmentation. Excerpts retain original
Unicode spelling and give bounded context. Worker responses merge with resident
text into one result per current source, with the matching file displayed. Each
worker hit includes an HTML quotation from the original indexed text, with up to
64 characters of real prefix/suffix evidence (never excerpt ellipses). For AND
queries, the passage is the first query term/quoted phrase; the file must still
contain every term. Folded query offsets map back to original Unicode spelling.

Hits become `SearchDestination`s bound to the indexed file identity and digest
revision, including when the page has never been opened. A loaded-document
destination takes precedence when both exist, together with its own excerpt and
file label. The normal HTML renderer verifies the quotation before scrolling and
shows a temporary passage highlight without creating an annotation. Ambiguous or
changed text, a revision changed between search and opening, and an unsupported
surface leave the document at its usual position with the explicit Find status.
Stale hits are also filtered against current descriptors before display; they are
never rebound to a new revision. Alternate-file opening remains follow-up work:
if the opened file differs from the indexed target, verification falls back to
Find rather than jumping in the wrong attachment.

IndexedDB has an origin-wide **32 MiB estimated payload** and **2,048-entry**
ceiling across collections, not an unbounded per-collection allocation. The
estimate accounts for UTF-16 text, identities and metadata overhead; browser
storage-engine overhead is not byte-exact. Atomic transactions evict oldest
indexed files first (FIFO, not query-dependent LRU). Replacement revisions get a
new age. Browser quota, blocked storage, worker and transaction errors disable
this session's index and leave resident-document search usable. The UI states
partial coverage, skipped/evicted work and fallback; it has a polite status and
pause button, with no animated spinner. Clearing site data deletes the index.
This is separate from the offline shell cache: it stores extracted text, not
file bytes, credentials, grants or collection discovery. It is not an offline
collection mirror.

## Validation and reproducible measurements

Unit tests cover persistence/collection isolation, revision replacement,
unchanged-file skipping, partial/complete reconciliation, FIFO eviction, quota
fallback, cancellation, idle/input/visibility scheduling, Unicode/phrase queries,
HTML renderer text parity, hit-to-destination mapping with Unicode/context
preservation, stale-revision rejection, ambiguous-quote verification and loaded
destination preference during deduplicated resident/index merging.

The owned loopback browser audit also searches and opens an **unopened indexed
HTML page**, verifies the visible quotation highlight and focused status, and
checks ambiguous indexed quotations fall back to Find without a highlight:

```sh
node apps/reader/scripts/audit-search-passages.mjs
```

Run it against a local Vite server on port 5217 (or set `READER_AUDIT_ORIGIN` to
another loopback origin). The fixture uses the real worker, IndexedDB and HTML
renderer with intercepted collection reads; it is not connected LAB acceptance.

Run the isolated **local browser** benchmark (no Connect, no saved profile):

```sh
node apps/reader/scripts/benchmark-library-text.mjs
```

It creates its own loopback Vite server and disposable headless Chromium context,
uses the real HTML extractor, idle scheduler, worker and IndexedDB, then closes
both browser and server. It asserts 500 hits, zero repeated reads after reopening
the worker, query round trips below 100 ms, and a main-thread heartbeat with no
gap above 100 ms. The fixture is not a production build entry.

One local Chromium run, 500 × 8,457-byte HTML documents:

- Initial background indexing: **83.65 s** (intentionally idle/serial, not throughput optimized).
- Ten worker query round trips, matching a folded phrase near every file's end:
  **38.8 ms median / 44.4 ms maximum**.
- **5,259** main-thread heartbeats; largest 16 ms heartbeat gap **24.8 ms**.
- Reopening the persistent index: **0** document reads/extractions.

These are synthetic desktop fixture observations, not production-library,
mobile, authenticated LAB, PDF or EPUB performance claims. A separate 500-file
unit regression checks 1,500 event-loop opportunities and query latency below
100 ms; it does not substitute for browser extraction measurements.
