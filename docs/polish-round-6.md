# Reader polish round 6

## Scope and result

Implementation on `polish-r6`, based on `3c12d9850dd56128d00181365a82783e05f0ec8a`
(round-5 main). The authoritative brief is Connect council's
`reader/plan-round-6.md`; its rulings take precedence over the three round-5 reports.
This is a local implementation and verification pass, not another council score.

Disposition: **28 done, 2 not reproduced, 5 not done**. The table includes all
35 numbered items. A done item means the local implementation and stated proof
are complete; it does not imply connected-service or native-device acceptance.

No production, staging, or LAB service was changed or deployed. No real LAB
collection was opened in this pass. There was no screen-reader speech run,
native wrapper run, or physical touch-device test. Touch evidence below is
Chromium touch emulation. Manage access and per-installation revocation remain
upstream/out of scope; there is no Reader interception or private SDK patch.

## Item-by-item evidence

Before evidence refers to the supplied round-5 `opus.md`, `sol.md`, and `muse.md`
and the base commit above. Where this pass also reproduced the baseline, the
measurements are recorded explicitly. After evidence is from local unit tests,
the production-preview polish gate, source inspection, or the new repeatable
`scripts/polish-round6-test.mjs` probe, as identified in each row.

### W1 — Add source

| Item                                | Disposition        | Before                                                                                                                                         | After and proof                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1.1 Stop and retry                 | Done               | Opus: Stop then Retry fails, retaining the stopped upload's recovery session.                                                                  | `useSourceImport` clears recovery on abort, retains the file for a fresh attempt with a new AbortController, and says “Stopped. Nothing was added.” The added hook regression stops a held attempt, then imports successfully without passing a recovery file. Failed non-aborted attempts retain the existing digest recovery path. This is deterministic local proof, not a fresh LAB upload.                                                                              |
| W1.2 Plain uncertain failure        | Done               | Add source printed the raw error paragraph; Opus saw receipt/session jargon.                                                                   | Both add paths use `SourceAdditionError` and the existing `ProblemDetails` disclosure. The visible paragraph says confirmation is unknown and directs reconnection/library/pending-change checks; raw diagnostics stay inside Details. `SourceImportDialog.test.tsx` checks the plain paragraph separately from diagnostics. No success or loss claim is inferred from an unconfirmed result.                                                                                |
| W1.3 Clear stale errors             | Done               | Opus: error survives cancel and reopen.                                                                                                        | Existing import error ownership now exposes a clear action; choose, accept, cancel, reopen, and reconnect clear it. `use-source-import.test.tsx` covers clearing and fresh attempts; `useSourceAddition` applies the same clear path on reopening and connection recovery.                                                                                                                                                                                                   |
| W1.4 Failure focus                  | Done               | Opus: failed add leaves focus on BODY.                                                                                                         | The shared error focuses its `role=alert`, `tabIndex=-1` container and clears the stale Dockview announcement. The dialog regression asserts that exact element is active, not BODY.                                                                                                                                                                                                                                                                                         |
| W1.5 Success focus and reading keys | Not done — partial | Opus: imported viewer does not own focus; the plan also asks that J work immediately.                                                          | Modal restoration now detects a new session in the same pane, restores after React/native dialog commit, and focuses the reading surface. A same-pane session replacement unit regression passes; the browser gate exercises real viewer PageDown and Space. **Viewer J remains unimplemented**: J/K are existing library-row commands, not reading commands. No new cross-renderer J/K mapping was invented. Fresh connected-add keyboard acceptance also remains unproven. |
| W1.6 HTML title before form         | Done               | Opus: the filename appears before later metadata; HTML title is ignored initially.                                                             | The existing HTML title parser is reused synchronously for the form's initial value. The first-render test uses `download.html` with `<title>A title &amp; context</title>` and observes “A title & context” before any later metadata lookup.                                                                                                                                                                                                                               |
| W1.7 Install ownership              | Done               | Sol: at 1042×662 the real Remove source hit landed on the install card. Baseline probe also found the invitation present during the open menu. | Deleted persisted prior-session engagement eligibility. Eligibility now follows leaving a ready reading session or a successful add, then the existing 30-second delay. Existing dialog/menu/popover DOM ownership suppresses the invitation; no second queue. The 1042×662 probe shows the real Remove target is center-hit-testable and install-card count is zero with its menu open. The gate also rejects an invitation merely from opening a document.                 |
| W1.8 Waiting-stage attribution      | Not done           | Opus measured roughly 3.6 seconds in Waiting on LAB.                                                                                           | No fresh live measurement, server attribution, or post-transfer pending source row. Local confirmation tests cannot establish that server latency. No fake progress, optimistic source record, or new shadow ledger was added. Requires owned LAB upload timing before deciding whether a pending row is appropriate.                                                                                                                                                        |

