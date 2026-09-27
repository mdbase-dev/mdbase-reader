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

## Reading and editing (second pass)

- **Highlight card beside the selection.** Text selections carry an optional `anchor`
  (`ViewportRect` in `@mdbase-reader/reading-surface`), filled by the HTML and EPUB renderers
  from the selected range. PDF text and area selections fall back to where the pointer was
  released. `useSelectionAnchor` keeps an anchor only for the selection just made and drops it
  when the document moves, so resumed drafts and scrolled pages dock at the bottom as before.
  Panes narrower than 520px always dock, leaving room for native selection handles.
- **Contents.** An optional `contents` capability lists a document's sections: Readium's table
  of contents for EPUB, and `h1`–`h3` headings for saved web pages with more than one heading.
  The document toolbar shows a Contents menu when it exists. PDFs keep EmbedPDF's own outline.
- **Reading status in the library.** The Status column is an inline control when the gateway
  implements `saveReadingStatus`. Connect writes `reading.status`, sets `finished_at` (and a
  missing `started_at`) on finishing, and clears `finished_at` when a source is reopened. The library table prefers the library's copy of each source, so changes appear
  at once.
- **Keyboard.** `/` focuses the search of a focused library tab, otherwise the Sources filter.
  Arrow keys and j/k move between library rows; Enter opens.
- **Adding sources.** Drop a PDF, EPUB or saved page anywhere in Reader, or on the add dialog.
  The dialog pastes a link and saves it in one row, and closes on an outside click.
- **Source note.** One toolbar: formatting, a quiet save state, and an Insert menu for the
  citation and the source's annotations. Annotation and note editors both say "Saved".
- **Citation editor.** The panel no longer overflows its column, short fields share rows,
  labels use the interface type scale, and Save is a compact primary button.
- **Import pages and sign-in.** Steps are numbered by what is shown, the folder picker is
  styled, connection states read as sentences, the landing page no longer reports Connect
  errors, and the sign-in screen states an error once.
- `--sans`, `--serif` and `--surface` were referenced but never defined, which silently
  discarded several `font` declarations. They are now defined in `reader-shell.css`.

## Reading workspace (third pass)

