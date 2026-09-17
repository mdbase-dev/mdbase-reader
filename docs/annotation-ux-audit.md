# Annotation UX/UI polish and audit

## Editing follow-up

[Shared editing and autosave](shared-editing.md) records the subsequent deployments
and current editor contract. The latest local redesign returns annotation comments
to explicit Done saves and one transferable native textarea, while retaining shared
autosave for source notes. Creation remains explicit. See that document for the
redesign's deployment status and validation; this audit remains historical evidence.

## Scope

The pre-existing Reader work was checkpointed in `327249f`. This pass builds on the
existing annotation system rather than replacing it. It was subsequently deployed as
`083c05701855-production-mu3mq3ht`. The later active-card stripe removal and
[responsive edge integration](responsive-workspace.md) were subsequently deployed as
`ca73f7765cee-production-mu3t04ql`.

Browser checks use an owned Playwright browser, disposable collection fixtures,
and the real HTML, PDF and EPUB renderers. They do not pair with Connect or write
to a real collection. This is not authenticated production/LAB acceptance.

## Implemented

- **Inspect before editing.** Clicking a saved document highlight selects/reveals
  its annotation without immediately entering the editor or automatically switching
  to a hidden workbench tab. Edit remains explicit. Selected cards are visibly marked.
- **Compact creation.** Selecting text initially shows its quotation, Save highlight,
  and Add a comment; the larger editor is optional. Ctrl/Cmd+S saves from composer
  controls as well as the editor. Escape dismisses, with confirmation for unfinished
  comments. Completion menus retain their own Escape handling.
- **Recoverable drafts.** New selections/comments and existing annotation edits live
  in a shared IndexedDB-backed store. PDF crop blobs are stored as blobs, not expired
  object URLs. Drafts survive source switching, docking, closing/reopening and reload.
  Existing edits show Resume edit; paused new annotations offer Resume unfinished
  annotation. Replacing a commented selection or explicitly discarding an edit asks
  for confirmation. Pending/local-storage failures are distinguished from collection
  saves, and pending writes protect page unload.
- **Safe editor behaviour.** Drafts participate in document/annotation tab dirty-close
  guards. A failed collection save retains the draft. Editors are read-only during
  writes. A changed base body blocks a stale overwrite and tells the user how to keep
  their text. The editor label explains that it edits the authored Markdown quotation
  and comment, not the underlying passage anchor.
- **Browsing.** Source-local search, comment/highlight/area filters, result counts,
  empty-result recovery, document order and newest-first sorting. Document ordering
  uses page/position or numeric CFI order where available; unrelated revisions and
  coordinate bases are not treated as interchangeable. Selecting an annotation hidden
  by filters offers a clear-filters action.
- **Navigation.** Missing/failed destinations produce an explicit error. Clicks made
  before the reading surface is ready are queued instead of silently dropped. Back to
  reading position restores the pre-jump location while that reading surface exists.
  The return point uses a weak reference so it does not keep evicted renderers alive.

## Findings from interactive inspection, fixed in this pass

| Finding                                                          | Change                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Clicking a highlight immediately opened a writable editor        | Separate selected/revealed and editing state                                                        |
| Another selection could erase an unfinished comment              | Durable draft plus explicit replacement confirmation                                                |
| Annotation tabs were not included in dirty-close checks          | Source-scoped annotation draft tracking                                                             |
| PDF crop preview was broken under Strict Mode/remounting         | Create and revoke each preview URL in the same effect lifecycle; verify decoded pixels after reload |
| Clicking a card while the document was loading did nothing       | Queue the destination until the surface is available                                                |
| The card itself was a button containing other buttons            | Semantic annotation group with explicit keyboard-operable actions and a pointer shortcut            |
| Card text/labels sat against or outside the selection stripe     | Stable padding, no negative hover margins, larger readable text                                     |
| Focusing the editor sharply increased its height                 | Stable bounded editor height; mobile action row stays on screen                                     |
| Navigation error text was tiny and transparent over the document | Opaque, larger error notice stacked above the return action                                         |
| Opening the inspector unnecessarily widened the navigator        | Preserve the other standalone sidebar's width when adding a side panel                              |
| Closing mobile source tools could send the user to the navigator | Return to the previously focused reading panel                                                      |
| Raw wikilink file paths appeared as location labels              | Use a human-readable label while retaining the original in its tooltip                              |

