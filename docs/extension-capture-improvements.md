# Extension capture and highlighting improvements

## Behaviour

- Capture and destination discovery are read-only. Saving is an explicit action after choosing a
  collection, title, tags, and optional Markdown source note. Existing sources keep their metadata.
- Both the toolbar and HTTPS selection context menus capture the selected passage. A highlight can
  include a comment and create its source first, without switching to Reader.
- Highlight creation reads the saved primary/readable HTML, verifies its SHA-256 revision, and
  uniquely locates the quotation there. Saved quote context and document identity belong to those
  verified bytes, not a newly extracted version of an existing URL.
- Partial completion is visible: a saved source stays saved even if annotation creation or live-page
  projection fails. Failed comments remain in memory. Double submits are locked out, and retries
  within the popup retain annotation mutation/record identities and check for an already committed
  annotation before creating another.
- Live highlights use CSS Highlights rather than `Range.surroundContents`. They do not split text,
  remove links/formatting, or invalidate later ranges. Repeated display replaces only Reader's own
  highlights. Whitespace matching retains the original saved quotation; prefix/suffix context can
  disambiguate repetitions. Ambiguous/missing matches are counted rather than guessed.
- Projection checks the tab URL before and inside injection. Script helpers are nested inside the
  injected entry point because Chrome serializes the function, not its module closure.
- Saved-copy links carry both `collection` and `source`. Reader waits for streamed library results,
  opens the requested source once, and reports an unavailable source without selecting another one.
- The popup supports system light/dark colours, explicit labels, keyboard controls, live status,
  and connection recovery even when initial registration fails.

## Origin failure

In the LAB browser, the same extension request with the default `same-origin` credential policy
returned HTTP 403 `origin_denied`; with `credentials: omit` it reached request validation. Chrome's
host permission allows ambient portal cookies to accompany extension requests. Connect correctly
rejects account-cookie requests from an extension origin.

The extension entry point now wraps its own realm's fetch to explicitly omit cookies. This does not
modify the SDK's bearer/proof headers, the website's fetch, or server origin/security policy. Human
approval remains required. Device authorization gets a ten-minute human-interaction budget rather
than a short RPC deadline.

## Validation

Run:

```sh
pnpm --filter @mdbase-reader/extension test
pnpm --filter @mdbase-reader/extension typecheck
pnpm --filter @mdbase-reader/extension build
pnpm --filter @mdbase-reader/app exec vitest run src/SourceDeepLink.test.tsx
```

With an owned LAB browser lease and its environment loaded:

```sh
node apps/extension/scripts/audit-highlights.mjs
```

The Chromium audit exercises single, cross-inline, same-text-node, overlapping, whitespace,
ambiguous and context-disambiguated quotes. It also verifies repeated rendering leaves page content
and other applications' highlights unchanged. It creates and closes only its own page and never
closes the shared browser.

Unit tests cover explicit-save behaviour, destination changes without writes, recovery UI, draft
retention, double-submit protection, partial success, metadata creation, duplicate-source reuse,
revision mismatches, missing quotes, unknown annotation receipts, credential isolation and source
links. Core and Connect repository suites cover the new optional initial body/tags import fields.

### Live LAB result (2026-09-23)

The built extension captured an MDN article and its selected passage. Registration advanced past the
original origin rejection into ordinary device approval. A disposable hosted collection was created
for acceptance testing, but Connect rejected setup approval with:

> Contract setup may only configure missing contracts.

Testing stopped at that setup guard; it was not bypassed. End-to-end source/highlight persistence in
LAB is therefore **blocked**, not a claimed pass. The disposable collection was deleted and its
absence verified. No production collection was touched. No Connect or Reader deployment was made.
The receiving Reader app must be built/deployed with the deep-link changes for remote source links
to open the exact document.

## Remaining boundaries

Selection capture currently targets the top-level page, not cross-origin embedded frames. Live
highlights are a projection, not the canonical annotation. Draft comments are not persisted across
forced reloads or popup closure. Same-popup retry identity is not cross-window atomic deduplication.
Missing passages in Readability's saved copy require opening that copy in Reader and selecting the
intended text there; Reader will not silently substitute the live page or overwrite the archive.
