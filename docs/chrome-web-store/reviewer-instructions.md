# Reviewer instructions draft

**Not submission-ready.** Replace all TODOs and rehearse these steps in a fresh isolated browser before copying to the store's private Test instructions fields. No test account or collection has been provisioned by this preparation.

## Account provisioning route — confirmed, awaiting owner address

The unauthenticated production `/v1/auth/config` currently advertises `registration: open`, `password_login: true`, `password_public_registration: true`, and `password_registration: true`. This was a read-only public check, not an account creation or permission change. Connect's `docs/account-authentication.md` documents verified email/password signup and hosted starter-collection onboarding.

Use a dedicated publisher-controlled review email, not Callum's personal account. The publisher must choose that address and complete email verification and any terms acceptance. Store its unique password securely and share it only in private reviewer fields. The supported password login avoids dependence on a personal Google passkey. No server authentication switch needs changing.

After signup, verify the starter hosted collection is ready; use it exclusively for review/demo material, or create a clearly named dedicated hosted collection through the normal UI. Verify actual quotas and availability rather than promising unlimited storage. Rehearse the entire device-code flow from a fresh browser using only that account. Do not point reviewers to the LAB acceptance account or a local desktop connector.

No review account or collection has yet been created: the dedicated email and verification are outstanding. A hosted account's provisioning and live approval/capture must still be tested before submission.

## Publisher preparation — not reviewer-facing

- Prefer a dedicated production hosted demo collection, if supported, containing only synthetic/public example data. Do not grant access to Callum's personal vault.
- Confirm an independent reviewer can sign in and approve the extension without Callum's passkey, email inbox or interactive MFA assistance. Use a supported review account method; do not weaken the personal account's security.
- Confirm service availability throughout review and any payment/access requirements. A cloud relay still depends on a running connector for connector-backed collections.
- Supply credentials only in the dashboard's private test-access fields, never in this repository, screenshots, public listing or ordinary logs.
- Verify the exact authorization/setup UI labels, collection creation requirements and Reader navigation against the candidate. The steps below are derived from source, not a completed live rehearsal.
- Prepare one stable public article and one small public PDF whose capture succeeds. Avoid copyrighted/private demonstration content that cannot be shared.
- Record candidate commit, ZIP SHA-256, Chrome version and test date outside credential fields. Draft upload alone does not make a store-installed build available; plan an appropriate reviewed distribution/testing path.

## Access details — reviewer-facing draft

Extension: mdbase Reader

Purpose: save articles/PDFs and web-page highlights into an authorized mdbase collection, and revisit saved highlights.

Reader web app: `https://mdbase-reader.pages.dev/`

Authorization service: `https://connect.mdbase.dev/`

Test account: TODO (supply securely in private fields)

Test collection name: TODO

Login/approval instructions: TODO (include actual independent-access method)

Test article URL: TODO

Test PDF URL: TODO

Support contact during review: TODO

Supported browser: current stable Chrome; package declares Chrome 123 minimum (publisher must verify).

## Test sequence

1. Install the submitted extension. Its welcome page should open. If needed, open the extension's Settings from Chrome's extension controls.
2. Use the collection connection control. Reader opens the mdbase Connect device-code approval page in a browser tab. Sign in with the supplied test account, check the displayed request and approve access to the dedicated test collection. Return to the extension. If initial collection setup is requested, follow TODO: verified test-collection setup instructions.
3. Open the supplied HTTPS article. Click the Reader toolbar button. Confirm that a side panel opens with the page title and the intended test collection. Opening the panel prepares a capture but does not automatically create a new source; DOI preparation and source lookups may make network requests.
4. Add a tag and source note, then explicitly save the source. Confirm success and open the saved source in Reader. Verify the reading copy and note. Invoke Reader again on the same article to check recognition of the existing source.
5. With the article and side panel open, select a passage. Choose a colour, optionally add a comment, and save the highlight. Select and save a second passage. Confirm both annotations in Reader. Article highlighting is supported; extension-side PDF text selection is not advertised.
6. Open the supplied PDF and invoke Reader. Save it to the test collection, then confirm it opens in Reader. Some website/PDF viewers restrict capture; the supplied test fixture must be one verified to work.
7. In Settings, enable “Mark pages I’ve saved and show my highlights on them” and approve HTTPS access. Reload the saved article: expect the badge and matching highlights. Open an unsaved article: it must not be automatically saved. Disable the option; reload and confirm background recognition is disabled. Basic explicit capture does not require this optional permission.
8. If using the proposed hosted demo collection, localhost access is not required. For a connector-backed demonstration, TODO: verified installation/startup and availability steps. Optional direct access uses “Allow local connector access”, then “Connect directly” if another approval is needed. Denial should leave an available relay usable.
9. Optionally test toolbar/context-menu invocation and shortcuts. Defaults are Alt+Shift+S and Alt+Shift+H, but Chrome/user conflicts may leave them unassigned. Chrome's extension shortcuts page can configure them.

## Restrictions and data handling

Only supported HTTPS pages are captured. Chrome internal pages, the Chrome Web Store, local file pages and other restricted contexts are not valid capture fixtures.

Page content, PDFs, annotations and URL queries go to the authorized collection through mdbase Connect. Optional saved-page recognition checks visited HTTPS URLs; it is not enabled by default. DOI previews may contact doi.org and its registration-service redirect. Direct localhost access is optional.

Local cleanup: after saves finish, open Settings → Disconnect this browser, acknowledge discarding unsaved drafts and recovery state, and select Disconnect and clear local data. The extension restarts and clears local grants/keys/preferences/drafts and optional host permissions. Reconnect to use it again. This does not revoke access server-side or delete saved collection content.

Revocation / collection cleanup instructions: TODO: verified service-side revocation and demo-record/file cleanup steps. Uninstalling the extension does not delete saved collection content. Keep the demo account available until review is complete, then follow the agreed cleanup process.

## Rehearsal evidence checklist

- [ ] Stable commit, final ZIP hash and version recorded.
- [ ] Fresh browser: login, approval and collection selection without personal credentials.
- [ ] Article and PDF fixture URLs independently accessible.
- [ ] Source save, annotations and Reader retrieval verified.
- [ ] Optional permissions denied/granted/revoked; background traffic behaviour checked.
- [ ] Connector/relay requirements accurately documented if applicable.
- [ ] All TODOs removed; no secrets in committed files or public assets.
