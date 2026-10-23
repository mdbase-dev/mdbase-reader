# Reader bundle boundaries

## Scope and reproduction

Base: `525af6f0d76c259a68d1fed550c0ce7b42e8f54d`.
`perf/reader-startup` ends at `97144c1`; its equivalent squash `847c41e` (#39)
is already in this base. That work splits the connection shell/preview, prioritises
requested sources, defers secondary collection work, streams indexes and records
startup measures. This change does not reimplement its loading/authorization paths.

```sh
pnpm --filter @mdbase-reader/app build
pnpm --filter @mdbase-reader/app build:report
# Build report: apps/reader/dist/.vite/reader-bundle.json (do not commit dist).
pnpm --filter @mdbase-reader/app exec vite preview --host 127.0.0.1 --port 5297 --strictPort
READER_PERF_ORIGIN=http://127.0.0.1:5297 node apps/reader/scripts/trace-preview.mjs /tmp/reader-preview-trace
READER_PERF_ORIGIN=http://127.0.0.1:5297 node apps/reader/scripts/audit-offline-bundle.mjs
```

Finite builds/checks were run via `rpnpm` on the shared builder; the production
preview/browser ran locally, without LAB, pairing, credentials or a real collection.
When pulling another build with `rpnpm --pull`, first remove the owned local `dist`
or discard old hashed assets: output retrieval may retain files from previous builds.

`build:report` enables a Vite stats plugin: per-chunk modules/rendered lengths,
static/dynamic edges and raw/gzip/Brotli sizes. The build's final check reads the
actual output bytes (including source-map URL comments), follows static dependencies,
rejects eager secondary surfaces/renderers or multiple YAML runtimes, and validates
the offline manifest. Compression uses Node's default gzip and Brotli settings;
reported sizes are not a network-latency prediction. Source maps and reports are
not precached or committed.

## Boundaries

- The current native SDK collection gate now defers `ReaderWorkspace` (gateway,
  document plumbing and platform adapters) until a collection is ready. The earlier
  startup work's `ReaderApp` boundary remains; it did not cover this newer native
  gate import. Authorization, adapter lifetime/disposal and requested-source loading
  are unchanged. Workspace code preloads while the ready collection adapter opens.
- PDF, EPUB and HTML already used dynamic imports. They now share retryable,
  preloadable loaders; opening the selected/restored document downloads only its
  renderer concurrently with document bytes, rather than waiting for those bytes.
  Preview reuses the HTML loader. PDF worker/WASM and Readium stay outside the
  initial/workspace static dependency graphs.
- Library tables/views, citation editor, source-note UI, add/import dialogs and
  display-settings content load only when mounted/opened. Display settings and
  citation/note tabs preload on pointer/focus intent. Native menu triggers remain
  immediate; mounting settings after the first open preserves menu behaviour.
- Source ZIP export and bibliography downloading start behind action-time imports.
  Bibliography eligibility/counts retain their existing synchronous core calculation;
  this change defers downloading, not that source-list scan.
- YAML serialisation callers dynamically import tiny writer adapters; YAML itself
  has only static importers. Vite deduplication shares one YAML runtime across the
  Reader, SDK and protocol, instead of three installations. The baseline Vite 8
  build did not reproduce the older static/dynamic-import warning, but its stats
  did reveal those three runtimes. Reader now requires YAML ^2.9.1, matching the
  SDK protocol's minimum, so deduplication does not downgrade its parser. Only the
  Reader lockfile importer/peer references change; SDK bundles and unrelated tool
  versions are untouched. No warning suppression.
- Failed chunk downloads have local loading/error/retry states, including retry
  after speculative preload failure. Retry does not reload the app or discard
  document/session/editor state.

## Measurements

Sizes below are **bytes**, written `raw / gzip / Brotli`. A graph includes all
transitive static JS dependencies, counted once; renderer rows name their main
on-demand chunks, not every supporting runtime/worker asset.

| Graph or chunk                                                      |                        Before |                         After |
| ------------------------------------------------------------------- | ----------------------------: | ----------------------------: |
| HTML shell entry graph                                              |     226,129 / 71,409 / 61,689 |     226,431 / 72,068 / 62,592 |
| Native connection route graph (shell + SDK entry/gate)              | 1,167,587 / 302,102 / 256,996 | 1,117,964 / 287,933 / 245,054 |
| ReaderApp static graph (including shared shell, excluding renderer) | 1,324,304 / 370,563 / 311,598 | 1,160,963 / 326,028 / 277,141 |
| ReaderApp chunk alone                                               |   877,681 / 228,624 / 186,906 |   698,330 / 177,700 / 146,722 |
| PDF main chunk                                                      | 1,238,515 / 296,301 / 217,627 | 1,237,861 / 296,139 / 217,310 |
| EPUB main chunk                                                     |     329,452 / 85,950 / 71,103 |     328,522 / 85,632 / 70,945 |
| HTML renderer chunk                                                 |        16,182 / 6,082 / 5,440 |        16,188 / 6,081 / 5,421 |

The ReaderApp chunk is 20.4% smaller raw / 22.3% gzip. Its static graph saves
163,341 bytes raw / 44,535 gzip (12.3% / 12.0%). The native gate saves 49,623 raw /
14,169 gzip. The tiny shell-only increase is disclosed: factoring shared JSX and
loader plumbing adds another shared request; shell entry splitting alone is not
claimed as a win.

Previously eager secondary code now has these separate chunks:

| Surface                       | After raw / gzip / Brotli |
| ----------------------------- | ------------------------: |
| LibraryWorkspace              | 106,208 / 31,729 / 27,798 |
| CitationEditor                |    32,092 / 8,541 / 7,568 |
| DisplaySettings               |       2,763 / 1,118 / 980 |
| SourceAddDialog               |     3,782 / 1,548 / 1,342 |
| SourceImportDialog            |     4,089 / 1,751 / 1,505 |
| Bibliography download adapter |           269 / 230 / 187 |

These rows exclude shared dependencies and must not be added to the graph totals.
The report identifies React DOM, React and the shared feedback UI as the shell's
main contents. Dockview dominates the original ReaderApp chunk, followed by table/
virtualisation code, library UI and citation forms. Dockview remains necessary;
secondary UI no longer sits in that same chunk. Three YAML installations become one;
the final shared YAML browser chunk is 96.33 kB raw.

### Local preview trace

Three fresh Chromium contexts per revision; production Vite preview on loopback,
external requests aborted, service workers blocked **for timing only**, no CPU or
network throttling. The script opens the real preview HTML document from the
library and waits for its iframe text, not first paint. First-sample Chrome trace
and all samples are retained locally:

- `/tmp/reader-trace-before/{trace,samples}.json`
- `/tmp/reader-trace-after-final/{trace,samples}.json`
- `/tmp/reader-metrics-{before,after}.json`; full before stats under
  `/tmp/reader-bundle-before-dist/.vite/reader-bundle.json`.

| Preview observation                        |          Before |           After |
| ------------------------------------------ | --------------: | --------------: |
| Loaded JS, decoded                         | 1,359,152 bytes | 1,307,736 bytes |
| Loaded JS, encoded                         |   384,327 bytes |   373,781 bytes |
| Library ready, median                      |          856 ms |          867 ms |
| Navigation to document text ready, median  |        1,061 ms |        1,021 ms |
| Open action to document text ready, median |          217 ms |          163 ms |

No unexpected page errors. Median opening observations decreased, but **these
samples do not establish a latency win**: extra lazy requests have costs and
host/network/font/CPU scheduling was not controlled across runs. The after samples
ranged from 1,008 to 1,434 ms navigation-to-document. This verifies fewer bytes and
captures the path for further controlled investigation. The preview starts in the library, so
it needs its library chunk, unlike a restored-document route. Native authorization,
service-worker background precaching, and cold first-painted PDF/EPUB need separate
controlled measurements.

## Offline verification

The existing SDK release-wide precache is retained, not replaced with entry-only
caching. Every production build checks the presence and SHA-256 of all public
assets, including unvisited lazy chunks, worker scripts, fonts and WASM. Hidden
analysis output and source maps remain excluded. Unit regressions reject missing
or stale lazy/worker/WASM assets and eager secondary modules.

The local production browser audit installs the shell online in a fresh owned
context, switches offline, reloads `?preview=1`, then opens the previously unvisited
HTML renderer, display settings and citation editor. It checks real iframe text,
controls and page errors. This verifies shell/lazy-code availability, not offline
collection discovery, authentication, document fetching or PDF/EPUB execution.

The full local fixture browser audit also passed (`/tmp/reader-audit-5b6TfC`),
including real PDF/EPUB rendering and annotation selection, docking/session/editor
preservation, search and a 5,000-source library. It retained at most four
renderers. This was development-server functional coverage, not a production timing
comparison or authenticated collection test.

## Validation

Final YAML-aligned `rpnpm check` passed: `pnpm lint` (ESLint, repository formatting,
architecture), recursive workspace typechecking and all recursive workspace tests,
plus root architecture/publisher tests. Reader reports 120 Vitest files / 525 tests,
with its Node build/deployment tests also passing. `build:report` invokes the normal
Reader production build and validates the actual offline manifest and chunk graph.
Final production offline audit passed with 106 precached assets. Generated
`mdbase-app.json` files were restored and are not part of this change. No push or
deployment.

## Remaining

Dockview remains essential to the workspace and the PDF/Readium dependencies are
still large **on-demand** chunks; Vite's >500 kB warning remains intentional.
Further reductions need renderer/dependency-specific work, not arbitrary manual
chunks that preload every format. Production authenticated collection latency,
mobile/native shells, and cold first-painted PDF/EPUB pages were not benchmarked.
The preview trace is a fixture observation, not a claim of improved collection
startup or first-painted document latency.
