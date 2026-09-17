# Shared editing and autosave

## Behaviour (deployed)

Production is now **`e8f5d8ba296d-production-mu4z5689`**, with memory-only annotation autosave, deployed on explicit user approval. The previous explicit-save release still felt slow to the user; authenticated performance acceptance of this replacement remains pending.

- Source notes still autosave after **one second of inactivity**, with shared text and independent CodeMirror selection, cursor, scroll and undo history across panes.
- Existing annotation comments use a **native textarea and one-second debounced mdbase autosave**. Typing remains enabled while saving; requests are serialized and older replies never replace newer text. Automatic saves leave the editor open. Done/Ctrl/Cmd+S remain optional save-now/close actions.
- Only one pane edits an annotation at a time. **Edit here** transfers its buffer without losing text. Other panes show committed text, not per-keystroke previews. Deletion checks lock the editor, but ordinary saves do not.
- Annotation comments and unfinished new-highlight/area selections are **memory-only**, with no localStorage writes or IndexedDB checkpoints. New comments and crop Blobs survive source switches within this window, not reloads. Save highlight/area includes the newest characters immediately.
- New annotations still require explicit creation. Selecting a passage does not silently create a record. Citation forms retain their explicit validated save and single-owner policy.
- Failed saves retain text with Retry. Unsaved close/unload warnings remain; closing an editor does not stop its pending writer. **A crash, forced reload or bypassed unload warning can lose annotation changes not yet committed to mdbase.** Source-note recovery is unchanged.

## Implementation

`SourceDraftSession` retains its shared text, autosave and batched local checkpoints. `AnnotationEditSession` owns a single editor lease, private text, one-second collection timer and revision-checked writer. Only status/ownership/commit boundaries notify other subscribers, not every character. A later edit during a request is retained and saved afterward. `AnnotationCreationBuffer` keeps new-highlight text and selections in a window-local cache, without storage timers. `unsaved-annotation-edits.ts` tracks unsafe owners for tab/unload protection. Source-note annotation insertion still drains the source session instead of competing with its autosave.

For source notes, `SharedTextDocument` supplies synchronous text/subscription access to CodeMirror. Minimal external changes use `Transaction.remote` and `addToHistory: false`. Delayed initial focus is cancelled by subsequent user interaction, so a newly opened editor cannot steal another view's click or keystroke.

`SharedAnnotationResource` publishes query/mutation results to all panes. It deduplicates queries and overlays mutations made during an initial query, including deletion tombstones. Annotation editing mode is local to each list, rather than a global signal that opens/closes every editor.

Source drafts still use localStorage. A compatibility reader restores existing annotation drafts written by previous versions for review; merely loading one never submits it. Those entries are removed only after collection commit or an explicit discard/replacement/deletion. New typing does not update them. The old IndexedDB format remains solely for this compatibility path, not as a second save system.

### Memory-only annotation validation and deployment

**68 Reader test files / 212 tests** pass, along with Reader typecheck/build, changed-file lint/format, architecture (337 production files / 484 relative imports / 17 packages; zero warnings) and specification checks. Storage tests cover zero device writes, memory-only unload protection, legacy recovery, newer edits during slow saves and a stale-response/verified-refresh race.

The shared-editor fixture verifies zero annotation draft writes during creation and editing, serialized autosave, editable text during a delayed request, newer-text preservation, retry without background loops, close warnings, ownership transfer, revision conflicts, deletion leases and mobile textarea identity. Evidence: `/tmp/reader-audit-zCyOeZ`. Its 42 real browser keystrokes measured median next-frame latency **3.7 ms**, p95 **5.2 ms**, maximum **8.4 ms**, with no long tasks during that sample. These are fixture measurements, **not authenticated production performance acceptance** or proof that the user's remaining lag is resolved.

Annotation/cross-format audit: `/tmp/reader-audit-qFm1pW`, including memory-only PDF crop retention across source switches. Full fixture audit: `/tmp/reader-audit-BOGuTq`.