### W2 — Boot

| Item                           | Disposition        | Before                                                                        | After and proof                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2.1 One live boot/frame strip | Not done — partial | Opus: real connected boot returns to a second skeleton and shifts 24 px.      | Deleted ReaderWorkspace's separate `OpeningScreen` in favor of the same first-HTML `ReaderBoot` used by lazy startup. The existing static-first-paint/failure/CLS gates pass locally, but a real LAB frame strip, n=3, was not captured. Do not read preview CLS as proof of connected boot continuity. |
| W2.2 Loading colour            | Done               | `.library-view-error` styled “Loading views…” as a danger message.            | Loading uses the muted `library-view-loading` style; only actual problem text retains danger styling. Source inspection and successful lint/build validate the separate classes.                                                                                                                        |
| W2.3 Collection name           | Done               | The second loader substituted generic “Opening your reading collection” copy. | `ReaderBoot` takes the opened collection's name, or the selected collection's SDK snapshot display name during opening. The native scope fallback also receives the known collection name. All Reader-owned loading fallbacks use this same markup; live transition proof remains W2.1.                 |

### W3 — Focus and keyboard

| Item                       | Disposition | Before                                                                                                                       | After and proof                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W3.1 Escape status focus   | Done        | Muse's A after S/Escape silently archived. Baseline probe: active element `.mdbase-select`, Inbox → Archived, no Add dialog. | Escape restores the owning row after the shared listbox dismissal. Browser regression: active element `.library-table-row`; A opens Add source; status stays Inbox. This regression is included in `test:polish`.                                                                                                                                                                     |
| W3.2 First S               | Done        | Baseline probe's first S left `aria-expanded=false`; the row cursor and selected index were out of sync.                     | Row actions resolve the event's actual row instead of stale selection state. Baseline/probe comparison changes the first S result to `aria-expanded=true`; selection/shortcut unit tests also pass.                                                                                                                                                                                   |
| W3.3 Interrupted Ctrl+Home | Done        | Exact 390×600 probe: PageDown, wait 150 ms, Ctrl+Home, n=3 ended at scrollY 328 rather than 0 in all three runs.             | The HTML runtime now owns page/edge keyboard jumps synchronously instead of leaving a pending native/compositor page animation to overwrite Home. Same probe: midpoints 328, 328, 361; all end at 0. Editable/composition/modifier guards remain; runtime tests protect Home and editable controls. The original eight polish cells pass without weakening their Ctrl+Home assertion. |
| W3.4 Iframe sidebar key    | Done        | `[` was handled only in the library, stranding a collapsed sidebar while reading.                                            | The shared reading-surface key forwarding and existing global Reader action now handle `[` outside editable content. Shortcut tests cover it; a real iframe-focused shared-browser interaction reopened the Sources sidebar to 260 px without leaving the viewer. No library-only duplicate handler remains.                                                                          |
| W3.5 Palette groups        | Done        | Views were absent and status commands were not under Current source.                                                         | Commands derive real library views and existing status mutations into Current source, with searchable view/status terms. Registry tests include library view inputs; the production palette/search gate passes. No separate status mutation path.                                                                                                                                     |
| W3.6 Shortcut sheet        | Done        | Help mixed prose, search results, and duplicated guidance.                                                                   | Replaced it with grouped two-column description lists derived only from current commands with a shortcut. Library-only keys remain context-specific. The gate asserts visible help rows, Close focus, and a center-hit-testable help action instead of the now-removed results list. This expectation change follows the explicit plan, not a failing unchanged contract.             |
| W3.7 Clear multi-selection | Done        | Escape retained a selected current row.                                                                                      | Escape empties the selected ID set while retaining the independent roving cursor/anchor. `library-grid-keys.test.ts` explicitly asserts none selected.                                                                                                                                                                                                                                |

