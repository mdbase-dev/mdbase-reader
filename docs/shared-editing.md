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

This implementation has **not been deployed**. The production responsive release and the separately committed saved-view filter retain their previously recorded deployment status.
