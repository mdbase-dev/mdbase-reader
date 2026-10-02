# Annotation loading performance

Reader executes a saved annotation view once, then hydrates only its selected paths. An empty
selection performs no annotation queries or reads. Changing structural filters loads the whole
collection for local filtering; typing a search does not broaden the saved view's selection.
If view execution fails, Reader explains the fallback and applies its filters locally.

The Connect annotation repository queries in bounded scopes of 100 paths. With beta.124,
`read-many-documents-v1` authorities hydrate editable annotations with revision-bearing
`readMany` projections, removing redundant per-record revision reads. Older authorities retain
whole-record reads limited to four concurrent workers. It hydrates a small initial batch of 16, then
batches of up to 64, hydrating each query page before requesting the next. Early cumulative
snapshots are published through 128 annotations; afterward, publication waits for roughly 25%
growth, with an immediate final snapshot. This bounds cumulative copying without delaying the
first rows. The virtualized annotation table displays those snapshots with a loading indicator
until the read finishes.

## Reuse and freshness

Whole-record reads share a session-local cache, including across different saved views and
source panes. Concurrent readers of the same path share one request. Cancelling one subscriber
does not cancel others; cancelling the last subscriber aborts the underlying read. Failures and
abandoned responses are not cached.

The legacy cache holds at most 2,000 records for at most 15 seconds. Revisionless query rows
must match every observable content/file fact before reuse; an advertised revision must also
match. This is bounded reuse, **not** indefinite semantic-cache validation. Qualified batches
install their own content/revision pair without casting projections into full documents. Queries still
run for each load to determine membership. Local creates and body updates install their returned
record revisions immediately; deletes evict records and abort pending reads. A source reference changed
between discovery and hydration is resolved again before mapping. Qualified batch errors remain
visible; missing records are omitted rather than retried as point reads. A save overtaking a
read cannot be overwritten by that read's older response.

Use **View options → Refresh annotations** to rerun the saved view and bypass cached bodies
immediately. Retry does the same. Partial/scoped results never seed the gateway's complete
per-source annotation lists. Full explicit refresh replaces those lists unless a local mutation
occurred during the load.

Annotation count subscriptions track membership mutations and explicit refreshes, rather than
selected-source loading states. Navigation and body-only edits do not rescan counts.

## Verification

Regression coverage includes scoped and empty selection, bounded query scopes, progress before
next-page loading, cancellation isolation, expiry and explicit refresh, mutation/read races,
source-cache completeness, count subscriptions, and search within saved selections.

Opt-in Connect diagnostics now time `list-views` and `execute-view` alongside record reads and
query pages. Compare cold and warm loads, time to first visible batch, total time, and whole-record
read counts. For a saved view selecting 20 records from a collection of 1,000, cold hydration now
requires 20 legacy whole-record reads rather than 1,000. On qualified authorities, the 16/64
progressive batching fixture hydrates 130 annotations in three `readMany` calls and zero point
reads. These are consumer fixture counts, not a measured latency or wire-request claim (typed
batches also preselect membership on the authority).

Path/ID and annotation-source discovery uses `output: "metadata"` only after positive
`supportsAuthorityFeature("query-metadata-v1")` evidence; legacy ordinary queries remain.
Library views still retain full frontmatter for arbitrary columns. Document reopening and file
exports use SDK `files.stat`, including its negotiated legacy listing fallback, instead of Reader
folder enumeration/caches. Every lookup refreshes metadata; downloads remain revision-pinned.
