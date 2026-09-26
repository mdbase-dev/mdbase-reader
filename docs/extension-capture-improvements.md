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

## Side panel, citations and page status (2026-09-24)

- The UI is a per-tab side panel (`chrome.sidePanel`), opened from the toolbar, **Alt+Shift+S**,
  **Alt+Shift+H** or the selection context menu. A small injected listener reports
  `selectionchange` to the panel, which then reads only the selection, not the whole document.
  Navigation of the tab ends `activeTab`; the panel says so and re-reads the page on the next
  invocation.
- Drafts (title, tags, notes, highlight comment, colour, tags and the selected passage) are kept in
  `chrome.storage.session` per tab and normalized page URL, and removed when the tab closes.
- Connect grants and Reader's mutation journal live in `chrome.storage.local` behind a synchronous
  `Storage` mirror, so the service worker and panel share them.
- `SourceRepository.findByUrl` and `findByCitekeyPrefix` query `reader-source` records in the
  store (`url`/`original_url` contain a host+path key; `csl.id` prefix) instead of paging through
  the library. `normalizedSourceUrl` in core drops tracking parameters, `www.`, AMP variants, the
  AMP cache host and trailing slashes, and orders remaining parameters.
- Anchoring a live-page selection in the saved copy scores repeats by agreeing prefix and suffix
  characters; the best repeat is used only with at least four agreeing characters and a strict
  lead over the next. Equal scores remain ambiguous.
- Citation: DOI from `citation_doi`, PRISM, Dublin Core, JSON-LD, the URL (doi.org, `/doi/…`) or
  arXiv (`10.48550/arXiv.<id>`), resolved through doi.org content negotiation (CORS-enabled; the
  request carries only the DOI and omits credentials). Registry bookkeeping (`reference`,
  `license`, `indexed`…) and invalid fields are dropped so the result validates as Reader CSL;
  embedded tags fill gaps and are the fallback. Only new sources receive a citation; a failure to
  store it is reported without undoing the saved source.
- PDFs in Chrome's viewer (`document.contentType === "application/pdf"`, or a `.pdf` URL that
  cannot be scripted) are downloaded by a script in the tab, capped at 40 MB, and imported as PDF
  sources with their URL recorded for later duplicate checks.
- Open shadow roots are flattened into the captured DOM with slotted light content in place.
- Page status is opt-in and holds the optional `https://*/*` permission only while enabled.

Validation: unit suites in core (`source-url`), connect (`source-lookup-repository`), web-capture
(`scholarly-metadata`, including a real Crossref response) and the extension (storage, drafts,
opt-in, manifest, capture, anchoring, writer, controller and UI). A Playwright Chromium smoke run
loaded the built extension and exercised the real panel page against fixture publisher and PDF
pages: service-worker start, DOI citation preview, live selection, draft restore after reload and
PDF recognition, with no console errors. That run granted host access in a test copy of the
manifest in place of `activeTab`, and did not sign in to Connect, so saving, citation storage and
the page-status badge were not exercised end to end.

## Highlighting and saved-page UX (2026-09-26)

- **One-step highlights.** A live selection shows five colour buttons; choosing one saves the
  highlight (creating the source first on a new page) with any comment and tags typed beforehand.
  Keys `1`–`5` do the same and `Esc` clears the selection, except while typing in a field.
  Ctrl/⌘+Enter still saves in the current colour. The "Save this highlight" checkbox is gone;
  **Clear** saves the page without the passage. The last colour used is remembered in
  `chrome.storage.local` for the next highlight on any page.
- **Quick save.** The context menu's _Save highlight_ and Alt+Shift+H save without further input
  once the panel is ready: connected, the page's existing source looked up, its citation settled.
  The request is used up then, saved or not, and lapses after a minute. _Highlight with a comment_
  only focuses the comment field.
- **Saved highlights on opening.** When the panel opens on a saved page it draws that page's
  highlights and marks the toolbar button (count, or ✓) for the tab. This uses the `activeTab`
  grant from opening the panel, not the opt-in page-status permission. The background worker
  clears the mark on every page load, including pages the extension cannot read.
- **Highlight list.** A saved page lists its quoted highlights, each with its colour, comment and
  tags, and whether the live page could show it (_Not found_ / _Matches several places_). Pressing
  a shown quote scrolls the page to it and underlines it for 2.5 s. **Edit comment** rewrites
  only the comment after the saved blockquote (`updateAnnotationBody`); **Delete** first plans the
  deletion and confirms inline, naming how many notes link to the highlight. Connect exposes no
  colour update, so colour is changed in Reader.
- **Compact collection.** Once connected, the panel shows _Saving to <collection> · Change_; the
  selector, _Connect another collection_ and direct-access controls are behind **Change**.
- **Following the tab.** With the opt-in page access on, an open panel reads the new page after
  the tab navigates, starting a fresh draft for it; without it, the panel asks to be invoked again
  and says how to turn following on.
- **One status line.** Problems keep their recovery actions and take precedence; otherwise the
  panel shows only the most relevant of progress, notice, saved state or a restored draft. The
  origin-check explanation sits under _Technical details_.
- **Tag suggestions.** Tag fields suggest existing spellings for the tag being typed (Tab or click
  accepts). Connect has no tag index, so the suggestions come from tags saved from this browser, the
  page's highlights and the first 200 sources of the collection, loaded when a tag field is first
  focused.
- **Diagnostics** appear in the panel only when enabled in Settings → Troubleshooting. Recording
  still happens in the panel, because timings are kept in its memory.
- **PDFs.** After saving a PDF, _Open in Reader to highlight_ is the panel's main action.

## Remaining boundaries

Selection capture targets the top-level page, not cross-origin embedded frames or text inside
shadow roots (capture includes it; the live selection index does not). Chrome's PDF viewer does not
expose selections, so PDFs are highlighted in Reader. Live highlights are a projection, not the
canonical annotation. Same-panel retry identity is not cross-window atomic deduplication. Missing
passages in Readability's saved copy require opening that copy in Reader and selecting the
intended text there; Reader will not silently substitute the live page or overwrite the archive.
The service worker opens its own Connect session for page status; concurrent use with the panel
relies on the SDK's grants tolerating two sessions in one extension origin.
