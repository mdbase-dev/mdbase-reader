# Responsive workspace

How the [panel workspace](architecture/source-workspace.md) adapts to the window. There is
one arrangement; what changes is how much of it is shown.

## Behaviour

- The side regions (Sources on the left and the Notes panels on the right, by default) sit at the
  edges at a fixed width. Splitting or closing reading panes does not change their widths.
- When the reading area would become too narrow for both regions, the one the reader
  asked for last stays and the other makes way; with no such request, Notes goes first,
  then Sources. They return when there is room again; this does not change whether the
  reader has them switched on.
- Below 681px the workspace shows **one pane at a time**, at full width. Sources, a
  document and each Notes panel are separate screens, reached from the mobile navigation. Tab
  dragging and splitters are not offered.
- The desktop arrangement is not rewritten for the phone. Tabs opened or closed at phone
  width are part of the same arrangement, so returning to a wide window shows the panes as
  they were, with those changes. A side region opened only as a phone screen is hidden
  again on the way back. The canvas view is also shown one pane at a time.
- Panel content stays mounted across the change: editors keep their state and document
  frames are not reloaded.
- Maximizing a reading pane hides the side regions; leaving it restores them.

## Persistence

Each side region's width is part of the saved arrangement, and whether the reader wants
it is saved with the window. What is drawn at a given width is never saved, nor is the phone
presentation, so a workspace last used on a phone opens on a desktop with its desktop
arrangement.

## Verification

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
READER_AUDIT_WORKSPACE_ONLY=1 pnpm --filter @mdbase-reader/app test:browser
```

The workspace audit visits phone width, checks that one pane shows and that Sources opens
as its own screen, then returns to desktop and checks that every pane and its document
frame are still there. These are isolated Chromium fixture tests, not physical-phone or
screen-reader verification.