### W4 — Pending changes and phone

| Item                          | Disposition        | Before                                                                                        | After and proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W4.1 Human pending operations | Not done — partial | Pending rows exposed raw mutation/file IDs and lower-level problems; Reload appeared offline. | Cached source/file identity now resolves readable source titles, generic confirmation/attention wording replaces the raw heading, and IDs/problems move under Details. Reload appears only while connected. `ReaderSaveStatus.test.tsx` covers title resolution, rejection details, and offline Reload absence. **Specific operation names remain unavailable:** the public SDK ledger exposes record/file IDs, not the mutation kind. A local parallel operation ledger would invent state; needs an upstream SDK projection. |
| W4.2 Pending phone bounds     | Done               | Opus: disclosure begins about −52 px at 390 width.                                            | On phone the panel is fixed with 16 px left/right insets, rather than anchored wider than the trigger viewport. CSS inspection and the production phone layout gates pass; a live pending-state screenshot still requires LAB.                                                                                                                                                                                                                                                                                                 |
| W4.3 Reading zero             | Done               | Source label showed “Reading 0%”.                                                             | Zero progress is omitted; the status remains “Reading”. Positive progress remains unchanged, and existing progress/phone status tests pass.                                                                                                                                                                                                                                                                                                                                                                                    |
| W4.4 Status hit target        | Done               | Phone status Select was visually and interactively 26 px tall.                                | The row-scoped phone Select has a minimum 44×44 box without enlarging its glyph. Actual Chromium measurement: **62×44**. The scoped selector overrides the narrower library styling rather than relying on an ineffective global rule.                                                                                                                                                                                                                                                                                         |
| W4.5 Single row tap           | Not reproduced     | Muse's two probe taps selected but did not open; report explicitly limits this to its probe.  | A single actual Playwright touchscreen tap on the first row's title opens the matching focused document pane at 390×844. No double-click workaround or competing touch handler was added. Emulation only, not hardware proof.                                                                                                                                                                                                                                                                                                  |
| W4.6 Pane-width toolbar       | Done               | Muse: Open-beside toolbar clips under search despite a wide viewport.                         | Existing `library` container controls degradation at 760 px pane width. Save/actions/count yield space to search and essential controls. Removed the superseded phone-only hiding rules. The eight-cell gate exercises split panes and responsive restoration.                                                                                                                                                                                                                                                                 |
| W4.7 Grid-only overflow       | Done               | Sol: Notes at 1440 lets Continue reading move 160 px with the table.                          | Moved the canonical virtualizer/scroll persistence ref to `.library-table-frame`; table viewport owns both axes and sticky header. Non-table results retain their own existing owner. At 1440 with Notes: table scrollLeft **160**, outer results overflow **0**, Continue reading x shift **0**, sticky header offset **0** after vertical scrolling. No nested competing table scroll owner.                                                                                                                                 |
| W4.8 Annotation hit targets   | Done               | Enabled insertion/show-in-document phone actions were shorter than 44 px.                     | Existing annotation buttons receive minimum 44 px dimensions on phone/coarse pointers; no separate mobile toolbar. Production phone/annotation interaction and accessibility cells pass.                                                                                                                                                                                                                                                                                                                                       |

### W5 — Motion and visual layer

