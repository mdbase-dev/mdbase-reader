# Reader performance paths

See [bundle boundaries and measurements](reader-bundle-splitting.md) for the
production chunk graph, renderer preloading and offline lazy-code checks.

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

## Large-library and long-article regression fixtures

The library fixture uses in-memory SDK pages and the production filtering and search
code. Each annotation search returns 200 matching annotations per owner. The browser
fixture runs Reader against an intercepted collection on loopback. It opens a real
sandboxed HTML document, saves selections through the toolbar and reloads the page.
CI checks the restored CSS Highlight ranges, their text, owning elements, geometry
and background colour for the h1 title, h2 “Abstract”, h3 and first paragraph.

The following medians compare `d94b99a6` (after #352) with this change on 2026-11-28.
Each timed operation has one warm-up and seven measured samples. The Vitest runner
used Node 22.22.0 on the shared build VM. Chromium 156.0.8078.4 ran locally.

| Vitest operation (ms)               | 2,000 before | 2,000 after | 10,000 before | 10,000 after |
| ----------------------------------- | -----------: | ----------: | ------------: | -----------: |
| Numeric field filter and sort       |         2.07 |        0.74 |          9.09 |         1.78 |
| Three title, author and tag queries |         2.57 |        2.55 |         14.90 |        14.97 |
| Annotation search result processing |         2.28 |        1.63 |          5.77 |         5.37 |
| Tag suggestions                     |         0.54 |        0.67 |          0.21 |         0.26 |

Numeric comparisons now skip display-value formatting. Annotation search resolves
each matching annotation's owner using the replica's link resolver, caches owner IDs
across pages and keeps the first three excerpts per owner. Its CPU figures exclude
SDK transport and query execution. Reader's Sources sidebar lists saved views, open
sources and recent sources. The tag suggestion menu samples the first 2,000 sources.
Reader has no folder-count sidebar.

| Chromium operation (ms)                                | Before | After |
| ------------------------------------------------------ | -----: | ----: |
| 10,000-row grid scroll until target row mounts         |   23.0 |  19.1 |
| Prepare HTML, load iframe and lay out 1,000 paragraphs |   27.1 |  25.4 |
| Locate and lay out 50 quote-only highlights            |   73.6 |   3.8 |
| Locate and lay out 200 quote-only highlights           |  286.9 |   8.5 |
| Read HTML import metadata (1,000 paragraphs)           |    0.5 |   0.4 |
| Read EPUB import metadata (one chapter)                |    3.4 |   3.2 |

Highlight timings start with a loaded article and a fresh runtime per sample. Each
quote-only target searches the body. The runtime now prepares the normalized text
once per root, draws the CSS ranges and lays out margin markers. The browser regression
also exercises selections with element-specific selectors. Import timings cover metadata
extraction from local bytes. Grid timings include animation-frame scheduling. At both
library sizes the grid mounted 20, 25 and 26 data rows at the top at viewport widths
of 360, 768 and 1280 pixels respectively (900 pixels high).

Run `rpnpm --filter @mdbase-reader/app run bench:library` for the CPU fixture.
After installing workspace dependencies and Playwright Chromium, run
`node apps/reader/scripts/audit-library-article.mjs` for the browser fixture.
It starts and closes its own loopback server. To compare an earlier commit, copy
the two benchmark files into a worktree at that commit and run the same commands.
