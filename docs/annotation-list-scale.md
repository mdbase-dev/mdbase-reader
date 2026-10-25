# Source annotation list at scale

Branch: `t3/annotation-list-scale`.
Base: `525af6f0d76c259a68d1fed550c0ce7b42e8f54d`.
Benchmark fixture checkpoint: `f14be403d4e0831f1ba459944219494233b5d00f`.
Implementation: `3bb925bad24c35a256e23276e3f499a6241ed28c`.

## Measure first

The audit's remaining-opportunity description predates the starting checkout:
`VirtualAnnotationList` already used the installed `@tanstack/react-virtual` with
measured variable heights, overscan, and editor/focus pinning. **The baseline is
already windowed**, not a fabricated all-cards-rendered comparison. No dependency
was added.

The new isolated fixture mounts the real `AnnotationList`/`AnnotationCard` with
300, 1,000, or 3,000 annotations belonging to one disposable source. It mixes
bookmarks, quotations of nine different lengths, and comments of four lengths.
It uses the real list/search/filter/edit-session code and product CSS, without
Connect, network hydration, a PDF renderer, or attachments. This is list UI
performance, not end-to-end document/annotation loading performance.

Local headless Chromium **149.0.7827.55**, Node 22.22.0, Vite development React
build, 1280 × 960 viewport, no CPU/network throttling. Each size has five fresh
page samples; each page types six cumulative search strings, performs five scroll
jumps, then selects the last annotation. Values below are medians (typing and
scrolling: median of each page's interaction medians). Cold module preparation
can affect the first sample; raw samples are retained, not selectively removed.

Render CPU is summed React Profiler `actualDuration` during initial mounting.
Mount, typing, scroll, and selection latency are in-page event/change to two
`requestAnimationFrame` callbacks, including a paint opportunity. They exclude
Playwright transport/actionability but are frame-quantized, **not field INP**.
The approximately 32 ms typing values are at this measurement's frame floor;
they do not demonstrate a meaningful typing-latency improvement.

### Before → after, milliseconds

| Annotations | Render CPU    | Mount to paint opportunity | Search typing | Scroll jump   | Select last   |
| ----------- | ------------- | -------------------------- | ------------- | ------------- | ------------- |
| 300         | 34.10 → 27.30 | 46.30 → 43.50              | 32.10 → 31.90 | 50.10 → 54.70 | 32.00 → 32.00 |
| 1,000       | 68.60 → 32.70 | 85.50 → 51.00              | 31.40 → 31.80 | 95.80 → 53.60 | 36.80 → 31.90 |
| 3,000       | 52.40 → 36.00 | 63.80 → 53.10              | 32.20 → 31.80 | 63.20 → 63.10 | 35.10 → 32.10 |

These small development-mode samples are noisy (including a slower 300-item
scroll result); they establish bounded mounted-card counts and no scale-driven
interaction explosion, not a universal speedup or production/mobile guarantee.

### Memory and mounted cards, before → after

JS heap is CDP `Runtime.getHeapUsage.usedSize` after an explicit GC immediately
after initial mount. Delta is relative to the same fixture before mounting the
list, excluding browser/process/GPU memory. This is not peak allocation or a
long-reading-session retention measurement.

| Annotations | Total JS heap (MiB) | List mount heap delta (MiB) | Mounted cards |
| ----------- | ------------------- | --------------------------- | ------------- |
| 300         | 17.78 → 17.94       | 1.33 → 1.41                 | 8 → 8         |
| 1,000       | 18.15 → 18.52       | 1.35 → 1.64                 | 8 → 8         |
| 3,000       | 19.15 → 20.13       | 1.37 → 2.27                 | 8 → 8         |

The normalized search index deliberately trades some O(n) heap for avoiding
repeated sorting/normalization on each keystroke. The complete annotation snapshot
remains in memory; virtualization bounds cards/assets, not source hydration.
Raw results: [before](benchmarks/annotation-scale-before.json),
[after](benchmarks/annotation-scale-after.json).

## Design and behavior

- Reuse TanStack's `measureElement`/ResizeObserver variable-height windowing,
  stable annotation keys and four-item overscan. Keep at most the active editor
  and keyboard-focused card pinned outside the window. Document selection uses
  `scrollToIndex` with automatic variable-height correction. A selected card's
  later remount no longer independently scrolls the list.
- Sort and build normalized search text once per snapshot/order. Queries filter
  that index, including all annotations, not just mounted cards. Reuse numeric
  `Intl.Collator` and card-date `Intl.DateTimeFormat` instead of repeatedly
  constructing locale machinery. Existing filters/sorts/hidden-selection recovery
  remain intact.
- Each card wrapper is a focusable `listitem` in a named `list`, with filtered
  `aria-setsize`/`aria-posinset`. Up/Down/Home/End move focus to logical items,
  mounting and revealing them first. Tab/Shift+Tab traverse logical neighbors
  across gaps instead of jumping from a pinned card to an unrelated window.
  Text inputs/editors retain their ordinary editing keys.
- Native browser Find cannot search unmounted DOM. A visible **Render all for
  browser Find** option materializes the current filtered results in normal flow.
  Ctrl/Cmd+F while focus is in the annotation browser enables it without cancelling
  the browser shortcut. Find invoked outside that pane needs the explicit option.
  Uncheck it to restore windowing. Rendering all is intentionally slower and may
  retain edit-session cache entries; it is not the scalable default.
- A non-scrolling context row identifies the nearest available reading annotation;
  the corresponding card has a text label and `aria-current="location"`, not just
  color. Following initially reveals changing context. Wheel, touch movement,
  pointer/scrollbar interaction and list-navigation keys pause following until the
  reader explicitly chooses **Follow reading**. Editing/keyboard focus suppress
  passive jumps. Explicit document selection still reveals its card.
- Live surface-location events are coalesced to an animation frame. HTML/EPUB
  resolved-passage context reuses margin-marker layout coordinates, with one
  geometry read per frame rather than reading thousands of Range rectangles per
  scroll. Reflow updates that cache. EPUB ignores offscreen/preloaded frames.
  PDF context is nearest-page (ties use source annotation order), not within-page
  geometric distance. Bookmarks provide compatible progression fallbacks when
  resolved-passage geometry is unavailable. File/revision-mismatched positions and
  unrelated progression bases are never compared. Filtered-out reading context
  does not clear a user's filters or force a hidden card into the list.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
# Separate terminal; disposable fixture, no Connect pairing:
node apps/reader/scripts/measure-annotation-scale.mjs /tmp/annotation-scale.json
node apps/reader/scripts/audit-annotation-scale.mjs
# Existing real HTML/PDF/EPUB annotation workflows:
READER_AUDIT_ANNOTATIONS_ONLY=1 node apps/reader/scripts/audit-reader.mjs
```

Open `/test-fixtures/annotation-scale.html?count=3000` for manual inspection.
The fixture is development-only, not a production entry point.

## Validation

- New browser scale audit passed: real variable heights, bounded mounts after
  scrolling, distant selection visibly inside the scrollport, pinned focus,
  keyboard traversal, search/filter changes, empty recovery, full native-Find
  mode and restoration, reading-follow pause/resume, and list semantics.
- Existing annotation audit passed all 13 workflows with real HTML/PDF/EPUB
  renderers, including an assertion of live HTML reading context; final evidence:
  `/tmp/reader-audit-pK1lK5`.
- Desktop and 390 px fixture screenshots inspected:
  `/tmp/annotation-scale-desktop.png`, `/tmp/annotation-scale-mobile.png`.
- Unit regressions cover focus/window extraction, navigation across unmounted
  cards, Find mode, reading-follow pause, file/revision/progression compatibility,
  event coalescing/cleanup, cached nearest geometry/reflow, and visible EPUB frames.
- Workspace lint and recursive typechecking passed using `rpnpm run lint` and
  `rpnpm run typecheck` (the repository script runs `pnpm -r --if-present typecheck`).
  Lint includes ESLint, formatting, and architecture: 636 production files,
  1,079 relative imports, 17 packages, zero warnings.
- Full workspace tests passed through `rpnpm run test`, including the repository's
  architecture/publisher tests and `pnpm -r --if-present test`. Reader: **119 files,
  526 tests passed**; reading-surface: 22 tests; EPUB renderer: 33 tests.
- The initial validation rounds caught lint/refactoring issues and a happy-dom
  frame lookup assumption in the new EPUB test. Those were fixed before the
  final all-green runs; no failures were waived.
- Generated `mdbase-app.json` files were restored with explicit `git checkout --`
  paths and are not included in the commits. No blanket staging or stash was used.

## Remaining qualification

Production builds and low-end/mobile hardware profiling, physical touch and
screen-reader acceptance remain necessary. Browser Find is an explicit expensive
fallback, not native indexing of unmounted cards. PDF context is page-granular;
EPUB only reports resolved passages in loaded visible frames. Attachment-heavy
lists, full-source renderer decoration/anchor-resolution costs, long-session
edit-cache retention, and real Connect hydration were not benchmarked here.
No deployment or push was performed.