| Item                                  | Disposition    | Before                                                                                                                           | After and proof                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W5.1 First Notes entrance             | Done           | Opus: first opening snaps; later opening slides. The initial local r6 probe also found no first-open transform transition.       | Replaced transform/opacity ownership on Dockview's already-rendered overlay with the actual mounted sidebar content. First insertion uses `@starting-style`; subsequent opens use the same transition. Both are measured at **220 ms**, `cubic-bezier(0.22, 1, 0.36, 1)`. No first-open flag, second animation owner, or timeout. Existing pane interruption/reduced-motion gates remain green.                           |
| W5.2 Menu lifecycle                   | Done           | Context menus unmounted without exit; Filter/Display snapped; curves differed.                                                   | Context menus and the palette use existing `OverlayPresence`; native details use discrete content visibility. Entrances are 160 ms and exits 120 ms with opacity/4 px, all pane curve. Reopening retargets the existing transition. The eight-cell animation gate covers normal and static reduced motion.                                                                                                                |
| W5.3 Highlight-saved curve            | Not reproduced | Muse reported `linear`; Opus and the prior code/gate disagreed.                                                                  | At the base commit the actual `.highlight-saved` already uses `composer-appear 220ms var(--ease-out)` and an 8 px rise. CSS animation effect timing defaults to linear while the keyframe easing carries the authored curve; the gate samples the element and checks those keyframes/computed styling. Left the correct production animation unchanged. This corrects the interpretation, not a third parallel animation. |
| W5.4 Press states                     | Done           | Save, Add source, and view buttons lacked consistent press feedback.                                                             | Named background-color/transform transitions and a 1 px press displacement on the existing buttons; no `transition: all`. Existing reduced-motion rules remove transitions. Source inspection, detector, and production interaction gates complete.                                                                                                                                                                       |
| W5.5 Disclosure and status            | Done           | Disclosure chevrons/virtualized row geometry snapped; status styling changed without an authored blend.                          | Chevron rotation, tree body height, and positioned row transforms transition over 160 ms; the existing status mark blends fill, border, colour, and opacity over 200 ms. The new browser probe samples real status transition keyframes after choosing Finished; reduced motion stays static. No retained old/new glyph state was added.                                                                                  |
| W5.6 Continue reading/title alignment | Done           | Continue reading manufactured a letter tile when no real thumbnail existed; root-row spacer was 32 px beside a 34 px disclosure. | Removed the letter placeholder only; real lazy thumbnails remain. Moved observation to the existing card button. Root spacer now matches the 34 px desktop / 44 px phone disclosure. Updated the explicitly superseded placeholder test; the library/phone alignment gates pass.                                                                                                                                          |

### W6 — Accessibility

| Item                         | Disposition | Before                                                                         | After and proof                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W6.1 Roving status/skip      | Done        | Opus: 21 tab stops, per-row combobox stops, no skip link.                      | Status Select uses `tabIndex=-1` and the row's existing S/click access; the focused library exposes Skip to sources. From document BODY, **one Tab** focuses that link and Enter focuses the first roving row. The link is hidden while reading rather than offering a dead destination. Keyboard and scoped axe gates pass.             |
| W6.2 Failure live region     | Done        | Dockview retained stale opening announcements after source/renderer failure.   | The shared source error and existing renderer-failure owners clear `.dv-live-region`; the source-dialog regression seeds “Opening stale source” and asserts an empty region on failure. No screen-reader speech claim.                                                                                                                   |
| W6.3 Service-worker precache | Not done    | Opus observed `/404.html` and `/index.html` failed precache requests on Pages. | Reader's `offlineShellPlugin()` comes from the public SDK. Its current file discovery owns the list and exposes no exclusion option. No generated worker patch or replacement local adapter was added. Needs an upstream SDK change/repin and Pages/LAB installed-shell proof; loopback cannot prove those production routing semantics. |

## PR #133 independent-review follow-up

The three follow-up regressions were added and run against the reviewed
`255298c8e3f34c1bc164c5bfb4e7f9366eaa472b` implementation before the fixes.
All three issues reproduced locally; none requires LAB to establish the defect.

