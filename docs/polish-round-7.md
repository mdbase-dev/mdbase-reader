# Reader polish round 7

## Scope and acceptance boundary

Branch `polish-r7`, based on `bc75b8a0160d27e3bc68f28bcd621ef224b126d8`.
The council round-7 plan and subsequent owner rulings control this implementation.
This is implementation evidence, not a new council score or permission to merge/deploy.
No production/staging account, mutation, service, deployment, native wrapper, screen reader,
or physical phone was used. Finite checks run through `rpnpm`; browser suites run locally.

The important remaining findings are **Stop during commit still strands the upload lane in
beta.157**, **Pages-style precache still logs two failed online requests**, and **the
large-annotation regression has a budget-enforcing test authority, not a live runtime
fixture**. Do not interpret the SDK repin as complete round-7 acceptance.

## Plan dispositions and measurements

“Done” below means the implementation and named local proof, not all post-merge LAB
acceptance. Historical council timings are explicitly identified, not presented as fresh
measurements. Original local baseline measurements are in
`/home/calluma/evidence/mdbase-reader/pr-135-round7/baseline-local.json`.

Raw artifacts are kept outside this repository at
`/home/calluma/evidence/mdbase-reader/pr-135-round7/`. All 35 original files were
relocated with SHA-256 verification; no raw evidence is part of the branch history.
The polish harness does not default to `docs/evidence/`: browser artifacts use
`TMPDIR`, and LAB boot strips require explicit `READER_BOOT_OUTPUT`. Use the ignored
worktree `.tmp/` directory for both while running, then move retained evidence out.

## Review follow-up

- Sync incident copy now derives from the pending and rejected inventory rather
  than treating an incident as proof of pending writes. The incident is context:
  rejected-only, mixed, pending-only, and empty inventories have separate tests.
  The six-test save-status suite failed 2/6 against `a187d35e7` (rejected-only and
  mixed inventory) and passes 6/6 after the change. No inventory is mutated.
- **Single-source annotation isolation remains blocked, not fixed.** The current
  implementation still resolves unrelated annotations: a temporary reproduction
  measured 1,501 exact-path resolutions for 1,501 annotations with one relevant
  row, and an unrelated budget refusal still rejected the healthy source's list.
  Whole-collection refusal also propagated. The reproduction and log are retained
  outside the repo alongside the raw evidence, not as a passing regression gate.
  SDK beta.157's source at
  Connect `493d29ca` explicitly lists `backlinks` as unserved by the native frame
  dispatch (`runtime/packages/sdk/test/runtime-method-contract.test.ts`). Its
  runtime-method manifest pins runtime `3e433313e0a234513478789686a4f4274e4dd76c`.
  Do not ship a Reader call to that method based on a MemoryReplica-only test.
  `linksTo("source", path)` uses `asFile()` and does not lower to an indexed
  source-field candidate. `file.hasLink()` cannot provide that guarantee either:
  the pinned runtime deliberately disables link-index candidate pruning when an
  ID field is configured (`runtime/crates/core/src/query/lower.rs`, `links_to`).
  Both take the request-wide budgeted projected path; paging is not a fix. A
  bounded canonical inverse-source lookup needs runtime support. Reader must not
  guess link targets, ignore unrelated failures, or silently return partial rows.

Follow-up validation: `rpnpm lint`, `rpnpm typecheck`, `rpnpm test`, and
`rpnpm i18n:check` pass. Reader has 1,102 Vitest and 55 script tests; Connect has
324 and the extension 332. The fresh LAB build passes with 164 precached assets.
The full local `test:polish` passes: original 8/8 matrix, round-6 checks, 4/4 focus
tests, and round-7 8/8 matrix. All 222 one-second load samples stayed under 20;
maxima were 11.02 / 9.41 / 9.05. Follow-up logs and browser artifacts are archived
outside the repo with the original evidence. No new LAB desk was created and no
live-runtime isolation proof, production build, feedback build, PDF-touch suite,
or deployed-worker qualification was run for this follow-up. The preview was
stopped and owned temporary files removed before handoff. Prior validation below
is the original round-7 baseline, not a claim that those extra gates were rerun.

