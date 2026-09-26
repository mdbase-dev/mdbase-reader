# Extension store hardening progress

Branch: `fix/extension-store-hardening`

Worktree: `/home/calluma/worktrees/mdbase-reader/extension-store-hardening`

No store upload, publication, production account creation, deployment, or personal collection mutation has been performed. These are candidate changes, not a claim that all four preparation items are finished.

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

- Real toolbar invocation, article/PDF save and repeated highlights against disposable connected data.
- Optional HTTPS permission grant/deny/revoke and actual background URL-traffic checks.
- Direct localhost approval and relay fallback; interrupted writes and revocation.
- The declared Chrome 123 minimum, or an evidence-based minimum-version update.
- Production account/device-code/capture rehearsal with the dedicated reviewer identity.
- Store-installed identity verification after the appropriate reviewed distribution path.

Do not describe these remaining checks as passed or the candidate as ready to submit.

## 4. Reviewer environment — route prepared; provisioning awaits publisher

A read-only check of production's public `/v1/auth/config` confirmed open registration, password login and public email/password signup. Connect's account-authentication documentation describes verified email/password signup and hosted starter-collection provisioning. This offers reviewers independent login without a personal Google passkey and without weakening the publisher account.

The publisher must choose a dedicated email address and complete verification and any required legal acceptance. Then provision/confirm a dedicated hosted review collection through normal UI, store a unique account password securely, and supply it only in the dashboard's private reviewer fields. No review email was invented, no signup email sent, no terms accepted on the publisher's behalf, and no production collection created.

`reviewer-instructions.md` now records this concrete route and the local-disconnect procedure. Account/collection provisioning and an independent end-to-end rehearsal remain open.

## Reproduce the candidate checks

```sh
pnpm install --frozen-lockfile
pnpm check
MDBASE_ENV=production pnpm --filter @mdbase-reader/extension package
pnpm test:extension-store
sha256sum apps/extension/release/mdbase-reader-0.2.0.zip
```

The normal tests may regenerate environment-dependent manifests. Run production packaging last and check `git status` plus the generated production manifest before recording the release commit/hash. The ZIP must contain production endpoints and no source maps. Candidate commit and exact ZIP hash are recorded in the implementation handoff, not inferred from the version number alone.
