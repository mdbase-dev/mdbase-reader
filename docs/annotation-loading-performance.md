# Annotation loading performance

Reader executes a saved annotation view once, then hydrates only its selected paths. An empty
selection performs no annotation queries or reads. Changing structural filters loads the whole
collection for local filtering; typing a search does not broaden the saved view's selection.
If view execution fails, Reader explains the fallback and applies its filters locally.

The Connect annotation repository queries in bounded scopes of 100 paths. Whole-record reads
remain limited to four concurrent workers. It hydrates a small initial batch of 16, then
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

The cache holds at most 2,000 records for at most 15 seconds. Query results do not expose record
revisions, so this is bounded reuse, **not** indefinite revision-validated caching. Queries still
run for each load to determine membership. Local creates and body updates install their returned
record revisions immediately; deletes evict records and abort pending reads. A save overtaking a
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
requires 20 whole-record reads rather than 1,000. This is a request-count reduction, not a measured
latency claim; authority query costs and the active transport still need runtime profiling.
