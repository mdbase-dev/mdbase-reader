# Panel workspace

Status: implemented; supersedes the Dockview workspace and the hand-built two-pane one before it.

## One layout engine

Reader uses **`@mdbase-dev/panels`** for the entire workspace: document, library and tool
sessions, the Sources navigator, and the Notes panel. The library is vendored as a
tarball in `vendor/` until it is published; it has no runtime dependencies besides React.

The library owns panes, tab order, active panels, split geometry, resizing, drop
hit-testing, the layout views, undo history, and the serialized layout. Reader owns source
identity, drafts, dirty-close policy, reading history, renderer residency, and source context.

`ReaderPanelWorkspace` (`panel-workspace.ts`) translates application commands into
workspace operations, which are plain data. `useSourceWorkspace` subscribes with
`useSyncExternalStore`. Its `layout` is a **read-only projection** for existing source
commands, never a second layout tree to synchronize back. Pane IDs are opaque strings.

`PanelWorkspace.tsx` renders the library's `Workspace` with Reader's tabs, pane actions
and menus. `panel-workspace.css` maps Reader's theme tokens onto the library's `--mp-*`
custom properties.

## Views of one arrangement

The same arrangement can be shown in five ways, without changing which tabs are where:

- **Columns** (the default for a new workspace): top-level panes keep a readable width
  and the workspace scrolls sideways. Side regions stay pinned while it scrolls.
