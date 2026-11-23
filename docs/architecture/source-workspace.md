# Panel workspace

Status: implemented; supersedes the Dockview workspace and the hand-built two-pane one before it.

## One layout engine

Reader uses **`@mdbase-dev/panels`** for the entire workspace: document, library and tool
sessions, the Sources navigator, and the Notes panels. The library is vendored as a
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
and the three Notes panels (Annotations, Source note, Citation) in the right one by
default, and that is the only thing special about them: any tab can be dragged into a side
region, Sources and the Notes panels can be dragged into a reading pane, and a region with
no tabs is not drawn.

- The header buttons act on the region. Showing: hide it. Hidden with tabs in it: show it.
  Empty: bring home the panels that start there. A panel that was closed is added again;
  if none is missing, the ones living elsewhere are moved back.
- Closing a side panel while it is alone in its region hides the region and keeps the
  panel loaded. Closing it anywhere else removes the tab. A header button, the "Show …
  panel" commands or a reset bring it back.
- Side panels sharing a region are narrow tabs without a close button; the tab menu closes
  one.
- One thing is saved per region: whether the reader wants it (`visible`), with its width.
  The width belongs to the arrangement; whether it is wanted belongs to the window (see
  [Persistence](#persistence)). Whether it is drawn right now is worked out each time from the room available, the
  hide-while-reading preference, a maximized pane and the phone layout, and is never
  written back. A region that made way returns by itself when the reason goes.
- When the window has room for only one region, the one asked for last stays.
- Hide-while-reading looks at what is on screen, not at focus: the region holding Sources
  makes way while some pane shows a document and none shows the library. Opening it by
  hand shows it until reading starts again.

## Notes panels and following the active document

The right region starts with three ordinary tabs: **Annotations**, **Source note** and
**Citation**. Each is a panel of kind `notes` holding only its view; it shows that view of
whichever source is being worked on, and names the source at its top. They are not
`WorkspaceTab`s, so they take no part in tab history, close guards or the pane projection,
exactly like Sources.

The source being worked on is the library's _leader_: the last focused panel that leads.
A Notes panel is a _follower_ (`follows` on its descriptor), and Sources is marked as not
leading, so working in them, or moving them, does not change which source they show. A
library tab leads with its selected source. With no leader a Notes panel says so instead
of showing a stale source.

A follower follows one of two things:

- **the active document** (`follows: "leader"`), which is how every Notes panel starts;
- **one pane** (`follows: { pane }`), chosen from the panel's tab menu ("Follow the pane
  showing …"). It then shows the source of the tab leading that pane, whatever the reader
  is working on elsewhere, so two documents side by side can each have their notes beside
  them. Its tab names the source. A pane's leading tab is its tab in front, or the last
  one that was when a Notes panel sits in front of it. When the pane goes, the panel
  follows the active document again; "Follow the active document" in its menu does the
  same, and so does a reset.

Which panel leads and what each follower is about are the library's business
(`subjectOf`). Reader adds only what a library tab's subject is (its selected source).
The Notes panels that follow the active document share one set of loaded tools; one that
follows a pane loads the tools of its own source (`PaneNotes`).

Following is a property of the tab, and the rule is **unpinned follows, pinned stays**:

- **Pin tab** on a Notes panel turns it, in place, into the pinned tab of the source it is
  showing (a `source` tab with `follow: true`). It keeps its id and its place, and from
  then on it is that source's own note, annotations or citation tab.
- **Unpin tab** on such a tab turns it back into a Notes panel.
- **Follow the active document** on any source's note, annotations or citation tab does
  the same for a tab that was opened the ordinary way. The source's document tab, if
  open, takes over as the leader. A tab with unsaved changes stays as it is until they
  are saved.

A source still has one writable editor per record: when a source's own tab is open for
the tool a Notes panel shows, the panel points to that tab instead of opening a second
editor. A Citation panel that has been opened stays mounted while another tab of its pane
is in front, so a form being filled in is not lost.

## Library views as tabs

A library tab shows one view, and any number of library tabs can be open, in one pane or
several.

- Choosing a view in Sources goes to a tab already showing it. Otherwise the library tab
  in use shows it, unless that tab is pinned: then the view gets a tab of its own. A new
  workspace starts with a pinned All sources tab, so the first other view opens beside it.
- Ctrl-click or middle-click on a view always opens a new tab.
- A library tab's own view switcher changes that tab, pinned or not.
- "Open beside" on a library tab opens the same view in a new pane.

Each library tab keeps its own selection, search and mode. The tab in use is the one
whose selected source the Notes panels show.

## The canvas

Switching to the canvas leaves every pane where it was. A pane is moved by the grip at
the start of its tab strip and resized from its sides and corners; a tab dropped on open
ground gets a pane of its own; "Open beside" places the new pane where it covers nothing.
The wheel pans, Ctrl or Cmd with the wheel (a trackpad pinch) zooms, and the controls in
the corner zoom, return to actual size, or show every pane. Frames are saved with
the arrangement, and the camera with the window.

The pane in use is **live at any zoom**. Every other pane is covered: a click picks a
pane, a double click brings it to actual size, and the wheel moves the canvas. A zoom
that reaches 100% settles there. `useDockPanelFocus` forwards a Ctrl/Cmd wheel from inside
a document frame, where the workspace would otherwise never see it.

How a pane is shown at another zoom depends on what is in it (`panelZoom` in
`PanelWorkspace.tsx`, the library's `zoom` prop):

- A **document** draws itself at the zoom (`native`). Renderers and annotation overlays
  measure themselves in screen pixels, so they are never asked to work through a scale:
  the pane is laid out at the size it has on screen, and the document is told the zoom
  through `ReadingTypography.zoom`. A saved page is zoomed as a whole inside its own
  frame, an EPUB sets its text larger or smaller (within Readium's limits, 0.7 to 4 times
  its default size), and a PDF fits its page to the pane as it does anywhere. What Reader
  draws around the document (the PDF viewer's bar, a selection toolbar) keeps its size,
  and behaves as it does in a pane of that width: in a narrow one the selection toolbar
  docks at the foot.
- **Everything else** (the library, Sources, Notes, a source's tool tabs) is drawn through
  the canvas's scale (`scaled`): simply larger or smaller, and usable.

A document is laid out for a new zoom when the zoom gesture settles; during the gesture
it is a picture.

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

The Notes panels show the source being worked on (the leader, above). Focusing or moving
Sources or a Notes panel does not replace the source context. Source-bound workbench notes
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

A workspace is kept in two halves, per collection:

- The **arrangement** (`mdbase-reader:workspace:v2:<collection>`, in `localStorage`): what
  is open and where it sits. Panels, the pane tree, the side regions and their widths,
  the view, and each pane's frame on the canvas. It does not change when the reader only
  looks around.
- The **window state** (`mdbase-reader:workspace:v2:<collection>:window`, in
  `sessionStorage`): how this window is looking at it. The focused pane, the tab in front
  in each pane, the leader, a maximized pane, which side regions are open, where the
  canvas is panned and zoomed to, and Reader's navigation metadata (recent sources,
  history, recently closed sessions). A copy is kept in `localStorage` so that a new
  window starts like the one used last.

Neither holds editor text, dirty flags, authentication data, or downloaded document bytes.
Source-note drafts keep their independent durable store; pending annotation edits remain
memory-only.

Two windows on the same collection **share the arrangement**: a tab opened, moved or
closed in one appears so in the other (through the browser's `storage` event), without
taking focus there or changing the tab in front. A tab with unsaved changes stays open in
its own window when another window closes it. Taking up another window's arrangement
clears this window's undo history. A change made in the 200 ms before another window's
arrangement arrives can be lost to it.

The workspace as it was saved before it had two halves
(`mdbase-reader:panels:v1:<collection>`) is still read when there is no newer one.

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
- Floating windows and popouts are not implemented. A second browser window on the same
  collection shows the whole arrangement (see [Persistence](#persistence)).

## Verification

`pnpm --filter @mdbase-reader/app test:browser` runs the isolated, loopback-only fixture
audit. `scripts/audit-panel-workspace.mjs` exercises real pointer gestures: moving a tab
to a new pane and dragging one across a document without reloading its frame, resizing,
the columns and fit-to-window views, the overview, undo, reload, a phone-width visit and
reset. `READER_AUDIT_WORKSPACE_ONLY=1` runs only that part, followed by
`scripts/audit-panel-canvas.mjs` (which the full audit does not run): side regions giving
way and coming back, Sources dragged into a pane and brought home, library views opened
as tabs, the Notes tabs (following the active document or one pane, pinned to a source,
moved into a pane), the canvas (seeding, zoom, a double click to actual size, moving a
pane, a selection toolbar in a moved pane and in a zoomed one, a PDF and an EPUB at
another zoom, reload), and a second window sharing the arrangement. They are not an authenticated Connect acceptance test. `panel-workspace.test.ts` covers restoration, identity, preview
replacement, tool reuse, close guards, library tabs, side regions, Notes panels and what
they follow, the two halves of what is saved, a second window, the canvas, undo and
reset; the library has its own tests, including property tests of its operations.