Deployed to **https://mdbase-reader.pages.dev**, deployment **https://d271fd19.mdbase-reader.pages.dev**. Twelve live artifact checks passed across both origins: revision, manifest, HTML, entry JavaScript/CSS and runtime preload match local production output byte-for-byte. Production Connect/loopback endpoints and the annotation autosave/memory-only implementation markers were verified. Pre-deploy source-map comparison confirmed unrelated dirty import/application-session code already matched production and was preserved. Evidence: `/tmp/reader-memory-production-deploy.log` and `/tmp/reader-memory-production-verification.json`. This verifies deployed artifacts, not authenticated typing performance.

### Batched local checkpoints (historical; annotations superseded above)

Edits update shared memory immediately, but no longer serialize a whole note or start an IndexedDB transaction on every keystroke. Recovery checkpoints run after **500 ms idle**, with a **3-second maximum scheduling delay** during continuous typing. Source-note collection autosave remains independently debounced at one second. The dirty-state subscription for annotation panes reads a boolean rather than rerendering on every global draft-version increment.

Pending checkpoints flush when the last session view detaches, a draft hook unmounts, the page becomes hidden, or pagehide/beforeunload fires; explicit session saves flush before starting collection work. New edits immediately invalidate the local-durability flag. An older IndexedDB completion cannot mark newer text saved. Collection success, deletion, and choosing a remote note version cancel obsolete queued writes. Synchronous unload checkpoints run before the note guard; unfinished IndexedDB writes and storage failures still prevent silent unload.

This deliberately introduces a small crash-recovery window: a hard process/device failure can lose text entered since the latest completed checkpoint. Three seconds is the foreground timer bound, not a guarantee against main-thread stalls, timer throttling, or delayed/failed storage. Normal lifecycle flushing does not guarantee asynchronous storage will finish if the process is forcibly killed.

Validation: Reader **66 files / 205 tests**, typecheck, build, changed-file lint/format, architecture and specification checks passed. Tests cover a 120 KB note burst (20 changes, one checkpoint), continuous typing (60 changes over six seconds, two checkpoints), IndexedDB completion races, obsolete-checkpoint cancellation, remote-choice cleanup of an older stored note, storage failures, and unload guards. The shared-editor browser fixture additionally counts real storage calls during browser keystrokes: immediate two-pane text and one write after the burst (`/tmp/reader-audit-tfAdzG`). The full browser fixture audit passed (`/tmp/reader-audit-2qy538`). These checks are not authenticated production acceptance or proof that all perceived typing lag is resolved.

Deployed on user approval as **`87e4c05c9901-production-mu4rpd5i`** to **https://mdbase-reader.pages.dev**, deployment **https://0a07b7de.mdbase-reader.pages.dev**. Live build revision, manifest, HTML, entry JS/CSS and runtime preload match the local production artifacts byte-for-byte on both origins; production Connect/loopback endpoints and the 500/3000 ms checkpoint constants were verified. Before deployment, the previous live entry source map matched the checkout's unrelated import/application-session source changes; that already-deployed work was preserved, not reverted. Evidence: `/tmp/reader-checkpoint-production-deploy.log` and `/tmp/reader-checkpoint-production-verification.json`. The user still reported lag after testing this release; it contains no annotation-editor redesign.

Known old record revisions cannot replace newer session state. Source writes refresh before saving; failed annotation writes can fetch the current record and offer a revision-checked conflict choice without a page reload. Deletion checks acquire an owner-specific session lock, pause all editors, and drain an outstanding write. Closing the checking view releases its lock; an already committed deletion request retains the lock until it completes.

Dockview still exclusively owns layout. Editor bodies and recovery state are not serialized into its layout envelope.

## Explicit-save annotation redesign (historical)