1. **Done — Escape/status race (P2).** Before: real Chromium keyboard input
   (`S`, `Escape`, immediately `A`, with no intervening delay or inspection)
   silently changed Inbox to Archived in **16 of 20 trials**. The component
   regression also left focus on the closed combobox with animation frames held.
   After: Escape cancels the shared listbox handler, closes through the existing
   Select trigger, and synchronously focuses the owning row. No Escape animation
   frame remains. **20 of 20 immediate-key trials** retain Inbox and open Add source;
   the component test proves focus has returned before any animation frame. The
   old 40 ms delayed probe is deleted, not retained as a parallel acceptance test.
2. **Done — Notes search/results ref (P3).** Before: a real matching note result
   rendered under All sources/Table, but ArrowDown left focus on the query input
   in `library-workspace-regressions.test.tsx`. After: one `rendersSourceTable`
   predicate governs both rendering and scroll-ref ownership, including empty and
   loading states. The same component regression now focuses the matching result.
   This uses the real text-search component with a deterministic gateway fixture,
   not a connected search-service acceptance claim.
3. **Done — Skip to sources in every presentation (P3).** Before: keyboard
   activation left focus outside both Visual library's first card and an empty
   table's results container. After: the link targets the focused library's results,
   preferring a roving row, source card, or text-search result, with the focusable
   results container as fallback. The browser regression exercises Visual library,
   filtered-empty Table and Cards, and empty Notes & annotations search; the
   existing table-row skip-link regression remains in the round-6 probe.

These are local production-preview Chromium and component-test results. No service
was deployed, and the remaining LAB/native/offline acceptance items below are unchanged.

## Validation and reproduction

- Remote lint, typecheck, and all workspace tests pass. Reader: 199 files,
  1,085 tests; HTML renderer: 104 tests. Architecture passes with the existing
  1,003-line Connect follow-through cohesion warning.
- Catalog extraction/compilation and the stricter remote i18n source/coverage
  check pass. All seven new messages are authored in the nine non-English
  locales; pending Details reuses the existing Reader-interface message.
- The eight-cell production-preview matrix passes, followed by the r6 probe.
  Rechecks during rising machine load were 7/8: Add source measured 80.1 ms
  in the dark desktop cell (load 20.17–27.09), and 67 ms in the reduced-motion
  phone cell (load 11.22–28.35). The expected timing was not changed; the
  lower-load passing run is the acceptance evidence.

Run from repository root unless noted:

```sh
pnpm i18n:extract
pnpm i18n:compile
rpnpm lint
rpnpm typecheck
rpnpm test
cd apps/reader
pnpm exec vite build
pnpm exec vite preview --host 127.0.0.1 --port 5193 --strictPort
# In another terminal, still in apps/reader:
pnpm test:polish
```

`test:polish` retains the eight original desktop/phone × light/dark ×
normal/reduced-motion cells and then runs the round-6 and independent-review
focus regression probes, including 20 real zero-delay Escape/A trials.
Its source-add latency and mobile scroll assertions were not weakened. The only
existing expectation changes follow the explicit shortcut-sheet replacement and
current-session completed-read install eligibility contract.

Local evidence logs live under `/tmp/reader-r6-{before,after,lint,typecheck,test,polish}.log`;
they are scratch artifacts, not durable hosted evidence. Browser captures are in
the output directory reported by the polish gate. The repeatable assertions are
committed with the code so reviewers do not need those scratch files.

The Impeccable detector reported one pre-existing warning: a 6 px top border on a
rounded library card (`library.css`). It is outside this plan and unchanged.

## Remaining acceptance

- W1.5: establish the intended cross-renderer J/K behavior before adding keys;
  verify fresh connected-add focus with actual input on LAB.
- W1.8: time the real transfer/confirmation boundary; only then choose whether
  the existing source projection can truthfully show a pending row.
- W2.1: capture real LAB boot frame strips, n=3, with the known collection name.
- W4.1: project operation kinds from the existing SDK ledger, then repin Reader.
- W6.3: fix SDK precache discovery and qualify installed/offline Pages behavior.

These are not claimed fixed by local preview success. LAB auto-deployment from
main is left to its existing process; this branch is not deployed or merged.
