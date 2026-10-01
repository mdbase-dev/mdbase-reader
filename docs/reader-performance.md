# Reader performance paths

- **Annotation sidebar:** variable-height cards are virtualized with a bounded initial window
  and four-card overscan. Screenshot reads start only when their cards mount. An open editor and
  keyboard-focused card remain mounted outside the viewport. Selecting an annotation scrolls
  its index into view without scrolling hidden workspace tabs. Annotation filtering and sorting
  are memoized separately from viewport updates.
- **Content search:** authority queries restrict matching records to `reader-source` and
  `reader-annotation`. Bodies are still requested to construct passage excerpts; server-side
  excerpt projection would require additional Connect API support.
- **HTML highlights:** a runtime-local locator shares text indexes per selector root and ranges
  per quotation/selector. Body text/child changes and ID/class changes invalidate the caches,
  including synchronous mutations before observer delivery. Typography reflow preserves ranges.
  Range entries are capped at 2,000; disposal disconnects the observer and clears caches.
- **Workspace loading:** concurrent library and source loads share pending requests. Each caller
  has its own cancellation and library-progress subscription, including replay of the latest
  progress. Only cancellation of the final subscriber aborts underlying work. Failed and abandoned
  requests do not populate completed caches. A source read overtaken by a cached local write
  publishes the newer source.
- **Annotation overview:** cumulative progress publication intervals grow with list size rather
  than copying the growing list on every hydration batch. The first rows remain immediate and
  the last batch is always published. See [annotation loading](annotation-loading-performance.md).

Regression tests cover request sharing/cancellation/retry, HTML range/index reuse and mutation
invalidation, bounded cumulative copying, scoped search, and sidebar mount counts/editor/focus
retention. These establish work reductions, not measured browser latency improvements.

## Collection startup

Reader stays an SDK consumer; it does not duplicate authorization or readiness checks.

- The connection shell loads before `ReaderApp`; the preview is also lazy. ReaderApp is
  prefetched during collection verification, not before registration begins.
- Opening a library no longer selects and hydrates an arbitrary first source. An explicit
  source ID begins targeted loading immediately. Restored tabs absent from a **partial** index
  remain valid; their active source can load without waiting for the full index. Only complete
  indexes perform the normal missing-source checks.
- Source metadata precedes its annotation query. Global annotation counts wait for the complete
  source index; saved views defer while a requested/active source is loading.
- Sources use the existing SDK options `firstPageSize: 100`, `pageSize: 1000`. With the updated
  authority this means 11 requests for 10,000 sources, not 100. Older authorities remain usable
  but can retain their original small pages. Growing progress intervals bound cumulative
  snapshot copying even with those authorities; the first rows stay immediate.
- Navigation and library counts distinguish partial loading from an empty/complete collection.

The coordinated SDK change runs live setup assessment and contract description concurrently.
Both must finish successfully before ready; authorization, reviewed setup changes and exact
contract verification remain mandatory. Engine main already uses definitions-only assessment
for unchanged setup. The new engine cursor path pins SQLite metadata and collection definitions,
projecting only the requested pages for eligible queries. Complex queries retain the existing
materialized path. See the engine's `docs/reader-startup-cursors.md` and the SDK's
`docs/reader-startup.md` for eligibility and compatibility details.

### Browser-local diagnostics

Inspect `performance.getEntriesByType("measure")`. Fixed, bounded names contain no collection,
source, grant, path, or response payload, and nothing is uploaded:

- `mdbase:startup:registration`, `mdbase:startup:setup-assessment`, `mdbase:startup:contracts`;
- `reader:startup:{connection,first-page,library-index,source,document-surface}:{ready,failed,cancelled}`.

A document-surface measure completes when the active reading surface becomes available; it
is **not** a first-painted-page metric. Connection-shell, first rows, source metadata, document
surface and complete indexing are separate milestones. `watchStartMs` remains a timeout budget,
not a startup delay.

### Local observations (2026-11-06)

Fresh headless Chromium, three samples per CPU mode, gzip static serving, external requests
blocked, no authenticated collection; compared Reader main `1afe210` with the coordinated
Reader change using the same locally built SDK:

| Connection-shell observation       |          Before |         After |
| ---------------------------------- | --------------: | ------------: |
| Initial JavaScript, gzipped        |   394,436 bytes | 197,195 bytes |
| Initial JavaScript, decoded        | 1,470,198 bytes | 708,504 bytes |
| Desktop appearance, median         |          127 ms |         72 ms |
| 4× CPU slowdown appearance, median |          275 ms |        166 ms |

These measure only the shell, not authenticated collection readiness or document usability.
The engine's separate optimized 10,000-record synthetic benchmark excludes initial cache
construction and compares a bounded first page with full materialization; see its documentation.
Live LAB acceptance and a production collection trace remain separate validation steps.
