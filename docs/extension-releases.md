# Browser extension releases

Store-installed copies of [mdbase Reader](https://chromewebstore.google.com/detail/mdbase-reader/kimdfjefhbfgfecconmaiaaindjccidp) receive Chrome's normal automatic updates. Unpacked installations do not: install the store version once and authorize it in Connect. The store has a different extension identity, so existing unpacked grants/settings do not migrate automatically. Disable the unpacked copy to avoid duplicate capture actions.

## Release path

1. Merge a shipping extension change (including an SDK repin) through normal PR CI to `main`.
2. `extension-train.yml` compares extension/build inputs with the highest stable extension tag. If changed, it bumps the patch version in an immutable, annotated `extension-v<version>` snapshot tag. The snapshot's parent is the selected `main` commit; only `apps/extension/package.json` differs. It never pushes a version commit to `main` or bypasses main protections. An explicitly higher stable version already on main is retained.
3. `.github/workflows/release.yml` runs CI, packages for production, and publishes the ZIP and SHA256SUMS to GitHub Releases.
4. The Web Store job downloads that exact ZIP, verifies its checksum, obtains a short-lived Google token, uploads, and submits for normal review. Approval publishes using the item's existing visibility/distribution settings; Chrome then updates installations on its own schedule.

Prerelease tags remain GitHub-only. Zotero releases are unaffected. No `update_url` is needed: Chrome manages store updates.

The train uses the existing release automation App token, **not** `GITHUB_TOKEN`, so its tag push triggers `release.yml`. Runs serialize and check out current main, coalescing queued merges. Repeated runs with unchanged inputs are no-ops even though main's development version does not advance. A reverted source change is compared by content, not commit count. All extension files, shared packages, Reader manifest resources/scripts, root dependency/TypeScript configuration, tools, vendor originals and build scripts are conservative release inputs. Documentation-only and unrelated app changes do not release; shared lockfile changes may intentionally release conservatively. The script refuses missing history, unrelated tags, tag/package mismatch, invalid Chrome versions and stale/dirty plans. Patch exhaustion at 65535 requires an explicit higher minor/major version. Run `node scripts/extension-release.mjs` in a clean full checkout to print a read-only plan. Do not run its `tag` mode manually unless authorized to release.

Tag ruleset `extension-version-immutability` (26306750) actively prohibits **updates and deletions** of `refs/tags/extension-v*`, with no bypass actors. Creation remains allowed. The environment still allows only `extension-v*` tags and has no required reviewers. The release's reusable CI checks the exact bumped snapshot before packaging; main and release CI are not replaced by the train.

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

Keep tag creation and workflow changes restricted to trusted maintainers. To stop publishing, disable the identity provider or remove the service-account link in the Web Store dashboard. No other extension's release workflow has been configured.

## Diagnosing store refusals

See [the dashboard checklist](extension-store-checklist.md) before merging the train. The existing publisher already uses the current v2 API. `blockOnWarnings: true` and normal review remain mandatory; do not work around a refusal by disabling warnings. API errors now retain bounded, credential-redacted `error.details`, where Google places validation warnings, and log pre-upload status. After upload succeeds but submission fails, do not re-upload blindly.

For an authorized local token, `node apps/extension/scripts/publish-webstore.mjs --status` performs only `GET ...:fetchStatus` using `CWS_ACCESS_TOKEN`, `CWS_PUBLISHER_ID`, and `CWS_ITEM_ID`. The API reports published/submitted revisions, versions, warnings/takedown and recent upload state, **not** listing/privacy field completeness. No upload or submit is needed for this inspection.

`release.yml` also offers a **read-only** manual dispatch on an existing extension tag **containing this workflow revision**, using the existing WIF/environment and the `chromewebstore.readonly` scope. Push-only packaging/publishing jobs are skipped on dispatch. Older immutable tags do not acquire this facility; do not move them, widen WIF trust, change secrets, or dispatch the push release to investigate.

## Verification at setup

The linked service account successfully fetched Reader's status through the v2 Web Store API. It reported a published `0.2.0` revision and a pending-review `0.2.0` submission. Neither was changed. A temporary local operator impersonation grant used for this read-only verification was removed afterward. Upload/publication and GitHub OIDC token exchange require a subsequent tagged release; they have not been exercised against the live store during setup.

References: [Web Store API](https://developer.chrome.com/docs/webstore/using-api), [service accounts](https://developer.chrome.com/docs/webstore/service-accounts).