| Item                          | Disposition                                    | Before → after; evidence                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1.1 Stop then Retry          | **Not done upstream**                          | Beta.157 candidate on LAB: same-file retry fails with `ATTACHMENT_UPLOAD_SCOPE_CHANGED`; different-file attempt in the same session fails before transfer. The SDK source comparison below explains why. Reader sends AbortSignal and starts a fresh attempt; no SDK workaround is added. Stop copy no longer promises nothing was added.                                                   |
| W1.2 Connected failure copy   | Done locally                                   | “Reconnect” while Connected → known-not-added says “This file wasn’t added. Close this and try again.” Unknown remains unknown. Dialog regression tests and the live beta.157 failure exercise this path.                                                                                                                                                                                   |
| W1.3 Stuck pending changes    | Done seam; refusal LAB pending                 | No bound for a disconnected pending item → real Reload action at 30,000 ms, tested absent at 29,999 ms and present at 30,001 ms. Existing SDK incidents override Syncing with “Changes need attention”; pending stays pending, with its service code/reason. No parallel state or new rejected receipt. Arrival/drain of the SDK inventory is covered; live append-refusal recovery is not. |
| W1.4 Offline/reconnect        | Done locally                                   | Required a write to notice offline → native browser offline event updates the header immediately. Reconnect clears the old add-source error. Hook tests exercise both transitions without waiting for a write. No numerical network-latency improvement is claimed.                                                                                                                         |
| W1.5 Details                  | Done locally                                   | Raw boundary/upload jargon → stable code plus a plain sentence. `ATTACHMENT_UPLOAD_SCOPE_CHANGED` is shown with an actionable explanation in the live failure. Unknown outcomes retain uncertainty.                                                                                                                                                                                         |
| W1.6 Waiting/progress         | Implemented; live timing **not proven**        | Council reported 3.5–4.3 s Waiting in a 6.7 s add; that split was not remeasured. Reader retains actual transferred-byte progress through completion and displays pending only once bytes are transferred. Phase regression tests cover transfer/create/failure. The beta.157 post-reload add took 6,645 ms end-to-end; this is not a Waiting-time measurement or a speedup.                |
| W1.7 Reload-write LAB harness | Done; one candidate pass                       | No registered live write check → `pnpm --dir apps/reader test:lab:write` tests Stop/same file, Stop/different file, and reload/write. Exact beta.157 candidate passed reload/write once in 6,645 ms, then removed its source note. This is same-origin candidate interception, not deployed-SW acceptance.                                                                                  |
| W2.1 Single boot              | Done, LAB n=3                                  | Second feature skeleton in 3/3 baseline reloads → 0/3 with beta.157. Collection name remains continuously visible once known. Final SDK candidate reached six rows at 5,624 / 4,311 / 4,094 ms. No faster-boot claim. Frame strips and sampled JSON are retained.                                                                                                                           |
| W2.2 Sidebar entrance         | Done, LAB n=3                                  | Baseline restored rail grows about 164→260 px with translated frames → 260 px from its first visible sample, identity/no transform in all three beta.157 runs. Restored layout no longer runs the sidebar entrance.                                                                                                                                                                         |
| W2.3 All sources              | Done, LAB n=3                                  | Fresh baseline measured y=108→86 (22 px, not the plan's estimated 12 px) → y=86 throughout every visible beta.157 sample. Loading status is screen-reader-only. No unsupported 227 ms timing claim.                                                                                                                                                                                         |
| W2.4 Notes first open         | Done locally                                   | Lazy Notes module can change the opening path → idle preload of the existing Notes and Citation modules. Browser effect samples check first/later opens use transform, 220 ms, `cubic-bezier(0.22, 1, 0.36, 1)`.                                                                                                                                                                            |
| W3.1 Shortcut sheet           | Done locally                                   | Baseline lists 10 shortcut rows and focuses heading → contextual library/reading/workspace keys, Close outside the scrolling list, dialog focus. Real keyboard and hit-test assertions cover the Close footer. J/K remain library-only, deliberately absent from viewer bindings.                                                                                                           |
| W3.2 Focused-source palette   | Done locally                                   | Palette used the open-document source → library commands use the focused row. Searching “status” offers that row's Set status action. Views group is “Library views”; no second selection state.                                                                                                                                                                                            |
| W3.3 Tab order                | Done locally; final browser results below      | Baseline real tabwalk 21 stops → 8 desktop, 7 phone (gate remains under 10). Header cells and the main header use roving stops; mode switch is one stop. The regression checks the actual keyboard path, not the number of focusable DOM descendants.                                                                                                                                       |
| W4.1 Toast motion             | Done locally                                   | Effect did not expose the intended curve/rise → actual translate transition 220 ms, shared curve, keyframes `0px 8px`→`none`; sampled on `.highlight-saved`, including reduced-motion coverage.                                                                                                                                                                                             |
| W4.2 Select motion            | Done locally                                   | Old chevron/quiet-select curve → shared `cubic-bezier(0.22, 1, 0.36, 1)`. Tests inspect computed curves and the chevron's live animation effect.                                                                                                                                                                                                                                            |
| W4.3 Phone rows/status        | Done locally                                   | Existing root disclosure gutter → root source titles at x=16, without losing the 44×44 disclosure target. Pending header no longer duplicates “S.”/Syncing alongside the inventory count. Baseline phone x=334 in the scratch JSON was not a trustworthy root-title comparison and is not used as a claimed 318 px improvement.                                                             |
| W4.4 Phone pending/toast      | Done locally; pending final SDK recheck needed | Pending panel uses full-width/old gutter → 16/16 px; a pre-repin candidate measured this on LAB with one pending item and no redundant header status. Final beta.157 boot had no pending disclosure, so it cannot re-prove that geometry. Long phone toasts are clamped to two lines, width 358 px at viewport 390.                                                                         |
| W4.5 Continue/glyphs          | Done locally                                   | Card measured 124 px → 88 px. Open/recent sidebar entries now use the same file glyph instead of textual format badges; nav glyphs remain 14 px and short-list file glyphs 16 px. No unsupported eight-size inventory claim.                                                                                                                                                                |
| W4.6 Split clipping           | Done locally                                   | No clipped-column fade → 12 px fade while content remains offscreen. Regression drags a real Dockview sash, asserts actual overflow, then scrolls to the end and requires the fade to clear.                                                                                                                                                                                                |
| W4.7 Root error               | Done locally                                   | `Uncaught Error:` prefix → plain Reader root error; the browser failure fixture exercises it.                                                                                                                                                                                                                                                                                               |

## Annotation budget

The removed collection-wide resolved projection selected all annotation sources in one
runtime request. `pageSize: 500` did not reduce that request's full-source budget.
The replacement ordinary `reader-annotation` discovery has **no select or projection**;
source resolution uses an authoritative exact `file.path` scope per annotation, at most
four concurrent requests, with an initial batch of 16 and subsequent batches of 64.
All-source lists/counts/indexes and per-source lists share this path. No Reader link
resolver, guessed ID/path, budget increase, or partial-list success fallback is added.

The budget-enforcing regression reproduces the old failure with 600 × 2,048-byte
annotations (1,228,800 bytes), and with 1,501 records (3,074,048 body bytes). It then
requires all 600/1,501 annotations and matching counts from the replacement. Selected/
projected requests must have exact path scopes. Native `too_large` with reason
`query_budget_exceeded` is normalized before panel rendering and translated through
the existing error path: open one source's Notes, retry, then contact support.
Failures propagate rather than pretending an overview is complete.

This is **not** a real-runtime large-fixture reproduction. A single annotation plus
its linked source can still exceed the runtime budget; that needs narrower content
or an upstream runtime change and is reported plainly. Resolving every record adds
RPCs, so this change does not claim faster large-collection counts.

## Owner stripe ruling

Removed the All sources active left inset, selected row/card bars, rounded annotation
and citation/composer quotation rules, extension problem-card stripe, thumbnail spine,
column-drag edge shadows, active dock-tab underline, Notes and extension tab pseudo
underlines, and superseded pane/bookplate stripe declarations.
Selected/active items use the existing `--selected` plain fill. A discovered
`--active` reference was undefined and is replaced, not patched with a new token.

Kept neutral 1 px pane/table dividers, full uniform focus rings, bullets/checkmarks,
and the square **in-document HTML blockquote** reading rule in
`packages/renderer-html/src/html-document.ts` (2 px). It is reading content, not a
rounded card/callout. No in-app rounded-card reading rule is retained.
The active-nav regression requires an opaque fill, no edge/shadow/pseudo bar, and
foreground contrast of at least 4.5:1 in both themes. The settled All sources fill
measures **5.87:1 light / 6.38:1 dark**, with no shadow, edge border or pseudo bar.
Measurements wait for actual finite transitions, not a fixed delay. The original
S/Escape/immediate-A gate remains 20 real keyboard trials; opening the status picker
now reveals it within the table scroller without scrolling the outer pane. All 20
pass. A separate 12/12 pointer regression keeps row context menus open while the
install prompt is visible. The outer Dockview pane uses `overflow: clip`, so focus
cannot programmatically scroll it, and the attach boundary finishes reconstructed
pane-geometry transitions before the first interaction. User-triggered Notes motion
still measures 220 ms on first and subsequent opens. An additional 30 fresh-load
status-picker diagnostic trials passed; the registered 20-trial gate is unchanged.

The extension's selected tab measures **14.11:1 light / 10.53:1 dark**, also with no
edge, inset stripe, or pseudo underline. This uses the actual built extension CSS in
a loopback fixture, not an installed-extension or native-wrapper acceptance run.

## SDK intake and upstream mismatch

Reader, extension, and Connect production dependency use exact npm
`@mdbase-dev/sdk@0.1.0-beta.157`. LAB/staging use the repository vendor file path;
`pnpm-lock.yaml` follows those exact pins. `@mdbase-dev/ui` remains beta.149.
All three originals retain their Sigstore bundles and verified receipts.

| Environment         | Archive                               | SHA-256                                                            |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| LAB                 | `sdk-493d29ca-lab-beta157.tgz`        | `927cc688a22d0931207d9108b53958e3279f2d2d711342b04ac80c02d8091e26` |
| Staging             | `sdk-493d29ca-staging-beta157.tgz`    | `3efb7888ef59b6449ecff7c717b123dfaf94b3ae6257bcae4f1e7113a82a0d4c` |
| Production original | `sdk-493d29ca-production-beta157.tgz` | `c44bce54c56239a6489e3f909638a8b900e48e41d286d77e9d9732c7172d199c` |

Verification checked release-asset digests, npm SHA-512 integrity, DSSE subject
digest, source commit `493d29ca2a3494c5d59677e8b83e309b44a28c31`, OIDC issuer
`https://token.actions.githubusercontent.com`, and the main-branch
`publish-sdk-npm.yml` workflow certificate identity (transparency/CT thresholds 1).
Embedded runtime is `3e433313e0a234513478789686a4f4274e4dd76c`.
The exact installed inventory is 903 original files (previously 900), verified from
the new archive, not an increased tolerance. Historical native approval originals
and protected hashes are unchanged; the npm candidate is not native qualification.

On November 7, 2026 (Melbourne), Connect PR #1226 was still **open** at
`ac89c0f195033085cd497266660adb7e04c7233f`. Its `files.ts` unconditionally calls
`abortUpload` on a failed/cancelled commit; beta.157's published source still calls
it only when `!phase.committing`. This is why beta.157 fixes the old K1 warm-reopen
defect but is not evidence of the later Stop cleanup fix. No Reader workaround is
appropriate. The refusal-incident seam consumes the existing SDK status and is ready
for the upstream incident implementation; beta.157 alone cannot prove that behavior.

Beta.157's `WriteLedgerEntry` still exposes mutation ID, affected record/file IDs,
creation time, state, and optional problem, but no title or operation descriptor.
Reader preserves the existing title lookup for IDs already present in its source
inventory. A pending create whose source has not appeared can still be unnamed;
title plus operation for that case remains an upstream SDK need. No Reader-side
pending ledger or inferred success is added.

The installed beta.157 application builds collection-specific Manage access URLs
using `/access?collection=<encoded id>`. Reader keeps the existing SDK UI path;
no parallel Reader access link is added. A live click destination remains to check.

## W6.3 precache

Beta.157 build verifies 164 exact precached assets, including lazy chunks, workers,
and WASM. The local offline audit passes shell reload and previously unvisited HTML,
settings and citation features, with no page exceptions. The Pages-redirect audit
also reloads offline with HTTP 200 and caches `index.html`/`404.html` as HTTP 200.
However, it still logs **two online failed requests**, `/index.html` and `/404.html`;
the additional `/` failure is the deliberately offline navigation. W6.3 console
cleanup therefore **remains needed upstream**. Reader adds no suppressing fallback
and does not claim these errors are fixed by the repin.

## Validation and post-merge LAB

Finite gates pass through `rpnpm`: `lint`, `typecheck`, `test`, `i18n:check`, the LAB
Reader build, and the full `build:production` (including the extension). Workspace
tests include 1,099 Reader Vitest tests plus 55 Reader script tests, 332 extension
tests, and 324 Connect tests. Architecture remains under its unchanged limits:
794 production files, 1,459 relative imports, 18 packages; the existing
`create-follow-through.ts` 1,003-line cohesion warning remains.

The final `test:polish` run passes the original **8/8** desktop/phone × light/dark ×
normal/reduced-motion matrix, round-6 checks, all **4/4** focus regressions (including
20 keyboard and 12 pointer trials), and the round-7 **8/8** matrix. All three sampled
load averages stay below 20: maxima **12.99 / 10.33 / 11.61**. Raw measurements and
one-second load samples are retained in `/home/calluma/evidence/mdbase-reader/pr-135-round7/local-polish.json`
and `local-polish-load.json`. Earlier failed or overloaded attempts are not green
timing evidence.

The remaining CI browser gates also pass locally: `test:pdf-touch`, `test:html-svg`,
and `test:feedback`. Feedback uses the same LAB/loopback build configuration as CI,
through the registered `build:feedback-test` command so the finite build runs on
`rpnpm`; every delivery is intercepted and no message is sent. The SDK remains
beta.157 in every build. Production generation is checked separately; no native,
production-account, or staging-account qualification is claimed.

The saved candidate LAB boot strip reached six rows at 5,624 / 4,311 / 4,094 ms,
without a feature skeleton in any of three restored boots. Rail width stays 260 px;
All sources stays at y=86 rather than y=108→86 (the measured baseline jump is 22 px,
not the plan's 12 px). These are not comparable speed measurements: the baseline
used deployed old UI while the candidate used same-origin local response interception.
A later strip ended above load 20 and is excluded from timing acceptance rather than
substituted for the saved valid strip. The saved LAB strip predates the final
focus-only pane-geometry fix; the final branch is locally validated, not a new
deployed-LAB boot qualification.

After merge and normal owner-controlled LAB publication:

1. Confirm the served SDK receipt and service worker use this beta.157 artifact;
   repeat three restored boot strips and offline/PWA-update checks without interception.
2. Run `READER_LAB_CDP=http://127.0.0.1:<desk-port> pnpm --dir apps/reader test:lab:write`
   from an owned GCP LAB desk with the registered test account, a disposable `[test]`
   collection, and a drained ledger. Repeat after an SDK actually containing #1226.
3. Reproduce a refused append and verify pending inventory, incident reason/service
   code, backoff, recovery, and no fabricated rejection; keep the browser's journal.
4. Populate a sufficiently large real annotation fixture, verify complete Notes/
   overview/counts, and test the single-record budget error without incomplete success.
5. Check collection-specific Manage access by clicking the actual SDK control; recheck
   phone 16/16 pending geometry with beta.157 and a real pending item.

The LAB lane used only `gcp/reader-r7`, alias `lab-next-acceptance`, and `[test]` names,
against health revision `13985458d3a7a0d069622cee6bc3b4b75a531ca6`.
The first live run was invalid candidate evidence because a service worker supplied
old deployed UI; it is excluded. The next run bypassed the worker, attested the
candidate SDK receipt, and produced the saved `live-beta157.json`. This bypass means
it is not deployed-service-worker acceptance. Owned source notes were removed when
visible; exact possible retained originals are listed there and are not silently
declared deleted. The preexisting six sources were not removed or edited.

The owned GCP desk was destroyed after saving its partial-outcome summary; no other
desk was used. Additional unconfirmed owned leftovers from earlier attempts are
`[test] reader-r7-1793963611037` and the
`[test] reader-r7-1793970490246 {stop-retry,stop-before-different-file,post-reload}.html`
originals. The initial pending mutation
`01a1b096-f456-70b9-b26a-12fd38757000` was not proven drained. Browser data was never
cleared as a recovery action. Saved-file reconciliation requires the collection
owner's authority; source-note removal is not proof of file deletion.
