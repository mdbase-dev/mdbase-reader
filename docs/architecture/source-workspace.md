# Unified Dockview workspace

Status: implemented; supersedes the hand-built two-pane workspace.

## One layout engine

Reader uses **dockview-react 8.3.1** for the entire workspace: document/library/tool
sessions, the library navigator, and the contextual Source tools panel. There is
one Dockview instance, not a dock nested inside independently resized sidebars.
Desktop shell panels use core left/right edge groups. Responsive presentation uses
public native layout restoration with existing panels; see [responsive workspace](../responsive-workspace.md).

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
when available. Source-note tools share live text and an autosave writer. Annotation
tools show committed text in multiple views, with one transferable native textarea
and a one-second serialized autosave writer. Citation forms remain single-owner.

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
workbench notes share live text/save state with the inspector. Annotation comments
keep keystrokes local to one editor; Edit here transfers ownership and its pending
buffer between panes. Citation forms redirect to their existing writable owner.
See [shared editing](../shared-editing.md).

Every exposed close action goes through Reader's guard: tab close buttons,
context menus, pane menus, and command-palette actions. A cancelled dirty close
leaves the complete operation untouched. Pinned tabs are protected from preview
replacement and “close other unpinned tabs.” Reset arrangement moves existing
panels without closing them, reloading renderers, or replacing drafts.

Pending annotation text is held in memory across inspector/workbench views.
Existing edits are keyed by collection/source/annotation; new selections and crop
Blobs are cached by collection/source/exact document target. Existing comments
save after one idle second, without disabling typing; newer text survives older
responses. New annotations still require explicit creation. No new annotation
drafts are written to device storage. Old IndexedDB drafts can be reviewed and
consumed, but are not automatically submitted merely by loading them. Unsaved
close/unload guards remain; crashes or forced reloads can lose uncommitted text.
A document highlight reveals its card; entering editing remains explicit.

## Persistence and migration

Layouts are stored per collection under `mdbase-reader:dockview:v1:<collection>`.
The envelope is version 2; both v1 and v2 envelopes are accepted. Standalone v1
shell groups migrate to edges, retaining a `:before-edges` backup when possible.
Mixed groups keep their placement. Phone sessions save reconciled desktop geometry,
not the temporary mobile group.

Layouts contain Dockview geometry, validated panel descriptors, and Reader navigation
metadata (recent sources, history, and recently closed sessions), not editor text,
dirty flags, authentication data, or downloaded document bytes. Source-note drafts
keep their independent durable store; pending annotation edits remain memory-only.

The first run imports the old `mdbase-reader:workspace:v2:<collection>` layout,
including the selected tabs in both panes. The old entry is left intact for
rollback. Invalid state falls back to the legacy/default workspace, retaining one
`:recovery` copy when storage permits. Missing-source panels are removed before
publishing a restored layout. Storage failures never prevent opening Reader.

## Interaction and mobile

- Pointer-based docking works across tab strips and document content. Dockview
  shields embedded frames during dragging; Reader does not maintain custom drop zones.
- Both side panels can move into reading groups or remain in their desktop edges.
  Native edge-to-grid dragging targets the content center; move-to-pane menus also work.
- Right-click a tab or use the native, keyboard-accessible pane-action popover to
  move/split/merge/maximize. F6 cycles groups, including side panels. Existing
  Reader tab/history shortcuts remain available.
- Reset arrangement is also in the command palette.
- On narrow screens, `fromJSON(..., { reuseExistingPanels: true })` presents one
  native group without replacing editors or iframe Windows. Explicit tab selection
  and Back to workspace navigation replace desktop dragging. Returning to desktop
  restores its arrangement, including tabs opened or closed on mobile.
- Central-pane maximize hides the desktop edge shells and restores their prior
  visibility on exit. Native edge-panel maximize is not supported.
- Floating windows and popouts are deliberately not enabled.
- This integration uses the MIT core. It does not enable paid enterprise modules
  such as Dockview's advanced keyboard docking or layout undo/history.

## Verification

`pnpm --filter @mdbase-reader/app test:browser` runs the isolated, loopback-only
fixture audit. `scripts/audit-dockview.mjs` exercises real pointer gestures,
iframe identity/position, source context, dirty close cancellation, both side
panels, reload, and non-destructive reset. It is not an authenticated production
Connect acceptance test. Unit tests cover descriptor validation, group projection,
identity, preview replacement, tool reuse, renderer residency, edge validation, and
responsive membership reconciliation. `READER_AUDIT_RESPONSIVE_ONLY=1` additionally
checks repeated viewport transitions, draft/editor/iframe retention, sidebar geometry,
mobile closes/reopening, focus transitions, and fresh mobile startup.
