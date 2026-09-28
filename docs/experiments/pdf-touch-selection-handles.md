# PDF touch-selection handles

Deployment candidate on `prototype/pdf-touch-handles`. Not deployed or merged.

## Assessment

Custom handles are viable with EmbedPDF 2.15.0's public selection and geometry APIs;
no fork, private plugin mutation, or replacement PDF renderer is needed. The
implementation works in Reader's real `PdfViewerSurface`, not a mock PDF viewer.
The real mobile workspace, highlight toolbar, save pipeline and reload path are
also covered by an automated audit using disposable in-memory storage.

Code and automated checks are prepared for deployment; this is not a claim of
native-quality phone interaction. The remaining manual acceptance check is
on actual Android Chrome and iOS Safari,
including a finger obscuring small text, pinch zoom, interrupted gestures, and
representative research PDFs.

## Behaviour

- Existing long-press selects a word. Start/end handles remain after release.
- 44px hit targets surround smaller visible knobs; grabbing off-centre doesn't
  jump the endpoint. The start knob sits above the text, the end below it.
- Either endpoint can shrink/extend the selection or cross the other; the
  opposite endpoint stays anchored. Pointer capture stays with the same DOM node.
- Handles follow PDF zoom, rotation, viewport resize and scrolling. Glyph indices
  remain the source of truth; coordinates aren't inferred from canvas pixels.
- Proportional, frame-rate-independent edge scrolling can extend into other pages.
  Geometry is loaded on demand; the additional cache is bounded to eight pages.
- Touches on handles bypass both the long-press recognizer and native PDF selection.
  A fresh touch on page content dismisses immediately and allows normal panning.
  Toolbar/copy buttons are not treated as page-dismissal touches.
- Cancel/lost capture, window blur and document hiding stop auto-scroll and retain
  the last applied range. An external selection change also ends the gesture,
  rather than letting its next animation frame overwrite the new range.
- Arrow keys adjust a focused handle by a character within the page; Escape clears.
- Mouse-first viewers keep the existing desktop behaviour and don't get handles.

## Integration and safeguards

`pdf-touch-selection-handles.ts` installs ahead of the existing long-press adapter.
`pdf-touch-selection-view.ts` owns the overlay and its only DOM dependency:
EmbedPDF's relative, pixel-sized, auto-margin Scroller element. The overlay lives
inside that content box so browser scrolling and clipping remain authoritative.
If that structure changes, handles fail closed instead of appearing at guessed
positions. Recheck this adapter on EmbedPDF upgrades.

The public `setSelection()` API does **not** emit `onEndSelection`. An explicit
adjustment start/end event hides Reader's old selection toolbar while dragging and
publishes the final quote and geometry after the engine task settles. Older text
reads are invalidated on any selection change, adjustment start, or teardown.

`pdf-selection-writer.ts` serializes asynchronous range writes and coalesces moves.
If a range task completes after a newer external dismissal/selection, that newer
state is restored rather than resurrecting the obsolete range. The returned engine
task's abort alone would not cancel its underlying geometry callback. A move that
arrives between flush completion and promise finalization is drained before the
highlight toolbar is re-enabled, not silently dropped.

The overlay reuses its mounted content box rather than scanning the PDF DOM on
every pointer frame. Failed geometry reads are not retried every animation frame;
a new gesture may retry.

Two failures found by browser tests informed the design:

1. EmbedPDF's layout event can omit zoom-only changes. A ResizeObserver on the
   content overlay is also needed to update endpoint placement.
2. EmbedPDF's post-double-click interval can ignore a blank tap after long-press.
   Reader explicitly dismisses on a fresh non-control touch inside the PDF.

## Reproduce

From this worktree:

```sh
pnpm install --frozen-lockfile
pnpm --filter @mdbase-reader/app exec playwright install chromium
pnpm check
pnpm --filter @mdbase-reader/app test:pdf-touch
MDBASE_ENV=production pnpm build

# Optional interactive fixture:
pnpm --filter @mdbase-reader/app exec vite --host 127.0.0.1 --port 5197 --strictPort
# Open http://127.0.0.1:5197/test-fixtures/pdf-touch-handles.html
```

