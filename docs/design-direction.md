# Design direction

Status: proposal for discussion. Nothing here is implemented. Terms follow the
[UI glossary](ui-glossary.md). Mockups, each showing the current UI beside the proposal in
light and dark: [Notes panel](design/mockups/notes-panel.html),
[library](design/mockups/library.html), [citation](design/mockups/citation.html),
[selection toolbar](design/mockups/selection-toolbar.html).

## Diagnosis

Based on `?preview=1` captures at 1440×900 and 390×844, in both themes.

- **The brand typeface never loads.** `reader-shell.css` sets `--sans: "Atkinson Hyperlegible"`
  (the old family) after `@mdbase-dev/ui`, which loads only _Atkinson Hyperlegible Next_. The UI
  falls back to Segoe UI, or Arial/Liberation Sans on Linux. `reader.css:1345` repeats the old
  name. Much of the "utilitarian" feel comes from a generic grotesque at 11–13px.
- **One plane, one temperature.** Header, Sources sidebar, library, document and Notes panel all
  use the same cool off-white (`oklch(99.5% 0.002 255)`) and are told apart only by 1px rules.
  Nothing recedes, so the screen reads as a grid of cells.
- **The Notes panel leads with controls.** Before the first card come a title row, tabs, Comment
  and Bookmark, the search, a page-search checkbox with its own helper line, and a "Near reading
  position … Pause following" bar. In the capture, the first quotation starts 480px below the top
  of the panel. Every card repeats a 10px "Owner:" link to the source that is already open, plus
  "Chapter XI". "Near reading position" appears twice. Quotations are set in the same 13.5px grey
  sans as comments.
- **Weight is spent everywhere.** Titles, column headers, card labels and pane titles are all
  bold. Boxed monospace PDF/WEB/EPUB badges compete with titles. The type scale (11/12/13/15)
  has no step large enough to anchor a page.
- **Continue reading is a text box.** Title, author and a percentage. There is no sense of the
  object, where you were, or how far through you are.
- **The citation comes after its controls.** Ready, a count, a truncated key, Details/CSL-JSON,
  Style and Locale all come before a 12.5px reference. There are three ways in (Add to citation,
  Find citation details, the form with Save changes), and the field evidence is always visible.
- **Selection and highlight popovers.** Colour cannot be chosen. Highlight and Comment carry
  equal weight. Nothing points the toolbar at its passage, and in the capture it sits on the
  highlight above. The highlight popover shows a 10px "Owner:" link that is wider than its
  actions.
- **Document chrome stacks up.** A PDF has a tab strip, a source bar reading "Saved document ·
  original headings below are unchanged" (wrong for a PDF), and the viewer toolbar. In light
  theme the page edge barely separates from the canvas.
- **Copy drift.** The note-only empty state still says "literature note" and "Source panel".

Worth keeping: reading mode, the margin markers, the shared tint between the selected card and
its passage, the phone bottom navigation, and the grouped command palette.

## Principles

1. **Content over chrome.** Quotations, citations and pages get the best type and the most room.
   Chrome uses smaller, quieter type and sits on a recessed plane.
2. **Controls appear when needed.** Show one way forward. Everything else waits behind hover,
   focus, selection or a menu, and stays reachable by keyboard and touch.
3. **Clear hierarchy.** Three weights at most per view. Size and colour carry hierarchy before
   boldness does.
4. **Generous but efficient.** Use a 4px grid. Rows are 32px for chrome, 56px for library rows
   and cards. Leave space around the content rather than between controls.
5. **Quiet colour, one accent.** Use warm neutrals. The ink blue accent is reserved for the
   primary action, current location and focus. Highlight colours belong to the user's marks.
6. **Motion explains.** Motion only shows where something came from or went. 120–260ms,
   ease-out, no bounce, and none under `prefers-reduced-motion`.

## Tokens

The values are set out in each mockup's `.p` block. They extend `@mdbase-dev/ui` roles rather
than replacing them, so the short aliases (`--ink`, `--muted`, `--line`) can be remapped.

