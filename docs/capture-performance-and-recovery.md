# Capture diagnostics and recovery

## Diagnosing timeouts

Turn on **Settings → Troubleshooting → Show connection diagnostics in the side panel**. Then, in
the extension capture panel, expand **Connection diagnostics**, start recording, reproduce
the problem, and choose **Download timings** before stopping/closing the panel.

- Off by default, memory only, bounded to 200 operation entries and 200 transport entries.
- Records SDK-boundary operation/pagination durations, route, overlap count, and coarse
  success/timeout/cancellation/failure outcomes.
- Observes browser fetch timings only for the configured Connect and loopback origins.
- Never records arguments, query text, source/collection IDs, paths, URLs, record bodies,
  response bodies, exception messages, credentials, or server timing descriptions.
- Nothing is uploaded. Stopping recording or closing the panel clears it.

The shared `readerDiagnostics` export supports the same opt-in recording for other Reader
consumers. These are client observations, not proof of server execution time. SDK elapsed
time includes coordination, retries and transport; `concurrentOperations` is not a queue-depth
measurement. Resource timings describe network spans only when the browser exposes them.
Unavailable detailed timings remain `null`; do not relax browser timing/privacy protections.

Compare operation intervals with network intervals to identify overlapping work and long
network spans. Exact separation of SDK queuing, relay waiting and daemon execution still
requires correlated upstream instrumentation. Do not infer it by subtracting arbitrary
concurrent spans. The original intermittent timeout has not yet been reproduced or attributed.

## Interrupted saves

The source import recovery marker is cleared both after a confirmed import and when retry
finds the already-committed source by URL. Existing source content is not overwritten.

An uncertain highlight save now persists its annotation ID and mutation ID before creation.
Reopening the panel restores that identity and checks for the original record before retrying.
The intent key is hashed and includes collection, source, selection, comment, colour and tags.
Success clears the persistent marker. Invalid recovery state fails closed rather than silently
allocating a replacement identity. SDK mutation recovery still runs before these operations.

Tests cover lost responses after source commit and annotation commit, including a fresh
`CaptureWriter` instance sharing the same durable journal.

## Browser acceptance

Run the disposable local authority fixture with a dedicated Vite server:

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5198 --strictPort
# In another terminal:
cd apps/reader
READER_AUDIT_ORIGIN=http://127.0.0.1:5198 READER_AUDIT_FORMATS_ONLY=1 node scripts/audit-reader.mjs
```

This launches and closes its own headless browser. Real PDF text selection creates a
revision-bound highlight; a full application reload must restore exactly the same stored
record, show its annotation card and navigate back to it. The fixture also checks PDF area
draft retention and EPUB selection/margin navigation. It does not write to a real collection
and is not a substitute for testing Connect authorization or transport recovery.

The 2026-09-26 isolated format run passed, with evidence at `/tmp/reader-audit-sG6mfP`.
The subsequent live LAB attempt was blocked by intermittent daemon health probing. After
user permission for browser reuse, the previous browser lease had ended; the run started and
later stopped its own guarded browser. Initial identity and doctor checks passed, and a new
`[test] Reader followup 20260926T033749` local collection was created. It did not appear in the
approval portal; no grant was approved. A subsequent doctor check reported port 28487 owned
by another process. Read-only inspection found that listener using LAB state, so this is an
unresolved health/ownership probe failure, not proof of a foreign daemon or a Reader defect.
Earlier daemon health requests also exceeded the helper's ten-second deadline.

The isolated collection was retained for safe cleanup after LAB health is repaired; no foreign
process was stopped. Evidence is in the private LAB browser session
`20260926T034217Z-1931304/reader-result.json`. Fresh live benchmarks and transport/recovery
acceptance remain pending. The existing direct-access failure tests remain in the extension
suite; they are not a substitute for the blocked live run.