`test:pdf-touch` starts an owned Vite server on an ephemeral loopback port, runs
both the gesture and actual-workspace audits, then closes the server. Each audit
closes its own browser, including on assertion failure. CI runs this command as a
deployment prerequisite. It does not use LAB, accounts, Connect, real library
documents, or the user's desktop/browser profile.

For the individual audit scripts, `READER_AUDIT_ORIGIN` may point to an already
running explicit loopback port.

The dev-only fixture generates a two-page PDF locally and uses Reader's actual
surface/runtime. “Save highlight” checks the final draft and displays an annotation
through the real decoration API; it does **not** persist to a Connect collection.
The additional workspace audit saves via Reader's actual annotation pipeline to
an in-memory gateway fixture and verifies the quote, quads, revision and loaded
decoration after a full reload. It does not claim live Connect persistence.
Both audits route the PDFium WASM request to the copy in the locked viewer package,
so their PDF rendering does not depend on CDN availability.

## Verified by automation

Full workspace `pnpm check` passes (lint, formatting, architecture, typechecking,
and tests), as does the full production-targeted workspace build. The PDF package
has 65 passing tests, including 26 new tests for this change. The gesture and
mobile-workspace audits pass with no uncaught page errors.

Chromium mobile emulation, 390 × 844, with browser-dispatched touch input (not
synthetic DOM pointer events):

- Hold/release selects “Alpha”; independently extend/shrink both endpoints.
- Cross endpoints, then extend across lines.
- Adjusted quote is published only after release; fixture save uses it and clears
  the selection; a PDF annotation is rendered.
- Keyboard adjustment and Escape; zoom to 150%; rotate 90°, 180°, 270° and adjust.
- Edge auto-scroll crosses onto page two while the first endpoint stays on page one.
- Touch cancellation, a dispatched window-blur event and an external selection
  replacement settle the gesture; blank tap dismisses; ordinary swipe scrolls
  without selecting.
- Separate mouse-first context still double-click-selects without touch handles.

Unit tests cover coordinate round trips at all rotations and several scales,
endpoint crossing, edge velocities, missing geometry/DOM, focus retention,
publication races, coalescing, external dismissal during geometry loading, and
teardown. The browser script writes screenshots to the printed private `/tmp`
evidence directory and fails on uncaught page errors.

## Not established / limitations

- No physical-phone or iOS/WebKit acceptance yet. Chromium mobile emulation is not
  evidence of native Android/iOS gesture feel or Safari's touch arbitration.
- No magnifier, haptic feedback on endpoint movement, or word-snapping refinement.
  Adjustment is character-based using EmbedPDF hit testing; empty space keeps the
  last valid endpoint. Keyboard adjustment currently stops at page/zero-sized-glyph
  boundaries rather than navigating across pages.
- RTL, vertical writing, mixed-direction text, multi-column reading order, scanned
  PDFs without OCR, and very large/slow documents have not been qualified. Geometry
  and reading-order quality remain dependent on the PDF engine.
- Multi-page range adjustment works, but Reader's **existing** multi-page draft
  mapping remains quote-only (no invented single-page quads). This prototype does
  not add durable multi-page highlight geometry to Reader's annotation model.
- Live Connect saves have not been acceptance-tested; the workspace regression
  uses a disposable in-memory gateway. Real-phone testing should include the
  mobile toolbar and reading-chrome layout transitions.

## Rollout

The feature is enabled for coarse-primary-pointer viewers only; there is no schema
migration or dependency upgrade. Test-only entrypoints are not production build
inputs. Merge through the normal PR/CI path; do not bypass the existing clean-tree
and main-branch deployment guards. A main push can automatically deploy LAB, so
preparing/pushing the feature branch is not permission to merge or deploy it.

Before production promotion, smoke-test on a physical Android/iOS device:

1. Hold a word, release, adjust both handles, cross them, then save and reopen.
2. Scroll near a page edge; zoom/pinch and rotate; confirm normal swipes still pan.
3. Switch apps or cancel a gesture; confirm scrolling stops and no stale toolbar
   can save an earlier range.
4. Check a representative multi-column research PDF. Multi-page annotations retain
   the existing quote-only limitation described above.

Rollback is a revert of this feature commit and a normal guarded redeployment;
existing saved annotations need no conversion.
