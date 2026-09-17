# Shared editing and autosave

## Behaviour

- Source notes and existing annotation comments save after **one second of inactivity**. Routine editing does not require Save/Cancel; annotation editors stay open after saving and have a **Done** action.
- The inspector and multiple workbench panes can edit the same record. The tab menu offers **Open another editor in pane right** for notes and annotations.
- Text and save/conflict state are shared; each CodeMirror view retains its own selection, cursor, scroll, and local undo history. Remote changes are mapped through that history rather than added as another local undo action.
- New annotations still require explicit creation. Selecting a passage does not silently create a record. Citation forms retain their explicit validated save and single-owner policy.
- Closing a safely stored editing view does not discard text or stop its pending writer. Unstored changes and unfinished new annotations still participate in close protection.

## Implementation

`SourceDraftSession` and `AnnotationEditSession` each own one debounce and serialized write pipeline per record within a connected Reader window. Safe local recovery resumes when the relevant record/view mounts; annotation recovery does not require clicking Edit. Source-note annotation insertion also uses the source session, draining pending edits instead of competing with autosave.

`SharedTextDocument` supplies synchronous text/subscription access to CodeMirror. Minimal external changes use `Transaction.remote` and `addToHistory: false`. Delayed initial focus is cancelled by subsequent user interaction, so a newly opened editor cannot steal another view's click or keystroke.

`SharedAnnotationResource` publishes query/mutation results to all panes. It deduplicates queries and overlays mutations made during an initial query, including deletion tombstones. Annotation editing mode is local to each list, rather than a global signal that opens/closes every editor.

Source drafts use localStorage; annotation drafts retain their existing IndexedDB storage, including creation-time crop Blobs. These are recovery internals, not a second user-facing document version. Source unload protection outlives the final subscribed view when neither local nor collection storage is safe.

### Batched local checkpoints

Edits update shared memory immediately, but no longer serialize a whole note or start an IndexedDB transaction on every keystroke. Recovery checkpoints run after **500 ms idle**, with a **3-second maximum scheduling delay** during continuous typing. Collection autosave remains independently debounced at one second. The dirty-state subscription for annotation panes reads a boolean rather than rerendering on every global draft-version increment.

Pending checkpoints flush when the last session view detaches, a draft hook unmounts, the page becomes hidden, or pagehide/beforeunload fires; explicit session saves flush before starting collection work. New edits immediately invalidate the local-durability flag. An older IndexedDB completion cannot mark newer text saved. Collection success, deletion, and choosing a remote note version cancel obsolete queued writes. Synchronous unload checkpoints run before the note guard; unfinished IndexedDB writes and storage failures still prevent silent unload.

This deliberately introduces a small crash-recovery window: a hard process/device failure can lose text entered since the latest completed checkpoint. Three seconds is the foreground timer bound, not a guarantee against main-thread stalls, timer throttling, or delayed/failed storage. Normal lifecycle flushing does not guarantee asynchronous storage will finish if the process is forcibly killed.

Validation: Reader **66 files / 205 tests**, typecheck, build, changed-file lint/format, architecture and specification checks passed. Tests cover a 120 KB note burst (20 changes, one checkpoint), continuous typing (60 changes over six seconds, two checkpoints), IndexedDB completion races, obsolete-checkpoint cancellation, remote-choice cleanup of an older stored note, storage failures, and unload guards. The shared-editor browser fixture additionally counts real storage calls during browser keystrokes: immediate two-pane text and one write after the burst (`/tmp/reader-audit-tfAdzG`). The full browser fixture audit passed (`/tmp/reader-audit-2qy538`). These checks are not authenticated production acceptance or proof that all perceived typing lag is resolved.

Deployed on user approval as **`87e4c05c9901-production-mu4rpd5i`** to **https://mdbase-reader.pages.dev**, deployment **https://0a07b7de.mdbase-reader.pages.dev**. Live build revision, manifest, HTML, entry JS/CSS and runtime preload match the local production artifacts byte-for-byte on both origins; production Connect/loopback endpoints and the 500/3000 ms checkpoint constants were verified. Before deployment, the previous live entry source map matched the checkout's unrelated import/application-session source changes; that already-deployed work was preserved, not reverted. Evidence: `/tmp/reader-checkpoint-production-deploy.log` and `/tmp/reader-checkpoint-production-verification.json`. User live acceptance is pending; no annotation-editor redesign is included.

Known old record revisions cannot replace newer session state. Source writes refresh before saving; failed annotation writes can fetch the current record and offer a revision-checked conflict choice without a page reload. Deletion checks acquire an owner-specific session lock, pause all editors, and drain an outstanding write. Closing the checking view releases its lock; an already committed deletion request retains the lock until it completes.

Dockview still exclusively owns layout. Editor bodies and recovery state are not serialized into its layout envelope.

## Validation

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
