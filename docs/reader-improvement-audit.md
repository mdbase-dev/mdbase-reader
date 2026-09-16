# Reader improvement and browser audit

## Implemented

- **Durable source-note drafts.** Edits are written to device-local storage before the
  800 ms collection autosave. Recovery is reviewable; storage failures are visible.
  A shared source-draft session coordinates inspector/workbench editors. Pending
  edits survive failed writes and reloads, and completing an older write cannot
  erase a newer draft. Closing the last subscriber cancels scheduled autosaves.
- **Conflict handling.** Draft writes use an explicit uncached source read, then a
  revision-checked update. The UI compares the local and collection bodies and
  offers explicit local/remote choices. Source metadata changes do not themselves
  cause a body conflict. A regression test covers bypassing Connect's warm cache.
- **Calmer reading defaults.** The inspector starts closed; the library offers
  Continue reading with saved location/progress where available. Comfortable UI
  density is the default, with a persisted compact option. The header now calls
  its command palette “Commands” rather than presenting it as library text search.
- **Clear search scopes.** Metadata, notes/annotations, and loaded-document text
  are separate scopes. Text results include bounded, highlighted excerpts. Loaded
  document search reports coverage, unsupported/suspended omissions, extraction
  failures, and its per-document character limit. Note snippets retain their
  source paths; text queries do not accidentally change saved metadata-view filters.
- **Bounded reading sessions.** Four document renderers stay resident by default;
  visible reading panes are protected. Session locations are now keyed by stable
  Dockview session, file identity and revision, and survive renderer eviction even when a
  position write failed. Note editors share the workspace source index instead
  of fetching a complete library per editor.
- **Bounded library DOM.** Tables and cards display 100 sources per page. Content
  search processes smaller record pages and retains excerpts instead of all note
  bodies. Extracted document text is cached per resident surface.
- **Explicit offline copies.** Keep offline stores the exact document revision in
  IndexedDB; SHA-256 is checked before storing and opening. Limits are 64 MiB per
  file and 128 MiB total. Copies are opt-in and individually removable; caching
  never silently substitutes a different revision.
- **Keyboard and mobile fixes.** Ctrl/Cmd+F is no longer stolen by sidebar search;
  use Ctrl/Cmd+Shift+F for the sidebar. Hidden panels and inactive sessions are
  inert. Keyboard focus selects the correct reading pane. Ordinary right-click
  no longer unexpectedly opens a source beside the current one; Ctrl/Cmd+Enter
  provides that action in the navigator.
- **EPUB reading.** More comfortable default typography and a centred reading
  column, plus explicit previous/next controls usable with pointer and keyboard.
  EPUB fetching now observes cancellation. HTML respects reduced-motion and
  forced-colour preferences.
- **SDK.** `@mdbase-dev/connect` is pinned to `0.1.0-beta.100` (the `next` release at
  implementation time), up from beta.91. Developer tooling remains at beta.91:
  beta.100's default authoring validator accepts canonical v2 declarations, while
  Reader deliberately retains its existing legacy v1 permissions. This change
  does not widen permissions or automatically migrate the manifest.

Annotation creation, organisation, bulk insertion and synthesis features were
not changed as part of this work.

## Interactive audit

Run against a local Vite server:

```sh
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5193
# In another terminal:
pnpm --filter @mdbase-reader/app test:browser
```

`READER_AUDIT_ORIGIN` may select another explicit loopback port. The script
creates a fresh, owned Playwright browser and intercepts all fixture API requests.
It never pairs with Connect or changes a real collection. The HTML, PDF and EPUB
reading surfaces are the real renderers, not screenshots or mocked components.
The fixture entry under `test-fixtures/` is not a production build entry.

The audit covers:

1. A 5,000-source library, pagination and bounded DOM.
2. Storing an offline document and reopening it with document traffic blocked.
3. Failed autosave, full-page reload, draft recovery and explicit conflict resolution.
4. Notes and loaded-document search, snippets, highlighting and coverage labels.
5. Density persistence, 390 px mobile layout, panel toggles and keyboard search.
6. Twenty visited HTML documents, eviction, and restored position while server
   position writes fail.
7. PDF page-image rendering and EPUB rendering through the real adapters.
8. EPUB next-page pointer interaction, previous-page keyboard interaction, and
   persisted reading position.
9. Desktop/mobile/light/dark screenshots and unexpected browser errors.

Observed in the pre-Dockview functional run:

- 101 rendered table rows for 5,000 sources (100 records plus the header).
- Renderer residency grows 1 → 2 → 3 → 4 and stays at four throughout the session.
- 1,470 top-level DOM nodes after the long HTML session.
- About 0.6 seconds to the library in a warm local development run. This is a
  fixture observation, not a Connect/network benchmark or a production claim.
