# Source workspace: cross-format tabs and pane-ready sessions

Status: accepted and implemented for the single-pane Reader workspace

## Decision

Reader owns tabs and panes. PDF, EPUB, and HTML renderers do not own application
navigation, even when a renderer offers its own document tabs.

The workspace layout is a renderer-neutral value containing:

- ordered panes and one focused pane;
- ordered source IDs in each pane;
- one active source ID per pane.

The initial UI renders only the primary pane. The model already supports
independent pane tab sets and focus, so adding a split does not change document
identity, selection, annotations, or renderer contracts.

## Session lifecycle

Opening a library source adds it to the focused pane and activates it. Switching
tabs changes only the active source. Every open source session remains mounted
until its tab closes; inactive sessions are visually hidden and removed from the
accessibility tree. This preserves renderer state such as page position, EPUB
location, search state, and parsed document data.

Closing the active tab selects the source that took its place, or the previous
source when closing the final tab in the order. Closing the only tab leaves the
pane present and empty. A pane is therefore a durable workspace region, not a
side effect of whichever renderer happens to be mounted.

## File caching

The Connect document adapter keys cached object URLs by immutable file ID and
content digest. Closed handles remain in a bounded least-recently-used cache,
while open handles are leased and cannot be evicted. Reopening an unchanged
source therefore avoids another file download. A changed digest always produces
a distinct cache entry and retains the exact-revision safety check.

This cache is renderer-independent and benefits PDF, EPUB, and HTML. Renderer
instances provide a second, session-level warm layer while their tabs remain
open.

## Boundaries

- `source-workspace-layout.ts` is pure application state and imports only core
  domain identities.
- React coordination belongs in `use-source-workspace.ts`.
- `ConnectedDocument.tsx` is the sole application integration point for
  renderer packages.
- renderers expose only the shared `ReadingSurface` contract upward.
- the Connect adapter owns discovery, exact-revision checks, bytes, and object
  URL lifetime; it does not know about tabs or panes.

ESLint enforces the renderer boundary and prevents framework or adapter imports
from entering the pure workspace layout model.

## Future panes

A split-pane UI can render each `SourceWorkspacePane` as a document-session deck.
Pane focus determines which surface drives the inspector and global commands.
Opening a source may target the focused pane or a chosen pane. Dragging a tab is
an ordered source-ID move between panes. No PDF-specific tab migration is
required, and mixed PDF/EPUB/HTML panes remain coherent.
