# Extension store hardening progress

Branch: `fix/extension-store-hardening`

Worktree: `/home/calluma/worktrees/mdbase-reader/extension-store-hardening`

Updated 2026-09-27: with publisher approval, a dedicated production reviewer account/hosted demo and a separate Chrome Web Store draft have been created. The candidate ZIP, listing assets and private access instructions are uploaded. **Nothing has been submitted or published**, no production application deployment was performed, and no personal collection or TaskNotes listing was changed. Detailed live results and remaining blockers: `live-rehearsal-2026-09-27.md`.

## 1. Archive minimization — implemented

`packages/web-capture/src/archive-document.ts` rebuilds the archive from an allowlist of structural elements and text. Both the archive and readable HTML are now derived from minimized markup. Scripts (including application-state JSON), forms/controls, comments, embedded documents, SVG/MathML, arbitrary attributes, resource/link URLs and explicitly hidden/editable subtrees are discarded. Unknown/custom elements retain text without their original attributes. A restrictive CSP is added. Structured citation/source metadata is extracted separately before minimization.

Tests seed synthetic private markers in scripts, query-bearing links, attributes, inputs, hidden content, comments and embedded objects; neither stored HTML copy retains them. Citation metadata and article text remain available. The Reader web-capture integration test was updated to assert safe archive contents rather than equality with the raw input.

This intentionally produces a text-and-structure archive, **not a full-fidelity site snapshot**: original images, styling, link destinations and application behaviour are not preserved. Existing stored archives are not rewritten. Page prose, titles, explicitly selected citation metadata and separately stored source URLs can still contain private information. CSS-class-based invisibility is not comprehensively inferred from a detached DOM. The UI and policy therefore describe minimization, not guaranteed anonymization.

Also fixed and regression-tested the missing 40 MB check on the PDF download fallback. The limit is checked after buffering; streaming download limits remain a possible follow-up.

## 2. Disconnect / clear local data — implemented

Settings now has “Disconnect this browser” and a confirmation checkbox before “Disconnect and clear local data”. It explicitly distinguishes:

- forgetting local authorization/keys/preferences/drafts;
- discarding pending-write recovery information (finish saves first; a sent write may still complete);
- server-side revocation and deleting saved collection data, which this action does **not** do.

A durable reset marker is written before restarting the extension. The newly started service worker removes optional HTTPS/localhost permissions, deletes extension-origin IndexedDB databases (SDK signing keys/application identity), clears session data and finally clears local storage. Clearing local storage last preserves the retry marker if an earlier step fails. While marked, extension pages do not mount the SDK UI and session creation is blocked. Blocked database deletion or other failures retain a retry path rather than claiming success. A second reload starts a clean extension.

Tests cover restart-before-deletion, credentials/drafts/recovery cleanup without network calls, blocked IndexedDB deletion, and permission failure. Fresh Chromium testing exercises the actual Settings confirmation, runtime reloads and Chrome/IndexedDB cleanup. Page highlights already injected into website tabs may remain until those pages reload; the UI explains that limitation.

## 3. Candidate validation — automated checks passed; live acceptance incomplete

### Passed

- Full `pnpm check`: lint, formatting, architecture checks, workspace typechecking and complete test suite.
- Extension: 14 test files / 84 tests; web-capture: 5 files / 27 tests; Reader: 90 files / 346 tests, plus the remaining workspace suites.
- Production packaging via `MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package`.
- `pnpm test:extension-store`: actual production-targeted unpacked extension in a fresh disposable Chromium profile, outbound traffic blocked by a deny-all proxy. Verifies production manifest, welcome/offline retry UI, explicit cleanup acknowledgement, extension restart, synthetic local/session/IndexedDB cleanup and retry UI after reset. Chromium 149.0.7827.55 was used. The profile is removed on exit.

The browser smoke script is `scripts/extension-store-smoke.mjs`; install its pinned Playwright dependency/browser before use. In a fresh test profile, Developer mode is explicitly enabled so Chromium permits reloading an unpacked extension. No personal browser is modified. This is not a store-installed test and does not prove successful production API access.

Two pre-existing style failures in Reader's environment badge (missing braces and CSS formatting) were fixed, without behaviour changes, to get the whole repository gate green.

### Live LAB rehearsal

The first LAB daemon preflight timed out. A subsequent status check verified the LAB identity/origin and running daemon; doctor and login then passed. A run-owned managed LAB browser was started with the LAB build loaded. The ordinary LAB acceptance session successfully:

1. registered the portable extension;
2. opened its device-code approval flow;
3. created a dedicated disposable hosted collection;
4. approved the Reader setup/access request for that collection.

Fixture: `[test] reader-store-hardening-20260926-1772003` (LAB only, retained for safe follow-up; never reuse it as the production reviewer account).

A headless keyboard attempt did not yield a capture panel/usable active-tab capture, so article save/highlight/PDF acceptance was **not** established. No permission bypass was attempted. No capture panel or confirmed source save was observed. The run-owned browser was shut down successfully. The LAB daemon was not reset or stopped. Private scenario evidence is under the managed LAB browser session `20260926T022918Z-1772003`; do not publish authorization-page dumps or credentials from browser evidence.

### Still required before submission

- Actual toolbar/context-menu coverage and repeated highlights. Normal keyboard invocation, article/PDF saves and one highlight/comment passed against the production demo on September 27.
- Optional HTTPS permission grant/deny/revoke and actual background URL-traffic checks.
- Direct localhost approval and relay fallback; interrupted writes and revocation.
- The declared Chrome 123 minimum, or an evidence-based minimum-version update.
- Fresh-browser integrated reviewer login/device-code/capture rehearsal. Independent password login and fresh-extension device-code/capture checks have passed separately.
- Fix/retest the deployed Reader's saved-source deep links, which restored Library/previous document during the production rehearsal.
- Store-installed identity verification after the appropriate reviewed distribution path.

Do not describe these remaining checks as passed or the candidate as ready to submit.

## 4. Reviewer environment — provisioned; core live capture passed

With publisher approval on September 26, a dedicated email alias and independent production email/password account were created through the public signup, verification and terms flow. A unique generated password is held in the system keyring and the store's private reviewer fields, never Git. Independent login succeeded with a fresh cookie jar, without Google/MFA dependence. The existing external-testing account was left untouched.

The dedicated hosted `Reader Review Demo` collection has no desktop dependency. On September 27 the fresh unpacked candidate completed normal device-code approval/setup; public article/PDF captures and a yellow highlight/comment were saved and opened in Reader. No personal collection was authorized. The full fresh-browser/optional-permission/revocation matrix remains open.

The separate store draft has the candidate ZIP, description, icon, category/language, homepage, two real screenshots and a promotional tile. Saved privacy explanations and reviewer instructions have been inspected. Privacy-policy URL and all three data-use certifications remain unset pending policy/service confirmation; no submission action was taken. See the dated rehearsal record and `reviewer-instructions.md`.

## Reproduce the candidate checks

```sh
pnpm install --frozen-lockfile
pnpm check
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package
pnpm test:extension-store
sha256sum apps/extension/release/mdbase-reader-0.2.0.zip
```

The normal tests may regenerate environment-dependent manifests. Run production packaging last and check `git status` plus the generated production manifest before recording the release commit/hash. The ZIP must contain production endpoints and no source maps. Candidate commit and exact ZIP hash are recorded in the implementation handoff, not inferred from the version number alone.
