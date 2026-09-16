# Unified Dockview workspace

Status: implemented; supersedes the hand-built two-pane workspace.

## One layout engine

Reader uses **dockview-react 8.3.1** for the entire workspace: document/library/tool
sessions, the library navigator, and the contextual Source tools panel. There is
one Dockview instance, not a dock nested inside independently resized sidebars.

Dockview owns groups, tab order, active panels, split geometry, resizing, drop
hit-testing, overflow, and the serialized layout. Reader owns source identity,
drafts, dirty-close policy, reading history, renderer residency, and source context.

`ReaderDockWorkspace` translates application commands into Dockview API calls.
`useSourceWorkspace` subscribes with `useSyncExternalStore`. Its `layout` is a
**read-only projection** for existing source commands, never a second layout tree
to synchronize back into Dockview. Group IDs are opaque strings; groups are not
limited to `primary` and `secondary`.

The old tab strips, HTML drag transport, split drop targets, resize handles, and
adaptive split-direction hook have been removed, along with the old pane/tab
mutation engine. Only the legacy v2 data schema and persistence parser remain for
migration; migration tests construct old-format fixtures directly.

## Stable sessions, not pane-scoped renderers

Each content panel has a unique `reader:session:…` ID. That ID survives dragging,
splitting, merging, reset, and persisted-layout restoration. Two copies of a
document are distinct sessions. Reopening a closed session reuses its identity
when available. Source-note/citation/annotation tools are reused rather than
creating competing writable editors for the same source and view.

Panels use Dockview's `always` renderer: relocating their groups does not reparent
and reload an embedded HTML/EPUB iframe. Reader still owns hydration: unopened
documents remain dormant, visited documents have a four-renderer budget (visible
reading panes are protected), and open editors retain their state. Reading
locations are cached by session ID plus immutable file/revision identity.

`useDockPanelFocus` listens to input in same-origin reading frames, including
nested frames. Iframe events do not bubble into Dockview. Without this bridge,
clicking the document in a second pane can leave the inspector and annotation
commands attached to the first source. This observer neither injects scripts nor
relaxes document sandboxing, and disposes listeners when frames/panels disappear.

Renderer contracts, exact-revision file caching, and annotation features remain
independent of the docking engine.

## Source tools and close policy

The contextual inspector follows the last focused content session. Focusing or
moving the navigator/inspector does not replace the source context. Source-bound
workbench tools continue to own independent editing sessions; the inspector
recognizes an existing writable tool rather than offering a competing editor.

Every exposed close action goes through Reader's guard: tab close buttons,
context menus, pane menus, and command-palette actions. A cancelled dirty close
leaves the complete operation untouched. Pinned tabs are protected from preview
replacement and “close other unpinned tabs.” Reset arrangement moves existing
panels without closing them, reloading renderers, or replacing drafts.

Annotation drafts are shared across the inspector and source-bound workbench.
Existing edits are keyed by collection/source/annotation; new selections are keyed
by collection/source/exact document target. IndexedDB stores text and crop blobs,
not live surfaces or object URLs. Relevant document and annotation tabs project
this draft state into their close guards. A document highlight reveals its card;
entering the writable editor remains an explicit action.

## Persistence and migration

Layouts are stored per collection under `mdbase-reader:dockview:v1:<collection>`.
They contain Dockview geometry, validated panel descriptors, and Reader navigation
metadata (recent sources, history, and recently closed sessions), not editor text,
dirty flags, authentication data, or downloaded document bytes. Local drafts keep
their existing independent durable store.

The first run imports the old `mdbase-reader:workspace:v2:<collection>` layout,
including the selected tabs in both panes. The old entry is left intact for
rollback. Invalid state falls back to the legacy/default workspace, retaining one
`:recovery` copy when storage permits. Missing-source panels are removed before
publishing a restored layout. Storage failures never prevent opening Reader.

## Interaction and mobile

- Pointer-based docking works across tab strips and document content. Dockview
  shields embedded frames during dragging; Reader does not maintain custom drop zones.
- Both side panels can dock on any edge or join a tab group.
- Right-click a tab or use the native, keyboard-accessible pane-action popover to
  move/split/merge/maximize. F6 cycles groups, including side panels. Existing
  Reader tab/history shortcuts remain available.
- Reset arrangement is also in the command palette.
- On narrow screens, Dockview maximizes the active group instead of squeezing
  desktop columns or maintaining a second mobile tree. Selecting another group
  changes the maximized group. Returning to desktop restores the arrangement.
- Floating windows and popouts are deliberately not enabled.
- This integration uses the MIT core. It does not enable paid enterprise modules
  such as Dockview's advanced keyboard docking or layout undo/history.

## Verification

`pnpm --filter @mdbase-reader/app test:browser` runs the isolated, loopback-only
fixture audit. `scripts/audit-dockview.mjs` exercises real pointer gestures,
iframe identity/position, source context, dirty close cancellation, both side
panels, reload, and non-destructive reset. It is not an authenticated production
Connect acceptance test. Unit tests cover descriptor validation, group projection,
identity, preview replacement, tool reuse, and renderer residency.