This earlier release uses explicit Done saves and persistent recovery, unlike the local implementation described above. `AnnotationTextArea` replaces CodeMirror for creation and existing comments. The editor component holds typing state locally; session/recovery state changes only at dirty, checkpoint, ownership, conflict and commit boundaries. The staged recovery snapshot is not the authoritative latest buffer: save, close/transfer and lifecycle flushes read the editor/creation buffer. Async IndexedDB writes still require the unload guard; forcing through its warning can lose pending text.

Validation: **68 Reader test files / 210 tests**. Real storage tests verify 40 rapid changes cause one shared dirty notification, unloading checkpoints the final text, and recovered comments never autosave. The browser fixture counts zero annotation PUTs during typing, exactly one per explicit attempt, and verifies failed-save retry, transferable single-editor ownership, close/reload recovery, confirmed discard, conflict choice and mobile textarea identity (`/tmp/reader-audit-AaAyyz`). Cross-format/annotation audit passed (`/tmp/reader-audit-ryykCB`); full fixture audit passed (`/tmp/reader-audit-EpGutk`). Typecheck/build, changed-file lint/format, architecture and specification checks passed. Recovery tests also cover typing again while an older IndexedDB checkpoint is in flight: its completion cannot mark the newer buffer durable. These are fixture checks, not authenticated production acceptance or proof of resolved physical-device lag.

Deployed on explicit user approval as **`5c310047f773-production-mu4v9jes`** to **https://mdbase-reader.pages.dev**, deployment **https://cceec126.mdbase-reader.pages.dev**. Build revision, manifest, HTML, entry JavaScript/CSS and runtime preload match local production artifacts byte-for-byte on both origins. Production Connect/loopback targets, native textarea markers, and removal of the annotation collection-autosave timer were verified. Pre-deploy comparison against the prior live entry source map showed only intended redesign changes; unrelated already-deployed import work was preserved. Evidence: `/tmp/reader-simple-production-deploy.log` and `/tmp/reader-simple-production-verification.json`. This was artifact verification; the user subsequently tested it and still reported lag.

## Original shared-editor validation (historical)

- Reader: **62 files / 190 tests**.
- Markdown editor: **6 files / 22 tests**.
- Full browser audit: `/tmp/reader-audit-62VfVA`.
- Shared-editor audit: `/tmp/reader-audit-XTRbus`.
- Responsive audit: `/tmp/reader-audit-LYPevt`.
- Reader typecheck/build, architecture and specification checks passed.

The shared-editor audit exercises live two-pane text, local undo, synthetic IME composition with a simultaneous remote edit, offline recovery, noninterruptive safe close, explicit annotation creation, shared save failure/retry, deletion lock ownership, an external revision conflict, and mobile editor identity. The full suite additionally covers HTML/PDF/EPUB, crop recovery, docking, linked deletion warnings, and migration. Dirty-close regressions now deliberately make local storage unavailable rather than treating every safely stored edit as unsafe.

```sh
READER_AUDIT_SHARED_EDITING_ONLY=1 pnpm --filter @mdbase-reader/app test:browser
```

## Boundaries

These browser tests use disposable fixture data, not authenticated Connect acceptance. Physical-phone keyboards, native OS IME behaviour, and screen readers still require real-device checks. Shared live editing is within one Reader window, not cross-window/device collaboration. Other clients are protected by record revisions; existing single-slot local recovery is not an archive of independent drafts from multiple browser windows.

## Original production deployment (historical)

Deployed on explicit request as **`1787d28d4880-production-mu40us0p`** to
<https://mdbase-reader.pages.dev>. This also includes the Reader saved-view filter.
Deployment URL: <https://54943305.mdbase-reader.pages.dev>.

The live revision, manifest and HTML match the local deployment build on both URLs.
Production entry JavaScript/CSS assets were also verified byte-for-byte. The build
uses `https://connect.mdbase.dev` and loopback port `28485`, with no LAB/staging targets.
This is artifact verification, not authenticated production editing acceptance.

Evidence: `/tmp/reader-shared-editing-production-deploy.log` and
`/tmp/reader-shared-editing-production-verification.json`.
