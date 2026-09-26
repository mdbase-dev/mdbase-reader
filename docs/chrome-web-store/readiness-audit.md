# Chrome Web Store readiness audit

This is the original audit. See [hardening progress](hardening-progress.md) for implemented changes and subsequent validation; the original findings below are retained as historical evidence.

Status: local preparation only; not ready to submit. No store item created, ZIP uploaded, production collection accessed, or privacy page published by this audit.

## Scope and evidence

Reviewed working tree based on `6e7c657d817ed88a2013d29bd8dee0efd92dd603`, extension version `0.2.0`. Existing extension/Connect edits were present and continued changing during inspection. This is a working-tree assessment, not reproducible release evidence. No existing source edits were overwritten.

Node `v22.22.0`, pnpm `10.7.0`:

| Check                                                                                                      | Result                                                            |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm --filter @mdbase-reader/extension exec vitest run`                                                   | 12 files, 78 tests passed                                         |
| `pnpm --filter @mdbase-reader/extension typecheck`                                                         | Passed                                                            |
| `pnpm --filter @mdbase-reader/connect --filter @mdbase-reader/web-capture test`                            | Connect: 24 files/77 tests; web-capture: 5 files/26 tests; passed |
| Production-targeted Vite build into a temporary directory                                                  | Passed, 220 modules                                               |
| Diagnostic JS scan for `eval`, `new Function`, literal remote dynamic imports, LAB/staging service origins | No matches                                                        |

The build used `MDBASE_ENV=production pnpm --filter @mdbase-reader/extension exec vite build --outDir /tmp/reader-store-audit-build-yutKrE`, using the existing generated application manifest, which had a production project URL when inspected. It deliberately did not run the manifest generator or overwrite `dist`/`release`. Non-map files total 810,455 bytes. This is **not the release ZIP**. Temporary logs: `/tmp/reader-store-extension-tests.log`, `/tmp/reader-store-extension-types.log`, `/tmp/reader-store-dependency-tests.log`, `/tmp/reader-store-build.log`.

Not performed: full workspace lint/typecheck/tests, dependency/security audit, fresh browser installation, minimum-Chrome verification, production login/capture, network trace, store-installed identity test, backend logging/retention review. A textual bundle scan is not proof of no remotely hosted code.

## Submission gates

### 1. Resolve the HTML archive privacy boundary

`apps/extension/src/page-capture.ts` clones the document, flattens open shadow roots, removes form controls/contenteditable elements and Reader UI, then serializes the remaining DOM. `packages/web-capture/src/web-capture.ts` stores this snapshot as the archive alongside a sanitized readable copy.

The archive is broader than the article: script elements, embedded application-state JSON, hidden content, attributes and URL query parameters can remain. A page may put sensitive data there. Form removal is **not** comprehensive secret removal. The readable-copy sanitizer does not sanitize the archive.

Before submission, choose and test a minimization policy: remove executable scripts and unnecessary embedded state/attributes from the archive, or change what is archived. Add synthetic tests containing fake secrets in scripts, attributes, hidden content and query parameters. Preserve only the metadata needed for citations deliberately. Do not promise that private/authentication data can never be captured. Reflect the final behaviour in the privacy policy and in-product capture explanation.

### 2. Finalize data controls and service facts

No disconnect/forget-authorization/clear-local-data action was found in the extension UI. Settings expose collection selection, saved-page marks, shortcuts and a Reader link. `chrome.storage.local` holds Connect state, last collection, preferences and mutation/recovery state; session storage holds drafts.

Recommended: a clearly scoped disconnect/clear action, with explicit handling of pending writes and background sessions. It must distinguish forgetting local state from revoking server authorization and deleting collection records/files. Confirm the actual Connect revocation workflow and document it; do not invent a Settings → Disconnect instruction.

The policy draft needs publisher/contact confirmation, service-provider and retention/backup details, and a public URL. Do not claim local-only storage, end-to-end encryption, no server logs, or immediate deletion of backups based on this extension audit.

### 3. Supply a viable reviewer environment

Prefer a dedicated hosted demo collection/account if production supports it: reviewers should not depend on Callum's desktop or personal vault being online. Verify that login and device-code approval work for an independent reviewer without access to Callum's MFA. If a connector-backed collection is necessary, provide supported installation/startup instructions and explain availability requirements.

Fill and rehearse `reviewer-instructions.md`. Keep credentials out of Git; provide them only through the store's private reviewer fields. No reviewer resources were created.

### 4. Produce a stable, tested release artifact

Finish the concurrent source changes and freeze a commit. Run the full relevant checks and the browser matrix below. Then run the normal production packaging command and record commit, numeric extension version and ZIP SHA-256. Inspect ZIP contents for root manifest, required HTML/JS/icons, absent source maps, no credentials/test data, and production-only endpoints.

`apps/extension/scripts/package-extension.mjs` excludes `*.map`; packaging defaults to production, while standalone `build` defaults to LAB. The extension packaging path has no clean-tree gate. Existing `release/mdbase-reader-0.2.0.zip` must not be assumed current. Repeated prerelease names map to the same numeric version in `manifestVersion`; use a strictly increasing numeric version for store updates.

### 5. Finish listing and declarations

Use `listing.md`, `privacy-policy-draft.md`, and `privacy-declarations.md`. Required artwork still needs purpose-made assets using demo data. Public support/privacy URLs and a reviewer contact must be confirmed. Reconcile dashboard declarations with the final code and backend facts before certifying them.

## Current implementation: useful foundations

- Manifest V3 module service worker; Chrome minimum declared as 123 (not independently verified).
- Permanent API host: `https://connect.mdbase.dev/*`.
- `activeTab`, `scripting`, `storage`, `contextMenus`, `sidePanel`; no blanket permanent browsing host access.
- Optional `https://*/*` for saved-page lookups/highlight rendering.
- Optional `http://127.0.0.1/*` for direct local connector access, currently port 28485 in production. Chrome host match patterns do not restrict this permission to that port. Local-network approval is separate.
- First-install welcome page, settings, collection selection, device-code authorization, explicit source save, article highlights and citation previews.
- Icons at 16/32/48/128 pixels; local JS/CSS/font assets.
- Extension-context fetches omit ambient cookies (`mount.tsx`, `background.ts`). Injected PDF fetch intentionally uses the page's existing access; those cookies are not themselves copied to Connect by that fetch.
- DOI lookup can happen before Save, during citation preparation. Background saved-page mode can send page URL queries without an explicit capture. "Nothing leaves the browser before Save" would be false.
- Generated Connect application manifest requests full-collection access and capabilities including record deletion, view mutation and collection setup. Review whether the capture extension needs the full Reader capability set; Chrome host permissions and Connect grants are different scopes.

