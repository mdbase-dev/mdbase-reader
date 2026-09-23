# Interface shell

This pass simplified Reader's application chrome: fewer stacked headers, one place for each
action, and one stylesheet section for each redesigned component.

## Behaviour

- **Header.** Sidebar toggle, brand, collection name, a quiet connection dot (words appear only
  when offline or syncing), search/commands with the platform's shortcut, a **Display** menu
  (theme and density as explicit choices), and the source-tools toggle. Import moved to the
  library options menu and the command palette.
- **Sources sidebar** (formerly "Library navigator"). A filter field, saved views, and the
  source list with its count and an add button. The duplicated library heading, export button
  and "saved in mdbase" dots were removed. Saved layouts are retitled on load.
- **Library tab.** One header row: view switcher, search with its scope, result count, a filter
  menu (filters, sort, layout, columns, save as view, export, import) and add. Continue reading
  is a single row with progress. The table labels formats in text, shows status with a progress
  bar, hides optional columns that are empty for every visible source, and becomes a two-line
  list in narrow panes. Row checkboxes were removed because no bulk action used them.
- **Source tools.** The duplicate close button is gone (the dock tab, or Back on mobile, closes
  the panel). Annotation search is one row; filter and order sit in a menu, and the count appears
  only while filtering. Cards use readable labels and fall back to the selector quote when the
  body has none.
- **Documents.** The permanent offline status bar is now a corner control; its explanation is in
  the tooltip. Reading-position and highlight failures show beside the document menu instead of
  inside it. Note-only sources open to an empty state whose action opens the source note.
- **Command palette.** Grouped results (open tabs, current source, sources, library, workspace,
  display). An open source is listed once, as its tab. Without a query each group shows a few
  entries; the active row scrolls into view. Shortcuts render as ⌘/⇧ on Apple platforms and
  Ctrl/Shift elsewhere.
- **Menus.** `Menu` and `useDismissableDetails` (`src/Menu.tsx`) close on an outside pointer,
  Escape (returning focus) or after an item runs. Controls that should keep a menu open sit
  inside `[data-menu-keep-open]`.
- **Mobile.** The tab switcher reads as a title with a chevron and tab count; side panels show
  Back.

## Stylesheets

`src/reader-shell.css` loads last and owns the header, menus, Sources sidebar, library tab,
source-tools header and tabs, annotation browsing controls and card labels, document chrome,
empty states, command palette and mobile navigation. Older rules for those components were
removed rather than overridden. Annotation card bodies, editors and the composer body still
live in `reader.css` and `annotation-polish.css`.

Selectors that no source file could match (the pre-Dockview tab strip, split targets, old
menus and the unused `readerMainClass` layout states) were deleted, with `LibraryPane`,
`LibraryLensBar` and `VirtualSourceList`, which nothing imported. The reader stylesheets went
from about 7,500 lines to 5,600, including the new file; `reader.css` alone from 6,795 to 2,907.

Two undefined tokens in the Dockview theme (`--surface`, `--sans`) were replaced, and native
buttons, selects and inputs now inherit the interface font.

## Verification

- `pnpm --filter @mdbase-reader/app test`, typecheck, architecture and specification checks.
- `src/reader-shell.test.tsx` covers shortcut labels, palette grouping and de-duplication,
  empty-column hiding, the quiet connection state and the Display menu.
- `pnpm --filter @mdbase-reader/app test:browser` passes all 37 checks with the audits updated
  for the renamed controls (Display menu, Search and commands, Sources tab, Available offline,
  annotation filter menu).

The fixtures do not exercise a real Connect collection; physical touch and screen-reader
walkthroughs remain outstanding, as in the earlier audits.
