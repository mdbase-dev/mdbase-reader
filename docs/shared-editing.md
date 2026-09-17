# Shared editing and autosave

## Behaviour

- Source notes still autosave after **one second of inactivity**, with shared text and independent CodeMirror selection, cursor, scroll and undo history across panes.
- Annotation comments use a **native textarea and explicit Done save**. Close/Escape retains an unfinished draft; Discard changes asks for confirmation. Ctrl/Cmd+S also commits. Failed saves keep the editor open with Retry; successful commits close it.
- Only one pane edits an annotation at a time. **Edit here** transfers its current buffer to another pane without saving or losing it. Other panes show committed text, not per-keystroke previews. Transfers are blocked while saving or checking/deleting.
- New-highlight comments also use a native textarea and local buffer. Typing does not rerender the workspace on each character. Their explicit Save highlight/area action includes the latest characters even before the checkpoint timer fires.
- New annotations still require explicit creation. Selecting a passage does not silently create a record. Citation forms retain their explicit validated save and single-owner policy.
- Closing a safely stored editing view does not discard text or stop its pending writer. Unstored changes and unfinished new annotations still participate in close protection.

## Implementation

`SourceDraftSession` owns the source-note autosave pipeline. `AnnotationEditSession` owns an annotation's explicit editor lease, latest private buffer, recovery checkpoint and revision-checked commit. It has **no collection autosave timer**. Recovery restores unfinished comments for review rather than submitting them. The first dirty transition is published, but subsequent characters do not notify shared session/draft subscribers. `AnnotationCreationBuffer` similarly isolates new-highlight comment typing. Source-note annotation insertion still uses the source session, draining pending note edits instead of competing with autosave.

For source notes, `SharedTextDocument` supplies synchronous text/subscription access to CodeMirror. Minimal external changes use `Transaction.remote` and `addToHistory: false`. Delayed initial focus is cancelled by subsequent user interaction, so a newly opened editor cannot steal another view's click or keystroke.

`SharedAnnotationResource` publishes query/mutation results to all panes. It deduplicates queries and overlays mutations made during an initial query, including deletion tombstones. Annotation editing mode is local to each list, rather than a global signal that opens/closes every editor.

Source drafts use localStorage; annotation drafts retain their existing IndexedDB storage, including creation-time crop Blobs. These are recovery internals, not a second user-facing document version. Source unload protection outlives the final subscribed view when neither local nor collection storage is safe.

### Batched local checkpoints

Edits update shared memory immediately, but no longer serialize a whole note or start an IndexedDB transaction on every keystroke. Recovery checkpoints run after **500 ms idle**, with a **3-second maximum scheduling delay** during continuous typing. Source-note collection autosave remains independently debounced at one second. The dirty-state subscription for annotation panes reads a boolean rather than rerendering on every global draft-version increment.

Pending checkpoints flush when the last session view detaches, a draft hook unmounts, the page becomes hidden, or pagehide/beforeunload fires; explicit session saves flush before starting collection work. New edits immediately invalidate the local-durability flag. An older IndexedDB completion cannot mark newer text saved. Collection success, deletion, and choosing a remote note version cancel obsolete queued writes. Synchronous unload checkpoints run before the note guard; unfinished IndexedDB writes and storage failures still prevent silent unload.

This deliberately introduces a small crash-recovery window: a hard process/device failure can lose text entered since the latest completed checkpoint. Three seconds is the foreground timer bound, not a guarantee against main-thread stalls, timer throttling, or delayed/failed storage. Normal lifecycle flushing does not guarantee asynchronous storage will finish if the process is forcibly killed.

Validation: Reader **66 files / 205 tests**, typecheck, build, changed-file lint/format, architecture and specification checks passed. Tests cover a 120 KB note burst (20 changes, one checkpoint), continuous typing (60 changes over six seconds, two checkpoints), IndexedDB completion races, obsolete-checkpoint cancellation, remote-choice cleanup of an older stored note, storage failures, and unload guards. The shared-editor browser fixture additionally counts real storage calls during browser keystrokes: immediate two-pane text and one write after the burst (`/tmp/reader-audit-tfAdzG`). The full browser fixture audit passed (`/tmp/reader-audit-2qy538`). These checks are not authenticated production acceptance or proof that all perceived typing lag is resolved.

Deployed on user approval as **`87e4c05c9901-production-mu4rpd5i`** to **https://mdbase-reader.pages.dev**, deployment **https://0a07b7de.mdbase-reader.pages.dev**. Live build revision, manifest, HTML, entry JS/CSS and runtime preload match the local production artifacts byte-for-byte on both origins; production Connect/loopback endpoints and the 500/3000 ms checkpoint constants were verified. Before deployment, the previous live entry source map matched the checkout's unrelated import/application-session source changes; that already-deployed work was preserved, not reverted. Evidence: `/tmp/reader-checkpoint-production-deploy.log` and `/tmp/reader-checkpoint-production-verification.json`. The user still reported lag after testing this release; it contains no annotation-editor redesign.

Known old record revisions cannot replace newer session state. Source writes refresh before saving; failed annotation writes can fetch the current record and offer a revision-checked conflict choice without a page reload. Deletion checks acquire an owner-specific session lock, pause all editors, and drain an outstanding write. Closing the checking view releases its lock; an already committed deletion request retains the lock until it completes.

Dockview still exclusively owns layout. Editor bodies and recovery state are not serialized into its layout envelope.

## Annotation editor redesign — not deployed yet

The Behaviour section above describes the redesigned implementation, not the currently deployed checkpoint-only release. `AnnotationTextArea` replaces CodeMirror for creation and existing comments. The editor component holds typing state locally; session/recovery state changes only at dirty, checkpoint, ownership, conflict and commit boundaries. The staged recovery snapshot is not the authoritative latest buffer: save, close/transfer and lifecycle flushes read the editor/creation buffer. Async IndexedDB writes still require the unload guard; forcing through its warning can lose pending text.

Validation: **68 Reader test files / 210 tests**. Real storage tests verify 40 rapid changes cause one shared dirty notification, unloading checkpoints the final text, and recovered comments never autosave. The browser fixture counts zero annotation PUTs during typing, exactly one per explicit attempt, and verifies failed-save retry, transferable single-editor ownership, close/reload recovery, confirmed discard, conflict choice and mobile textarea identity (`/tmp/reader-audit-AaAyyz`). Cross-format/annotation audit passed (`/tmp/reader-audit-ryykCB`); full fixture audit passed (`/tmp/reader-audit-EpGutk`). Typecheck/build, changed-file lint/format, architecture and specification checks passed. Recovery tests also cover typing again while an older IndexedDB checkpoint is in flight: its completion cannot mark the newer buffer durable. These are fixture checks, not authenticated production acceptance or proof of resolved physical-device lag.

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

## Production deployment

Deployed on explicit request as **`1787d28d4880-production-mu40us0p`** to
<https://mdbase-reader.pages.dev>. This also includes the Reader saved-view filter.
Deployment URL: <https://54943305.mdbase-reader.pages.dev>.

The live revision, manifest and HTML match the local deployment build on both URLs.
Production entry JavaScript/CSS assets were also verified byte-for-byte. The build
uses `https://connect.mdbase.dev` and loopback port `28485`, with no LAB/staging targets.
This is artifact verification, not authenticated production editing acceptance.

Evidence: `/tmp/reader-shared-editing-production-deploy.log` and
`/tmp/reader-shared-editing-production-verification.json`.