**Type.** The UI uses Atkinson Hyperlegible Next. The reading face is a serif stack (`"Iowan Old
Style", Charter, "Source Serif 4", "Noto Serif", Georgia, serif`) for quotations, citations and
last passages. Azeret Mono is kept for citation keys and shortcuts.

| Token        | Size/line | Use                                     |
| ------------ | --------- | --------------------------------------- |
| `text-xs`    | 12/16     | metadata, captions, column headers      |
| `text-sm`    | 13/18     | controls, menus, secondary text         |
| `text-md`    | 14/20     | list titles, comments, body UI          |
| `text-lg`    | 16/24     | section titles, empty-state headings    |
| `text-xl`    | 20/28     | pane titles ("All sources")             |
| `text-2xl`   | 28/34     | first-run and import headings           |
| `text-quote` | 15/1.6    | quotations and citations (reading face) |

Weights are 400, 520 and 650. Nothing goes below 12px.

**Space.** 2, 4, 8, 12, 16, 20, 24, 32, 48. **Radii.** 4 (keys, swatches), 6 (menu items), 8
(buttons, fields), 12 (cards, popovers, panes), 16 (dialogs, sheets), full (chips).

**Elevation.** `e-1` for cards and the lifted pane, `e-2` for menus, popovers and toolbars,
`e-3` for dialogs and the command palette. In dark theme the shadows deepen and each gains a 6–7%
white ring.

**Colour roles.**

| Role                          | Light                   | Dark                   |
| ----------------------------- | ----------------------- | ---------------------- |
| `bg-canvas` (chrome plane)    | `oklch(96.9% .006 80)`  | `oklch(16.5% .006 70)` |
| `bg-surface` (panes)          | `oklch(99.1% .004 85)`  | `oklch(19.5% .006 70)` |
| `bg-raised` (popovers)        | `oklch(100% 0 0)`       | `oklch(25.5% .008 70)` |
| `bg-sunken` (fields)          | `oklch(95.6% .007 80)`  | `oklch(16% .005 70)`   |
| `text-1 / text-2 / text-3`    | 24% / 44% / 52% L       | 92.5% / 76% / 66% L    |
| `line / line-strong`          | 91.5% / 84% L           | 29% / 37% L            |
| `accent` (ink blue, hue 250)  | `oklch(47% .115 250)`   | `oklch(77% .1 245)`    |
| `accent-soft` (selected rows) | `oklch(94.6% .024 250)` | `oklch(31% .05 250)`   |

`text-3` is the faintest colour allowed for text. It measures 5.4:1 (light) and 5.9:1 (dark) on
`bg-surface`, and at least 4.9:1 on every neutral background. On `accent-soft` (dark) it falls to
4.2:1, so selected rows lift secondary text to `text-2`. `line` and `line-strong` are for
separators only. `line-control` (light 64% L, dark 56% L, at least 3:1) is for borders that alone
identify a control: radio rings, checkbox boxes and switch tracks. Status colours are `success`,
`warning-text`/`warning-soft` and `danger`.

**Highlights.** There are five, named rather than numbered: yellow (the default), green, blue,
pink and purple. Each has a _wash_ behind text (light: L 90–92%, low chroma; dark: L 38–41%) and
an _ink_ for margin bars and swatches (light: L 56–76%; dark: L 73–83%). Body text keeps at least
7:1 against every wash (12:1 or more in light). Light yellow ink is only 2.1:1 against the
surface, so swatches always carry an inner ring and a name, and margin markers only supplement
the wash rather than standing in for it. Mixing a wash with a surface uses `color-mix(in srgb, …)`, because OKLCH
interpolation drifts blue towards green. PDF pages keep their own paper in dark theme and use the
light washes.

**Focus ring.** `0 0 0 2px bg-surface, 0 0 0 4px accent` on `:focus-visible` only. It is never
removed, and in forced-colours mode it becomes `outline: 2px solid Highlight`.

## Components

- **Buttons.** _Primary_ (accent fill) appears at most once per surface: Add source…, Fix
  details, Save details. _Secondary_ has a hairline border; _quiet_ has none until hover. All are
  32px tall with 13px medium labels.
