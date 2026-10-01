# Browser extension releases

Store-installed copies of [mdbase Reader](https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp) receive Chrome's normal automatic updates. Unpacked installations do not: install the store version once and authorize it in Connect. The store has a different extension identity, so existing unpacked grants/settings do not migrate automatically. Disable the unpacked copy to avoid duplicate capture actions.

## Release path

1. Update `apps/extension/package.json` to a new stable version and merge the change to `main`.
2. Push `extension-v<version>` pointing at that commit.
3. `.github/workflows/release.yml` runs CI, packages for production, and publishes the ZIP and SHA256SUMS to GitHub Releases.
4. The Web Store job downloads that exact ZIP, verifies its checksum, obtains a short-lived Google token, uploads, and submits for normal review. Approval publishes using the item's existing visibility/distribution settings; Chrome then updates installations on its own schedule.

Prerelease tags remain GitHub-only. Zotero releases are unaffected. Ordinary pushes/builds do not publish an extension. No `update_url` is needed: Chrome manages store updates.

The upload refuses to disturb a pending review or staged submission, to replace an equal/older published version, or to proceed while policy warnings/takedowns are present. It never cancels submissions, skips review, or retries mutations automatically. If the upload succeeds but submission fails, inspect the dashboard and submit that draft manually rather than blindly rerunning the upload. If the Web Store job fails before any mutation, rerun **failed jobs** after resolving the problem; rerunning all jobs would encounter the already-created GitHub release.

## Authentication

No Google password, refresh token or service-account key is stored in GitHub. `google-github-actions/auth` exchanges GitHub OIDC identity for a service-account access token scoped to `https://www.googleapis.com/auth/chromewebstore`.

Configured resources:

- Google Cloud project: `mdbase-connect` (`927694253189`). Chrome Web Store API, IAM Credentials API and STS enabled.
- Service account: `reader-webstore@mdbase-connect.iam.gserviceaccount.com`, linked in the Web Store publisher settings. **Google grants it access to all items under that publisher**, not just Reader; the workflow targets only Reader.
- Workload identity provider: `projects/927694253189/locations/global/workloadIdentityPools/reader-github/providers/reader-release`.
- Provider requires repository ID `1388387271`, owner ID `307332157`, an `extension-v*` tag, and `.github/workflows/release.yml` on that tag. Only this repository principal can impersonate the account (`roles/iam.workloadIdentityUser`).
- GitHub environment: `reader-extension-production`, restricted to `extension-v*` tags. Its non-secret variables are `CWS_WORKLOAD_IDENTITY_PROVIDER`, `CWS_SERVICE_ACCOUNT`, `CWS_PUBLISHER_ID` and `CWS_ITEM_ID`.
- Publisher: `01a9bdcf-e8d0-46ba-956d-2ef4dde4dc43`; item: `kimdfjefhbfgfecconmaiaaindjccidp`.

Keep tag creation and workflow changes restricted to trusted maintainers. Protect release tags with repository rulesets if stricter release approval is needed. To stop publishing, disable the identity provider or remove the service-account link in the Web Store dashboard. No other extension's release workflow has been configured.

## Verification at setup

The linked service account successfully fetched Reader's status through the v2 Web Store API. It reported a published `0.2.0` revision and a pending-review `0.2.0` submission. Neither was changed. A temporary local operator impersonation grant used for this read-only verification was removed afterward. Upload/publication and GitHub OIDC token exchange require a subsequent tagged release; they have not been exercised against the live store during setup.

References: [Web Store API](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts).