## Browser coverage and evidence

Full audit passed with evidence in `/tmp/reader-audit-FyBIXd/`. A final
annotation-only run after the last visual refinements passed in
`/tmp/reader-audit-pE7IOZ/`. Important screenshots include:

- `annotation-compact-highlight.png`, `annotation-selected-not-editing.png`
- `annotation-failed-save.png`, `annotation-docked-edit.png`
- `annotation-linked-delete-warning.png`, `annotation-missing-passage.png`
- `annotation-dark-inspector.png`, `annotation-mobile-edit.png`
- `annotation-pdf-area-draft.png`, `annotation-epub-selection.png`, `annotation-epub-saved.png`

Checks cover keyboard save/retry, Escape, reload recovery, replacement/cancel
confirmation, source switching, promotion/movement/close guards, linked note insertion,
deletion preflight and persistence, search/filter/order, missing-passage handling,
390px layout, and light/dark presentation. PDF coverage includes a real mouse-drawn
crop and image/comment recovery; EPUB coverage includes real mouse selection, saved
highlight decoration and inspector navigation. The existing docking and reading audit
also passes, including 5,000-source pagination and four resident renderers after twenty
visited HTML documents. No unexpected page/console errors were reported; the existing
script-disabled-frame security notices remain separately recorded.

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
# Full reading/docking/annotation audit:
pnpm --filter @mdbase-reader/app test:browser
# Faster annotation-focused loop:
READER_AUDIT_ANNOTATIONS_ONLY=1 pnpm --filter @mdbase-reader/app test:browser
```

## Validation

- Workspace-wide typechecking and tests passed; Reader: **57 test files, 160 tests**,
  plus five deployment-script checks.
- Reader production build and manifest validation passed. Existing large-chunk and
  mixed static/dynamic YAML-import warnings remain.
- Changed-file ESLint/format checks and `git diff --check` passed. This is not a claim
  that unrelated pre-existing repository-wide lint/format failures were repaired.
- Architecture check: 281 production files, 402 relative imports, 15 packages,
  zero warnings. Specification integrity passed.
- Owned browser and Vite processes were stopped. Deployment followed this original
  validation pass, as recorded above.

## Remaining UX/UI opportunities

1. **Sidebar proportions after complex docking.** A long split/move/close sequence can
   allocate too much space to navigation or squeeze the inspector. Reset arrangement
   restores useful proportions. Opening the inspector is now steadier, but general
   structural-layout sizing needs its own focused pass; it is not completely solved.
   The subsequent [responsive edge integration](responsive-workspace.md) fixes the
   measured desktop drift and replaces the old mobile maximize mechanism. Its full
   fixture regressions pass; it is now deployed as `ca73f7765cee-production-mu3t04ql`.
2. **Read-only peek for a hidden annotation workbench.** The inspector still directs
   users to the existing writable owner. A lightweight preview could avoid that extra
   step without creating competing editors.
3. **A compact quotation/comment editor alongside raw Markdown.** The current editor
   honestly exposes both, but a more structured default could make short comments easier.
   Creation still sits at the bottom of the document pane; a selection-anchored desktop
   action bar is another possible refinement, with separate touch placement.
4. **Large annotation collections.** Search is local and useful, but the list still
   renders all matching cards. Virtualization/pagination and sticky reading-position
   context deserve an audit with hundreds of annotations per source.
5. **Touch and assistive-technology acceptance.** Narrow-screen editing and desktop
   keyboard behaviour are covered; physical touch selection handles, mobile keyboards,
   and a screen-reader walkthrough still need hands-on testing.
6. **Recovery/conflict management.** Drafts are device-local, not cross-device sync.
   New-selection recovery is scoped to the original collection/source/file revision;
   changed-revision drafts are not automatically reattached. Cross-window draft merge,
   a draft-management screen, and richer conflict comparison remain future work.

Saved PDF area attachment upload/readback and real Connect conflict/authorization
behaviour were not exercised by these browser fixtures. The area draft recovery test
must not be mistaken for end-to-end attachment acceptance.