- No unexpected page errors, console errors or failed requests. Intentional
  503/409 responses and cancelled requests are excluded from that assertion.

Private screenshots and JSON results from that run are under
`/tmp/reader-audit-TgqaEx/`. The browser and the owned local audit server were
stopped; all records were disposable in-process fixtures.

### Defects found during the audit and fixed

- The new offline action initially overlapped the document toolbar. It is now in
  a separate document footer.
- An existing minimum-height rule squeezed the new conflict UI into a sliver.
  The editor can now shrink, and recovery controls remain readable. The audit
  asserts the conflict panel's actual height as well as its presence.
- Visually collapsed side panels remained keyboard-accessible; they are now inert.
- Waiting only for the PDF “ready” event produced a screenshot before page pixels
  appeared. The audit now waits for a decoded page image.
- EPUB page-turning depended on undisclosed edge taps. Explicit, keyboard-usable
  controls now provide the same navigation.

## Dockview migration audit

The workspace now uses one Dockview instance for documents and both side panels.
The old tab/pane mutation engine, tab drag handlers, split targets, and resize handles
were retired rather than synchronized with a second layout model.

The expanded browser audit additionally checks real mouse and native touch drags,
iframe identity and position across moves, focus inside reading frames, inspector
context across docking and reload, dirty-note close cancellation, both sidebar drop
paths, keyboard pane menus, resize persistence, reset without closing tabs, reopening
closed sessions after reload, legacy migration, and corrupt-layout recovery. Mobile
maximizes one group and keeps hidden reading panes out of the accessibility tree.

Evidence: `/tmp/reader-audit-jnRmd8/`. The warm fixture library loaded in about 0.74 s;
the long HTML session had 2,113 top-level DOM nodes and still retained at most four
renderers. These are local observations, not production/Connect benchmarks. Chromium's
exact script-blocked notice from interacting with script-disabled HTML frames is
recorded separately in `sandboxNotices`; sandbox permissions were not relaxed.

Dockview adds roughly 85 kB gzip to the main entry bundle compared with the previous
build. This trades some download size for a single maintained docking engine; it is
not claimed as an initial-load optimization. Core docking does not require an
enterprise license. Dockview was deployed to the existing production Pages site as
`353fc2e439d9-production-mu3iakho`. Subsequent annotation polish was deployed as
`083c05701855-production-mu3mq3ht` and is covered in
[the annotation UX/UI audit](annotation-ux-audit.md).

## Responsive workspace follow-up (not deployed)

The [combined edge/mobile integration](responsive-workspace.md) now uses native
edge sidebars on desktop and a single native group with explicit navigation on
phones. Fixture tests verify stable sidebar widths, editor/iframe and draft
preservation, layout migration, focus transitions, mobile closes, and desktop
arrangement recovery. The active annotation stripe is also removed locally.
Production remains the annotation revision above.

## Validation and limits

Workspace tests, typechecking, production builds, architecture checks and spec
integrity checks pass. Reader tests include Dockview metadata/session regressions
and five deployment-script checks. Obsolete custom-pane mutation tests were retired;
legacy-format migration and native docking are tested instead. Changed TypeScript files pass ESLint. The full-repository lint/format
commands still report unrelated existing issues in the extension, source-import
files and environment-badge/deployment files; those were not rewritten.

Connected LAB acceptance is **blocked**, not passed: guarded `mdbase-env lab up`
reported port 28487 owned by another process. No LAB process was stopped, no identity
or pairing guard was bypassed, and no shared LAB browser was opened. Actual SDK
routing/authorization and real collection performance still require LAB retesting.

Remaining opportunities:

- A persistent, revision-keyed whole-library document index. Currently only loaded
  supported documents are searched; suspended/unopened documents are explicitly
  excluded. Each loaded document is capped at its first 1,000,000 characters.
- Passage-level document destinations. Results currently open the correct source
  or note surface; document results tell the user to use the renderer's Find
  control rather than pretending to have a precise PDF/EPUB locator.
- Cold-start offline authentication/collection discovery. Open a collection while
  connected first; the new document cache is not a complete offline mirror.
- Browser cache quota management across many historical revisions, multi-window
  draft recovery, and external live-edit reconciliation beyond write-time checks.
- In very crowded tab groups, reset can leave the selected tab in the overflow
  list even though the correct editor remains selected. Auto-reveal needs care:
  scrolling tabs on every layout event interferes with native dragging.
- Native-shell coverage and further PDF/EPUB position coverage across renderer
  eviction. Browser docking now has pointer, touch, persistence, and mobile coverage.
- Further initial bundle splitting. The production build still warns about large
  renderer chunks and YAML being imported both statically and dynamically.
