# Reader round 5

Implemented on `polish-r5`, based on `98dbcdadec445ed7566034b60f9a302e9609e078`.
The council plan takes precedence over the individual round-4 suggestions.

## Connected import investigation

Only LAB was accessed, using an owned GCP desk. The deployed LAB health endpoint
reported revision `e1fb6f3b8c4d97fe5bc877bfa1041b4321be6826` and the LAB Connect
origin. This was a service investigation, not a deployment of this branch.

- Imported one owned HTML file through the real file chooser. It opened and
  reached synced with zero pending, held, conflicted, or rejected changes.
- Took the owned record offline, updated its body, and observed one pending
  change with `saved_on_device`. Reconnecting reached synced with zero pending
  and zero rejected changes.
- The original council service-side stall was not reproduced. There is no
  evidence here for a provider or server root cause.
- Reader did have an indefinite, non-cancellable wait on `write.confirmed`.
  Upload now uses the public SDK's bounded, signal-aware `awaitReceipt` before
  readback or source creation. Cancellation settles; unconfirmed work stays in
  the SDK ledger rather than being mistaken for a durable recovered upload.
- The header does not claim Connected with pending or rejected changes. A
  compact disclosure shows the ledger's actual mutation and record/file IDs,
  timestamps and rejection problems. The shared sign-out guard is unchanged.
- Deleted the owned source and uploaded file and confirmed zero remaining
  owned records/files and zero pending writes. Destroyed `gcp/reader-r5`.
  No production or staging service was visited or changed.

## Reader changes and gates