- **Icon buttons.** 32×32, or 44×44 under `(pointer: coarse)`, named exactly as their tooltip.
  Only conventional meanings go icon-only (more, close, search, filter, copy).
- **Fields.** Sunken fill and hairline border, with the ring on the container. Scope goes in the
  placeholder, not a second control, and a `/` hint shows where the shortcut applies.
- **Cards.** No box at rest; a 12px-radius tint on hover. The selected card takes its passage’s
  wash. Library cards are lifted (`e-1`).
- **Menus and popovers.** `bg-raised`, `e-2`, 12px radius, 32px items, 12px section labels.
  Popovers that belong to text get a caret.
- **Dialogs.** 16px radius, `e-3`, a 30–45% scrim, and one primary action at the bottom right.
- **Tabs.** Text labels (no icon-only tabs), a 2px accent underline, counts in `text-3`.
- **List rows.** A 14px medium title over a 12px line of people, year and format as words.
  Status is a coloured word, progress a number, and row actions appear on hover or focus.

## Density rules

| Control                                                              | Where it goes                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Comment / Bookmark (Notes panel)                                     | **+** menu next to the search                                       |
| Type, colour and order filters, follow reading position, page search | One **Filter** menu, with a dot when anything is not at its default |
| Annotation source                                                    | Only when it differs from the open source, and on the selected card |
| Card actions (comment, insert, more)                                 | Hover, focus-within or selection                                    |
| Location on each card                                                | Replaced by section group headings                                  |
| Citation style and locale                                            | One quiet select under the citation; locale goes in its menu        |
| Field evidence, lookup, CSL-JSON                                     | Disclosures below the details                                       |
| Library sort, columns, layout, export                                | **View** menu                                                       |
| Delete highlight                                                     | **More** in the highlight popover                                   |

Hidden is never unreachable. Every hover-revealed control is also revealed by `:focus-within`, is
in the tab order, and has a menu or command-palette equivalent. On touch, which has no hover,
card actions show on the selected card and through a long-press menu. Shortcuts (H highlight,
C comment, `/` search) are shown in tooltips and in the palette.

## Delight

Under `prefers-reduced-motion`, states change instantly and only fades remain.

1. **Ink sweep.** A new highlight fills left to right (260ms), its margin marker settles, the
   count ticks, and “Saved · Undo” fades after 2.4s. The ink is the confirmation.
2. **You were here.** Continue reading quotes the last passage. When the document opens, that
   line carries a soft wash that fades over a second.
3. **Objects, not rows.** Continue reading shows first-page renders and covers, which lift on
   hover.
4. **The citation sets itself.** Fix details updates the preview with the changed parts tinted.
   Copy confirms in place (“Copied as APA 7th”).
5. **A typographic first run.** Empty states show a short highlighted quotation in the reading
   face above a single action, instead of an icon.
6. **The page as paper.** Reflowable documents sit on warmer paper with a soft edge. Reading mode
   fades the chrome (160ms) and leaves a 2px progress hairline.

## Accessibility

- Text is at least 4.5:1, including `text-3` and placeholders. Any border that alone identifies
  a control uses `line-control` (3:1). The focus accent is 6:1 or more. These figures come from
  converting OKLCH to sRGB luminance.
- Focus is always visible. `outline: none` never appears without the ring token.
- Label-in-name: where a control has a visible label, its accessible name begins with that label
  (“Fix details”, “Comment”). Icon-only controls are named as their tooltip (“Highlight yellow”).
  Swatches use `aria-pressed` and never rely on colour alone.
- Targets are at least 44×44px under coarse pointers and at least 24×24 on desktop (WCAG 2.2).
- “Saved”, filter counts and citation status are announced in polite live regions.
- Panels reflow down to 320px, and text scales to 200% without clipping.

## Getting there

All of this fits the existing React and CSS. In order: fix `--sans` (one line, and the largest
visible change); add the token layer to `reader-shell.css` and map the `@mdbase-dev/ui` aliases
onto it; split canvas from surface in the Dockview theme; rebuild the Notes panel header and
cards; then the library, citation tab and selection toolbar.
