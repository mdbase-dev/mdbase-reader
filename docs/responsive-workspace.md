# Responsive edge workspace

Status: implemented locally; **not deployed**. Production remains revision
`083c05701855-production-mu3mq3ht`.

This completes the desktop/mobile integration that the [initial edge experiment](experiments/dockview-edge-groups.md) deliberately did not attempt. That experiment demonstrated a desktop benefit, not an argument against mobile edge-group integration.

## Behaviour

- The desktop library navigator and Source tools use core left/right edge groups, with horizontal headers. Splitting/closing reading panes no longer redistributes their widths.
- At widths up to 680px, existing panels move into **one native Dockview group**. Reading, library navigation, and tools each occupy the available width. A tab selector, close button, and Back to workspace action replace tiny desktop tab/drag controls.
- Desktop group membership, sizes, and sidebar visibility are retained separately as native serialized geometry. Tabs opened or closed on mobile are reconciled into that geometry, rather than resurrecting closed tabs or persisting the temporary phone group.
- `fromJSON(..., { reuseExistingPanels: true })` retains the actual editor DOM and iframe Window. Native empty edge shells are removed after panel transfer, not while they still contain content.
- Desktop maximize hides the edge shells too. Leaving maximize restores their prior visibility. Manual maximize survives viewport transitions; its transient controller flag is not independently persisted across a mobile reload.
- Closing a lone desktop sidebar hides its shell rather than destroying its contents. Returning from mobile tools activates the prior content session. Dirty content-tab cancellation leaves the editor and layout untouched.
- Reset moves existing panels back into a central content group and restores visible shell panels to their edges. It does not close tabs or reopen a deliberately hidden inspector.

## Ownership and persistence

There is one Dockview instance and no parallel mutable pane engine. `ResponsiveDockLayout` retains an inactive desktop serialization while Dockview owns the live phone presentation. Pure reconciliation operates on panel membership, not a custom split algorithm.

The existing collection storage key stays `mdbase-reader:dockview:v1:<collection>`, with a **version 2 envelope**. Both envelope versions are accepted. Standalone old navigator/inspector grid groups migrate to edges; mixed workbench groups retain their intentional placement. A `:before-edges` copy preserves the original v1 data when storage permits. Invalid state still gets a `:recovery` copy and a safe fallback.

Edge geometry, group identities, and panel references are validated. Headers are normalized after restore. Editor bodies, crop blobs, dirty flags, and credentials are not serialized into layouts. Draft persistence is unchanged.

A narrow resize can clamp native edge sizes before React receives the breakpoint change. The controller caches settled desktop geometry and restores edge sizes after the desktop host has its final dimensions. Native maximize index paths are not replayed into a flattened or pruned tree.

Always-mounted edge panels can report `isVisible` even when their shell is hidden. Reader checks shell visibility/collapse as well, hides inactive accessibility content, and suppresses the corresponding empty renderer overlay so retained phone geometry cannot intercept desktop clicks.

## Verification

Latest disposable fixture evidence:

- Full browser regression: `/tmp/reader-audit-btRPsX/`.
- Sidebar comparison plus expanded responsive acceptance: `/tmp/reader-audit-QBcQT9/` and repeat `/tmp/reader-audit-BzIJCK/`.

All sidebar acceptance flags pass: stable split/close widths, inspector toggling, resized widths across reload, full-workspace maximize, three full-width mobile modes, and iframe retention. The resized navigator and inspector restore to **315px / 340px**.

Expanded responsive tests cover repeated viewport transitions with iframe Window/scroll and editor DOM sentinels; a locally saved unsaved note; mobile source opening and reload recovery; native split membership; maximize/restore after a phone visit; dirty-close cancellation; permanently closing a document on mobile; closing every content tab and reopening without another narrow pane; and a fresh phone session acquiring sensible desktop defaults.

The full suite also covers pointer/touch docking, source context, annotation editing and draft recovery, PDF crop recovery, EPUB highlights, missing passages, v1 native-layout migration/backup, legacy custom-layout migration, corrupt-state fallback, and the removal of the selected annotation stripe.

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193 --strictPort
pnpm --filter @mdbase-reader/app test:browser
READER_AUDIT_RESPONSIVE_ONLY=1 pnpm --filter @mdbase-reader/app test:browser
```

Unlike measurement-only sidebar mode, responsive mode asserts every sidebar acceptance flag before continuing.

Workspace tests and typechecks pass (Reader: **59 files / 170 tests**, plus five deployment-script checks). Reader builds successfully; changed-file lint/format, architecture, and specification checks pass. Existing YAML import and large-chunk build warnings remain. This is not a claim that unrelated repository-wide lint/format issues were fixed.

## Boundaries

- No enterprise modules, automatic hide/peek, floating windows, or popouts.
- Native edge-group `maximize()` remains unsupported. Edge pane menus do not offer that operation; ordinary central reading panes support whole-workspace maximize. A document deliberately docked into an edge must be moved/reset into the central workspace to use that native operation.
- On Dockview 8.3.1, dragging an edge tab into another group's content center works; dropping it directly onto a document tab header did not. Move-to-pane menu actions provide an alternative.
- These are isolated Chromium fixture tests, not authenticated Connect/LAB acceptance, physical-phone keyboard/touch verification, or screen-reader certification. No production collection was used or deployment performed.
