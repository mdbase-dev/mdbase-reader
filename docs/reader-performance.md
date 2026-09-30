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