- **Reading comes first.** Opening a document hides the Sources sidebar, and returning to a
  library tab restores it, but only when Reader hid it (Display → _Sidebar while reading_
  turns this off). Focus mode is now **Reading mode**: a header button and `mod+.`, with the
  tab strip fading alongside the header. `mod+\` toggles the sidebar and `mod+shift+\` the
  notes panel. A side panel alone in its group has no close button, and its pane menu appears
  on hover.
- **Shortcuts from inside a document.** Once the reader clicks into a saved page or an EPUB,
  key events stay in its frame. `forwardApplicationShortcut` (`reading-surface/keyboard.ts`)
  forwards modifier shortcuts, Escape, F6, `/` and Alt+arrows to Reader, leaving the page's
  clipboard and editing keys alone. The HTML renderer attaches it to its frame; the EPUB
  renderer to every Readium frame as it appears (`epub-frames.ts`).
- **Text settings.** The `typography` surface capability (`ReadingTypography`: scale, measure,
  face) is implemented by the HTML renderer (an injected stylesheet) and the EPUB renderer
  (Readium preferences). PDFs keep their layout. The Display menu sets text size, line length
  and typeface, stored with the other shell preferences.
- **Highlights and cards.** Saved pages and EPUBs draw a margin marker beside each highlight,
  darker when it carries a note; clicking one selects its card. Both use `MarginMarkers`
  (`reading-surface`), which locates the quotation with `locateTextQuote`, places the bar beside
  the passage's own block (so paginated columns work), and measures its own origin and scale
  (Readium zooms the book's body). Readium's template decorations were not used: they render in
  a shadow root that template stylesheets cannot reach, and are offset by the book's zoom. PDFs
  get a thin filled EmbedPDF annotation left of each text highlight, carrying the highlight's
  annotation id so selecting it opens the same card. The selected card and the active passage
  share one gold tint. Cards no longer say "Unanchored note" or "No passage anchor". A card
  without a passage selector shows its location label and omits _Show in document_.
- **Sidebar.** The filter searches the whole library. Without a query the sidebar lists views,
  open sources and up to eight recent ones (by `reading.last_opened_at`, then sources marked
  _reading_), and ends with _Add source_. The full list lives in the library tab.
- **Library.** Default columns are Title (with creator beneath), Published, Annotations, Last
  opened and Status. Annotation counts come from the connector's annotation index
  (`annotationCountsBySource`), corrected by the selected source's loaded annotations. They
  are not stored, so saved views leave the column out of `select`. Views can sort by
  _Recently opened_. Continue reading shows up to three sources, as a swipeable row on phones.
  The search reads "… in Sources".
- **Wording.** The right panel is **Notes**. The collection name in the header has its own
  icon rather than a breadcrumb slash. The command palette gives open commands a Shift+Enter
  _Open beside_ variant (replacing the separate "beside" commands), shows more shortcuts and
  lists its keys in a footer.
- **Mobile.** A lone library tab has no tab switcher above it, and library tabs have no close
  button.
- **Preview.** `?preview=1` renders Gravity and Grace through the real HTML renderer, so
  selection, highlights, margin markers and typography can be tried there.

## Library views (fourth pass)

- **Virtualized, not paged.** The table renders only the rows in view (TanStack Virtual), against
  the library's own scroller, so Continue reading scrolls away above it. `aria-rowcount` is the
  full total and each row carries `aria-rowindex`. Cards are virtualized a row at a time at a
  fixed card height. Each view keeps its scroll position across tab switches.
- **Columns.** Headers sort on click (again to reverse) and carry a menu: sort, move left or
  right, reset width, hide. Drag a header's label to reorder; drag its right edge to resize, or
  focus that edge and use the arrow keys (Shift for larger steps). The trailing **+** adds a
  Reader field, a property found in the collection, or any dotted frontmatter path
  (`course`, `csl.volume`). Empty columns are no longer hidden automatically.
- **Property columns** (`property:<key>`) read `SourceSummary.properties`, which the Connect
  listing now keeps from each record's frontmatter. A saved view's selected values take
  precedence. Values are formatted for reading: wikilinks show their alias, and lists are
  comma-separated. Numbers sort numerically.
- **Where layout lives.** Columns, widths (`columnWidths`), sort and presentation are remembered
  on the device per view (`use-library-layout-draft.ts`) and take effect at once. _Save view_
  writes them into the view file's presentation options, and a newer save discards the local
  draft. The built-in _All sources_ view keeps its layout on the device. _Reset columns and
  layout_ returns to the view's saved layout. Filters stay session state.
- **Touch.** A long press on a row or card selects it and enters touch selection: taps then
  toggle rows (a quick second tap does not open), the toolbar shows from one selected source,
  and the mode ends when nothing is selected. Moving the finger cancels the press, so scrolling
  never selects.
- **Selection.** Click selects; Shift extends; Ctrl/⌘ toggles; double-click or Enter opens
  (Ctrl/⌘+Enter beside). In the grid, arrows, j/k, Page and Home/End move focus (Shift extends
  the range), Space toggles, Ctrl/⌘+A selects all, and Escape keeps only the focused row. The
  sidebar keeps click-to-preview. With two or more selected, a toolbar offers _Set status…_
  (written four at a time with progress), _Open_ (up to 12) and _Export citations_ for the
  selection.
- **Filter on any field.** The filter menu's _Fields_ section adds conditions on any dotted
  frontmatter path: is, is not, contains, less/greater than, at most/least, empty, not empty.
  Field names are suggested from the collection, and values from that field's commonest values.
  Wikilinks match by alias or last path segment, lists by any item, and text ignores case.
  Saved views write the same conditions into their `where` (`conditionToCel`). mdbase's CEL
  has no `type()`, `string()`, `int()` or case folding, so Reader decides list versus scalar
  from the library's values, matches text with `(?i)` RE2 patterns, and compares numbers only
  with numbers. The live filter follows the same rules, so a draft and its saved view agree:
  checked against mdbase on the 1,486-source test collection, all 12 sampled conditions
  returned identical counts.
- **Editing fields.** On the single selected row, clicking a property cell (or F2 on the focused
  row) edits it in place. Enter or leaving the cell saves, Escape cancels, and an empty value
  removes the field. With several sources selected, _Set field…_ sets one field on all of them.
  Edits keep the field's kind: lists split on commas, numbers and booleans stay so, and links
  are edited as written. Writes use the existing `records.edit` capability: the source
  repository's `updateFields` reads the record, merges dotted paths into its objects, and
  patches with its revision. `id`, `type`, `documents` and the whole `csl` and `reading`
  objects are not editable (`isEditableSourceField`); nested values inside them are.
- **Annotations view.** The library's _Sources / Annotations_ switch lists every annotation in
  the collection, with its passage, source, type, tags and place. Search covers quotes, notes,
  source titles, creators and tags; the filter menu narrows by type, tag, and field conditions
  on the annotation's source (the same conditions as the Sources view). Enter or double-click
  opens the annotation in its document, reusing a tab already showing it; Ctrl/⌘+Enter opens it
  beside. _Copy as Markdown_ copies the selection grouped by source, as blockquotes with a
  wikilink back to each record. `AnnotationRepository.listAll` lists paths with a
  contract query limited to `reader-annotation`, then reads each record with the bulk read
  concurrency: semantic contract views reject `includeBody` and every field but `types`,
  `timezone`, pagination, `frontmatterMode` and `contract`. Nothing is written from this view.
- **Annotation columns.** The annotations table has the sources table's columns: headers sort
  (Created, Source, Type), resize by drag or arrow keys, move, hide, and come back from the add
  menu (`annotation-columns.ts`). Columns, widths and sort are remembered per view on this
  device until saved (`use-layout-draft.ts`, shared with the sources table).
- **Saved annotation views.** _Save as new view…_ writes an ordinary mdbase view record with
  `query.types: [reader-annotation]` and `readerViewKind: annotations` in Reader's presentation
  options (`mdbase-annotation-views.ts`). Conditions on the source are written through the
  annotation's `source` link, e.g. `source.asFile() != null && source.asFile().course…`, using
  the links profile's `asFile()`; sorting by source orders by a `source_title` projection. So
  Obsidian, the CLI and agents run the same view. Opening a saved view runs it through mdbase
  (`executeAnnotationView`) until its filter changes, then Reader filters locally; if mdbase
  cannot run it, Reader filters locally and says so. On the 1,486-source test collection, 13
  filters (scalar, list, nested, hyphenated and numeric fields, `is-not`, empty, and type with a
  source condition) selected identical annotations locally and in mdbase.
- **"Annotations for this source".** The annotations view options can add one view record whose
  named view binds `this` to a `reader-source` (`on_missing: error`) and selects
  `source.asFile().file.path == this.file.path`. It is for other tools, where it runs against a
  source note; Reader does not list it as a library view.
- TanStack Table v9 is used headlessly for column sizing and resizing only
  (`use-table-columns.ts`, shared by both tables; `TableHeadRow.tsx` renders either header).
  Filtering and sorting remain Reader's own (`applyLibraryViewConfiguration`,
  `sortAnnotationEntries`), matching each saved view's `order_by`.

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
- `src/reader-delight.test.ts`, `packages/connect/src/reading-status.test.ts` and
  `packages/renderer-html/src/html-surface.test.ts` cover composer placement, dropped file types,
  reading-status transitions and contents availability.
- `pnpm --filter @mdbase-reader/app test:browser` passes all 37 checks with the audits updated
  for the renamed controls (Display menu, Search and commands, Sources tab, Available offline,
  annotation filter menu).

- Third pass: `READER_AUDIT_READING_ONLY=1 pnpm --filter @mdbase-reader/app test:browser` runs
  `scripts/audit-reading-workspace.mjs` (sidebar hiding and restoring, typography, reading
  mode and panel shortcuts from inside the page, margin markers, annotation counts). The other
  audits pin _Sidebar while reading_ to _Keep open_, because they test docking with the
  sidebar present.

- `pnpm --filter @mdbase-reader/app test:a11y` runs axe-core over the preview's library, bulk
  selection, add-column menu, reading view with Notes, command palette and phone library, and
  fails on any violation except Dockview's unnamed inactive pane region (`landmark-unique`).
  The pass that added it fixed: `aria-controls` pointing at an unmounted panel, two low-contrast
  labels, `role="group"` on annotation `<article>`s, and a close button nested in each tab
  (tabs now close by Delete, their context menu or a pointer-only icon).

The fixtures do not exercise a real Connect collection; physical touch and screen-reader
walkthroughs remain outstanding, as in the earlier audits.
