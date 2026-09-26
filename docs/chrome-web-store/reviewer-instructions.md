# Reviewer instructions draft

**Not submission-ready.** The dedicated production account, hosted collection and Reader setup are provisioned. Article capture, one highlight/comment, PDF capture and Reader retrieval passed on September 27. Private credentials and concise instructions are saved in the separate store draft. Fresh-browser/full acceptance and the remaining TODOs are still required; see `live-rehearsal-2026-09-27.md`.

## Account provisioning — completed 2026-09-26

The unauthenticated production `/v1/auth/config` currently advertises `registration: open`, `password_login: true`, `password_public_registration: true`, and `password_registration: true`. This was a read-only public check, not an account creation or permission change. Connect's `docs/account-authentication.md` documents verified email/password signup and hosted starter-collection onboarding.

With publisher authorization, a dedicated email alias was added, email verification completed, and a separate production account created through public signup. Its unique generated password is stored in the publisher's system keyring, not this repository. A fresh cookie-jar password login succeeded without Google credentials or MFA, and the temporary verification session was signed out. Account and keyring metadata are recorded privately under `~/.local/state/mdbase-reader/chrome-web-store/reviewer-account.json`. No server authentication switch was changed.

The account has one active hosted starter collection, renamed `Reader Review Demo` through the normal account API, under the `open_beta_v1` profile. At verification it had no local collections, computers, or application grants; the collection overview showed only its owner. No personal collection was connected, and the previous external-testing account was not changed.

On September 27, normal device-code approval/setup succeeded for the fresh unpacked candidate. The demo now has the public article and PDF below, plus one yellow article highlight with a comment. Keep this collection exclusively for demo material. Do not point reviewers to LAB or a desktop connector, and do not promise unlimited storage.

## Publisher preparation — not reviewer-facing

- Prefer a dedicated production hosted demo collection, if supported, containing only synthetic/public example data. Do not grant access to Callum's personal vault.
- Confirm an independent reviewer can sign in and approve the extension without Callum's passkey, email inbox or interactive MFA assistance. Use a supported review account method; do not weaken the personal account's security.
- Confirm service availability throughout review and any payment/access requirements. A cloud relay still depends on a running connector for connector-backed collections.
- Supply credentials only in the dashboard's private test-access fields, never in this repository, screenshots, public listing or ordinary logs.
- The core connection/capture/retrieval steps were rehearsed against the unpacked candidate. Steps for optional permissions, repeated highlights, reset/revocation and store installation remain acceptance checks, not completed evidence.
- Prepare one stable public article and one small public PDF whose capture succeeds. Avoid copyrighted/private demonstration content that cannot be shared.
- Record candidate commit, ZIP SHA-256, Chrome version and test date outside credential fields. Draft upload alone does not make a store-installed build available; plan an appropriate reviewed distribution/testing path.

## Access details — reviewer-facing draft

Extension: mdbase Reader

Purpose: save articles/PDFs and web-page highlights into an authorized mdbase collection, and revisit saved highlights.

Reader web app: `https://mdbase-reader.pages.dev/`

Authorization service: `https://connect.mdbase.dev/`

Test account: dedicated email/password credentials supplied only in the private dashboard fields.

Test collection name: `Reader Review Demo` (hosted; Reader setup completed).

Login/approval instructions: use the supplied email/password at Connect, not Google. Compare the device code with the extension and approve only Reader Review Demo. No personal credentials, email-inbox assistance or desktop connector is needed.

Test article URL: <https://en.wikipedia.org/wiki/Commonplace_book>

Test PDF URL: <https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf>

Support contact during review: TODO

Supported browser: current stable Chrome; package declares Chrome 123 minimum (publisher must verify).

## Test sequence

1. Install the submitted extension. Its welcome page should open. If needed, open the extension's Settings from Chrome's extension controls.
2. Use the collection connection control. Reader opens the mdbase Connect device-code approval page in a browser tab. Sign in with the supplied test account, check the displayed request and approve access to the dedicated test collection. Return to the extension. If prompted for Reader setup on the dedicated collection, review the request and select “Set up and allow access”; this label and path were exercised in the rehearsal.
3. Open the supplied HTTPS article. Click the Reader toolbar button. Confirm that a side panel opens with the page title and the intended test collection. Opening the panel prepares a capture but does not automatically create a new source; DOI preparation and source lookups may make network requests.
4. Add a tag and source note, then explicitly save the source. Confirm success and open the saved source in Reader. Known deployed Reader issue: a saved-copy link may restore Library or the previous source instead of the requested document. Choose Library, select the intended row and press Enter. Verify the reading copy and note. Invoke Reader again on the same article to check recognition of the existing source.
5. With the article and side panel open, select a passage. Choose a colour, optionally add a comment, and save the highlight. Select and save a second passage. Confirm both annotations in Reader. Article highlighting is supported; extension-side PDF text selection is not advertised.
6. Open the supplied PDF and invoke Reader. Save it to the test collection, then confirm it opens in Reader. Some website/PDF viewers restrict capture; the supplied test fixture must be one verified to work.
7. In Settings, enable “Mark pages I’ve saved and show my highlights on them” and approve HTTPS access. Reload the saved article: expect the badge and matching highlights. Open an unsaved article: it must not be automatically saved. Disable the option; reload and confirm background recognition is disabled. Basic explicit capture does not require this optional permission.
8. This demo uses a hosted collection; localhost permission and desktop installation are not required. Optional direct localhost/relay acceptance is a separate publisher test, not a reviewer setup requirement.
9. Optionally test toolbar/context-menu invocation and shortcuts. Defaults are Alt+Shift+S and Alt+Shift+H, but Chrome/user conflicts may leave them unassigned. Chrome's extension shortcuts page can configure them.

## Restrictions and data handling

Only supported HTTPS pages are captured. Chrome internal pages, the Chrome Web Store, local file pages and other restricted contexts are not valid capture fixtures.

Page content, PDFs, annotations and URL queries go to the authorized collection through mdbase Connect. Optional saved-page recognition checks visited HTTPS URLs; it is not enabled by default. DOI previews may contact doi.org and its registration-service redirect. Direct localhost access is optional.

Local cleanup: after saves finish, open Settings → Disconnect this browser, acknowledge discarding unsaved drafts and recovery state, and select Disconnect and clear local data. The extension restarts and clears local grants/keys/preferences/drafts and optional host permissions. Reconnect to use it again. This does not revoke access server-side or delete saved collection content.

Revocation / collection cleanup instructions: TODO: verified service-side revocation and demo-record/file cleanup steps. Uninstalling the extension does not delete saved collection content. Keep the demo account available until review is complete, then follow the agreed cleanup process.

## Rehearsal evidence checklist

- [x] Candidate commit, ZIP hash and version recorded in the dated rehearsal evidence.
- [ ] Fresh browser: login, approval and collection selection without personal credentials (fresh cookie-jar password login and fresh-extension approval passed separately).
- [x] Article and PDF fixture URLs independently accessible.
- [x] Article/PDF save, one article annotation/comment and Reader retrieval verified; deep-link issue recorded.
- [ ] Optional permissions denied/granted/revoked; background traffic behaviour checked.
- [x] Hosted demo requires no desktop connector or localhost permission.
- [ ] All TODOs removed; no secrets in committed files or public assets.