| Area         | Change                                                                                                               | Gate                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Import       | Signal-aware confirmation; no duplicate replay after an unconfirmed acknowledgement                                  | Native file tests cover confirmation, rejection, cancellation while held, and pending recovery                      |
| Pending work | Compact ledger disclosure, truthful connection state                                                                 | Snapshot assertions for pending, rejection, saved-on-device and drained state                                       |
| Launcher     | Explicit LAB, staging and production Editor/Writer URLs, build-time HTTPS validation                                 | Deployment tests include missing URL rejection and staging destinations                                             |
| Library keys | J/K/A/S/[ from the pane and BODY; cursor independent of X selection                                                  | Real first J, X/J/K, status/Undo, Add/Escape and sidebar keystrokes in every polish cell                            |
| Pane focus   | F6 captures input events and cycles into actual row/iframe content                                                   | Real F6 from an input, BODY and two reading iframes; native Enter regression test                                   |
| PDF failure  | Error replaces viewer children instead of covering them                                                              | Offline gate checks absence of the viewer and Close Document, Tab exclusion and successful retry                    |
| Confirmation | Immediate status Undo and removal feedback; refusal restores the row and fresh confirmation                          | Deferred-write tests and actual Delete/confirm/remaining-row focus                                                  |
| Modal focus  | Restore after the exit transition, including a removed invoker                                                       | Removed-opener/remaining-row unit test and actual removal gate                                                      |
| Boot         | One first-HTML skeleton reused across loading phases; full-height surface and named static failure                   | JavaScript-disabled and blocked-entry gates; startup LayoutShift observer                                           |
| Motion       | Shared context-menu entrance and pane curve; preserve the existing correct toast rise                                | Computed menu/toast curves in normal and reduced-motion cells                                                       |
| Visuals      | Format-only cards, progressed Continue reading, serif HTML H1, aligned settings labels and fixed phone status column | Visible format-tile assertions, zero/positive/PDF-page progress tests, computed type and phone alignment assertions |

Startup attribution found a host CSS rule overriding Dockview's initial
`visibility: hidden`, exposing an unpositioned sidebar. The override now applies
only to closed edge panels for their existing exit transition. No Dockview
geometry or tab-strip implementation was changed.

Tab-close probes also found that the session's discrete visibility transition
could leave its active row unfocusable when the existing focus effect ran. The
session now changes visibility immediately and transitions opacity only. Tab
Delete/Backspace uses Reader's existing guarded close path instead of Dockview's
native close path; the real-key gate checks focus on the surviving library row.

Also removes the duplicate Views heading, the install invitation while a
document pane is focused, empty Notes after removing its current source, and
11/12 px icon outliers. Removal remains deliberately irreversible in Reader;
only reading-status changes offer Undo.

## Upstream boundaries left unchanged

- **Collection-specific Manage access remains open.** Reader uses the shared
  `CollectionSwitcher` from `@mdbase-dev/ui` beta.149. It consumes
  `snapshot.links.manageAccess` without a link override. The pinned public SDK's
  `application/entry.js` supplies `/account/applications`. The current Portal's
  collection-specific destination is `/access?collection=<id>`. Fix the public
  SDK link using its selected collection, then repin Reader. This branch does
  not proxy SDK snapshots, intercept shared-menu DOM, vendor-edit the UI, or add
  a parallel collection switcher.
- **Per-installation revocation is not a Reader-owned decision.** Current Portal
  source has collection-scope `removeInstallationAccess(applicationId, collectionId)`
  and application-wide fan-out through
  `revokeInstallation(connectorId)`. Its controls are grouped collection/app
  actions, not one installation-row action. No revocation was attempted: the
  fixture contains other installations and their access must not be removed.
- **Create-at-limit and setup copy live upstream.** The confusing “Creation
  hasn't finished…” text belongs to shared collection/pairing surfaces. It was
  not copied or replaced with a Reader-local setup mechanism.
- **Tab-strip motion is deferred** rather than changing Dockview geometry.

## Validation

Run lint, typecheck, the full root test suite and catalog checks with `rpnpm`.
Extract and compile translations locally. Run `test:polish` from `apps/reader`
against a local production build and strict preview on port 5193. Timing and
phone-scroll assertions require a low-load recheck if the host is overloaded.

The browser matrix is Chromium, 1440×900 and 390×844, light/dark, normal/reduced
motion. This is not native-app or assistive-technology qualification. The LAB
service drained successfully, so a service-held import on this exact patched
build has not been observed; cancellation of a held acknowledgement is covered
by the public-adapter state test.

Remote validation passes the full root test suite (Reader: 198 files, 1,059
tests), typecheck and the catalog source/contract check. Extraction and
compilation include authored translations for every supported locale. The
architecture gate passes with the existing 1,003-line
`packages/connect/src/create-follow-through.ts` cohesion warning.

Final production-preview `test:polish` passes all eight cells with empty page-error
arrays. Add source opens in 11.6–17.0 ms (normalized 11.58–16.97 ms), below the
unchanged 50 ms gate. Startup CLS is 0.0003258659122085048. The final run began at
one-minute load 8.73 and ended at 9.83. Desktop light/dark library, serif HTML
reading, and final phone light/dark screenshots were inspected; the phone status
marks align across different statuses and the Reading label remains complete.

Validation was not uniformly green on first attempt. An overloaded run at load
38–43 failed four Add source timing cells. A later run passed seven cells but
once left the phone's HTML scroll at 117 after Ctrl+Home, even with a lower load
reading. That exact phone reading-key gate subsequently passed six isolated
rechecks and the final full matrix without source or threshold changes. The
intermittent scroll failure is not attributed to a proven product or host cause.

Reader has no `ci:local`, `e2e`, or `check:changelog` script. The commands above
are this repository's available gates; no Connect-server CI, native qualification,
production/staging testing, or deployment of this branch is claimed. The owned
local preview is stopped after validation; the LAB desk and fixture are already
cleaned up.

## PR review follow-up

- Reading-status intents are tracked per source. A newer intent invalidates a
  deferred Undo before it submits, and stale acknowledgements, Undo completions
  and failures cannot reconcile or replace that source's newer notice. Tests
  cover Reading → Undo → Finished before acknowledgement, an already-submitted
  Undo completing late, and late completion/refusal without Undo.
- Recovery supplies the planned content digests to the native file scan. Only
  matching candidates must be confirmed; an unrelated pending file cannot block
  a confirmed match. Repository/adapter tests also verify that matching saving,
  saved-on-device and rejected files still prevent duplicate upload or source
  creation.
- The removal attempt guard now protects preflight only. A confirmed deletion
  always reports refusal and replaces its optimistic success with the failure;
  neither success nor refusal replaces a newer removal dialog. Tests cover a
  newer active/cancelled dialog and a cancelled preflight completing late.
- Delete and F2 require a library row and exclude toolbar, menu and row-action
  controls. Pane-wide navigation remains available. Unit tests check both
  boundaries, and the browser library gate sends real Delete/F2 keystrokes to
  Add source and verifies unchanged focus with no removal dialog.

Follow-up validation passes `rpnpm lint`, `rpnpm typecheck` and `rpnpm test`.
The Reader suite passes all 198 files / 1,077 tests, including a fresh Reader-only
run after the final test-harness and shortcut refactor. The architecture gate
retains only the existing `create-follow-through.ts` cohesion warning.

The final production build and strict preview on 5193 pass `pnpm test:polish`
from `apps/reader`: all eight desktop/phone, light/dark, normal/reduced-motion
cells pass, including real Delete/F2 keystrokes on Add source. Every cell has an
empty page-error array. One-minute host load was 14.10 at the start and 14.68 at
the end; neither timing nor scroll thresholds were changed. The owned preview
is stopped. No LAB desk, production or staging was used for this follow-up, and
there are no new product strings or catalog changes.