## Browser acceptance matrix (not yet run here)

Use isolated demo data. For LAB testing follow the `mdbase-lab` skill; do not repurpose the personal browser/collection as a test fixture.

- Fresh installation: welcome, pin instructions, connect, approve code, select collection, apply setup only with explicit approval.
- HTTPS article: inspect without saving; save readable copy/archive/title/tags/note; reopen in Reader; duplicate capture does not create an unintended duplicate.
- Article selection: toolbar/context menu/shortcut, successive coloured highlights and comments, matching against saved text, missing/ambiguous selection errors.
- PDF: public PDF with and without a `.pdf` path; authenticated PDF; denied capture; large-file handling. `fetchPdf`'s fallback currently lacks the 40 MB check used by the injected path—fix or define/test the intended limit.
- Optional website access: deny, enable, navigate to saved/unsaved pages, switch collections, disable, externally revoke. Confirm URL traffic stops and stale rendered marks/badges are handled. Check one-page apps that navigate without a full load.
- Optional localhost access: deny, allow, complete local-network approval, connector unavailable, relay fallback. Do not require it for hosted collections.
- Service worker restart, browser restart, reauthorization/revocation, offline/expired grant, interrupted upload/recovery, close tab with draft.
- Restricted pages (`chrome://`, Chrome Web Store), non-HTTPS pages and file URLs fail clearly; do not advertise universal page support.
- Network trace with synthetic data: API/relay, localhost if enabled, DOI and PDF origins; check captures, grants, URL queries, and unexpected third-party requests.
- Latest stable Chrome and declared minimum (or raise minimum with evidence); final store-installed identity and independent reviewer onboarding.

## Source references

- `apps/extension/scripts/extension-manifest.mjs`, `package-extension.mjs`, `write-mdbase-manifest.mjs`
- `apps/extension/src/page-capture.ts`, `capture-citation.ts`, `save-capture.ts`, `connect-session.ts`, `drafts.ts`, `background.ts`, `background-page-status.ts`, `DirectAccessPanel.tsx`, `PageStatusSetting.tsx`, `OptionsApp.tsx`
- `packages/web-capture/src/web-capture.ts`, `page-citation.ts`, `doi.ts`
- `apps/reader/scripts/deployment-environment.mjs`

Chrome documentation consulted directly for this preparation:

- <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>
- <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- <https://developer.chrome.com/docs/webstore/images>
- <https://developer.chrome.com/docs/webstore/cws-dashboard-distribution>

Private/unlisted distribution is not a review bypass. A draft upload assigns an identity but does not by itself provide a store-installed test build.