- **Fit to window**: every pane shares the window.
- **Canvas**: panes sit anywhere, at any size, on an unbounded plane that pans and zooms.
  See [the canvas](#the-canvas).
- **All tabs at once**: every open tab, scaled down, to pick one from.
- **One pane** on narrow screens (below 681px): see [responsive workspace](../responsive-workspace.md).

The first three are a saved setting of the workspace; the last two are presentation only.

## Side regions

A side region is a pane docked to the left or right edge. Sources lives in the left one
and Notes in the right one by default, and that is the only thing special about them: any
tab can be dragged into a side region, Sources and Notes can be dragged into a reading
pane, and a region with no tabs is not drawn.

- The header buttons act on the region. Showing: hide it. Hidden with tabs in it: show it.
  Empty: bring Sources (or Notes) home, moving the tab from wherever it is.
- Closing Sources or Notes while it is alone in its region hides the region and keeps the
  panel loaded. Closing it anywhere else removes the tab; its button brings it back.
- One thing is saved per region: whether the reader wants it (`visible`), with its width.
  Whether it is drawn right now is worked out each time from the room available, the
  hide-while-reading preference, a maximized pane and the phone layout, and is never
  written back. A region that made way returns by itself when the reason goes.
- When the window has room for only one region, the one asked for last stays.
- Hide-while-reading looks at what is on screen, not at focus: the region holding Sources
  makes way while some pane shows a document and none shows the library. Opening it by
  hand shows it until reading starts again.

## Tabs that follow the active document

A source-note or annotations tab can follow the active document (tab menu: "Follow the
active document"). The rule is **unpinned follows, pinned stays**: pinning a following tab
holds it on its current source, and unpinning lets it catch up.

The active document is the library's _leader_: the last focused tab that is not itself a
follower. Working in a following tab, or in a side region, therefore does not change what
is followed. A library tab leads with its selected source. With no leader, a following
tab says so instead of showing a stale source. A following tab with unsaved changes stays
where it is until they are saved. Citation tabs cannot follow, because a citation form
has one writable owner per source; the Notes panel covers that case and follows the same
leader.

## The canvas

Switching to the canvas leaves every pane where it was. A pane is moved by the grip at
the start of its tab strip and resized from its sides and corners; a tab dropped on open
ground gets a pane of its own; "Open beside" places the new pane where it covers nothing.
The wheel pans, Ctrl or Cmd with the wheel (a trackpad pinch) zooms, and the controls in
the corner zoom, return to actual size, or show every pane. Frames and the camera are
saved with the arrangement.

Panes are **live at actual size only**. At any other zoom, and for every pane but the
focused one, the content is covered: a click picks a pane, a double click brings it to
actual size, and the wheel moves the canvas. Renderers and annotation overlays measure
themselves in screen pixels, so they are never asked to work through a scale. A zoom that
reaches 100% settles there. `useDockPanelFocus` forwards a Ctrl/Cmd wheel from inside a
document frame, where the workspace would otherwise never see it.

## Stable sessions, not pane-scoped renderers

Each content panel has a unique `reader:session:…` ID. That ID survives dragging,
splitting, merging, reset, and restoration. Two copies of a document are distinct
sessions. Reopening a closed session reuses its identity when available. Source-note
tools share live text and an autosave writer. Annotation tools show committed text in
multiple views, with one transferable native textarea and a one-second serialized
autosave writer. Citation forms remain single-owner.

A panel's content is mounted once and never moved in the DOM: rearranging panes changes
only its position and size, so an embedded HTML/EPUB iframe is not reloaded. Reader still
owns hydration: unopened documents remain dormant, visited documents have a four-renderer
budget (visible reading panes are protected), and open editors retain their state.
Reading locations are cached by session ID plus immutable file/revision identity.

`useDockPanelFocus` listens to input in same-origin reading frames, including nested
frames, because iframe events do not bubble into the workspace. Without this bridge,
clicking the document in a second pane can leave the inspector and annotation commands
attached to the first source. This observer neither injects scripts nor relaxes document
sandboxing, and disposes listeners when frames or panels disappear.

Renderer contracts, exact-revision file caching, and annotation features remain
independent of the layout engine.

## Source tools and close policy

The Notes panel follows the active document (the leader, above). Focusing or moving
Sources, Notes or a following tab does not replace the source context. Source-bound workbench notes
share live text and save state with the inspector. Annotation comments keep keystrokes
local to one editor; Edit here transfers ownership and its pending buffer between panes.
Citation forms redirect to their existing writable owner.
See [shared editing](../shared-editing.md).

Every exposed close action goes through Reader's guard: tab close buttons, context menus,
pane menus, and command-palette actions. A cancelled dirty close leaves the complete
operation untouched. Pinned tabs are protected from preview replacement and “close other
unpinned tabs.” Reset arrangement moves existing panels without closing them, reloading
renderers, or replacing drafts.

Pending annotation text is held in memory across inspector/workbench views. Existing
edits are keyed by collection/source/annotation; new selections and crop Blobs are cached
by collection/source/exact document target. Existing comments save after one idle second,
without disabling typing; newer text survives older responses. New annotations still
require explicit creation. No new annotation drafts are written to device storage. Old
IndexedDB drafts can be reviewed and consumed, but are not automatically submitted merely
by loading them. Unsaved close/unload guards remain; crashes or forced reloads can lose
uncommitted text. A document highlight reveals its card; entering editing remains explicit.

## Undo

Arrangement changes (moving, splitting, resizing, changing view, reset) can be undone and
redone. Opening and closing tabs, showing or hiding a side region, and moving the canvas
camera are not recorded, so
undo never closes or reopens a tab: tabs opened since are kept, and tabs closed since are
left out of the restored arrangement.

## Persistence

Layouts are stored per collection under `mdbase-reader:panels:v1:<collection>` as a
version 1 envelope: the library's snapshot, plus Reader navigation metadata (recent
sources, history, and recently closed sessions) and the focused panel. They do not hold
editor text, dirty flags, authentication data, or downloaded document bytes. Source-note
drafts keep their independent durable store; pending annotation edits remain memory-only.

Layouts saved by the Dockview workspace (`mdbase-reader:dockview:v1:…`) and the two-pane
workspace before it are not read or migrated. They are left in storage untouched, and the
workspace starts with the library tab. Unknown panel kinds and panels whose source no
longer exists are removed before a restored layout is used. Storage failures never
prevent opening Reader.

## Interaction

- Dragging a tab works across tab strips and document content. A transparent shield
  covers the window during a drag or resize, so an embedded frame cannot take the gesture.
- Right-click a tab, or use the pane-action popover, to move, split, merge or maximize,
  to switch between columns, fit-to-window and the canvas, to show all tabs, and to undo
  or redo an arrangement change. The same commands are in the command palette. F6 cycles
  panes, including side regions. Existing Reader tab and history shortcuts remain available.
- Maximizing a reading pane hides the side regions and restores them on exit.
- Floating windows and popouts are not implemented.

## Verification

`pnpm --filter @mdbase-reader/app test:browser` runs the isolated, loopback-only fixture
audit. `scripts/audit-panel-workspace.mjs` exercises real pointer gestures: moving a tab
to a new pane and dragging one across a document without reloading its frame, resizing,
the columns and fit-to-window views, the overview, undo, reload, a phone-width visit and
reset. `READER_AUDIT_WORKSPACE_ONLY=1` runs only that part, followed by
`scripts/audit-panel-canvas.mjs` (which the full audit does not run): side regions giving
way and coming back, Sources dragged into a pane and brought home, a following note tab,
and the canvas (seeding, zoom, covered panes, moving a pane, a selection toolbar in a moved
pane, reload). They are not an authenticated Connect acceptance test. `panel-workspace.test.ts` covers restoration, identity, preview
replacement, tool reuse, close guards, side regions, following tabs, the canvas, undo and
reset; the library has its own tests, including property tests of its operations.
