# Browser extension releases

## Disabled-by-default weekly train

`extension-train.yml` runs only on the Sunday 22:30 UTC weekly sweep or manual dispatch on **main**. There is no push/merge, pull-request or workflow-run trigger. **Merging this PR is a no-op for extension releases even if the switch is already on.** The entire job additionally requires repository variable `EXTENSION_TRAIN_ENABLED` to equal the exact string `true`. The script repeats the check before reading credentials. The variable has not been created or enabled.

SDK repin PRs still merge through ordinary CI/protections; their shipping effects are picked up by the next enabled weekly/manual sweep. The train:

1. Uses the existing release App for Git pushes and a read-only Google scope to inspect the store. A pending/staged review or in-progress upload defers before building or allocating a tag. Store policy issues fail closed.
2. Builds the production ZIP, rather than treating source paths or lockfile changes as proof of a shipped change. There is no path list.
3. Reads paginated `release.yml` run/jobs history and selects the most recently completed successful **Upload and submit for review** step in the Web Store job on a stable extension push tag. A green packaging-only run or failed submission is not a baseline; a later post-step job failure does not erase a proved successful submission. It checks the tag commit against the run SHA, downloads that release's exact ZIP and SHA256SUMS, and verifies the archive checksum.
4. Compares hashes of sorted ZIP file names and uncompressed file contents, normalizing only the root manifest's `version`/`version_name`. ZIP order, compression and timestamps do not count. Every other shipped byte does. Identical content is a no-op, except an explicitly higher version on main is honored as deliberate release intent.
5. Allocates a Chrome-compatible stable version above every reserved tag, including failed tags; failed tags never replace the content baseline. An explicit higher main version (for example `0.6.0`) is used unchanged. Alien tags outside main/version-only main snapshots produce an alerting failure, even for identical ZIPs. Patch exhaustion requires a higher minor/major version.
6. Rechecks store state before tagging, defers if an extension release is still running, and tags a main snapshot with only the extension package version bumped. It does not write directly to main. The App-token tag push starts `release.yml`: exact-snapshot CI, production ZIP/checksums/GitHub Release, then ordinary store review. No mutation is automatically retried.

Train and Web Store jobs share a serialization group. A store change outside this automation can still race the preflight; the publisher independently refuses pending review, old versions and policy issues. No pending submission is cancelled or replaced.

## Baseline and enablement blockers verified 2026-11-02

There is currently **no workflow-proved successful Web Store submission baseline**. The ten visible extension release runs were inspected: `extension-v0.2.0` through `0.2.3` green runs packaged GitHub releases but had no Web Store job. `0.3.0`, `0.4.0`, `0.4.1` and `0.5.0` had failed Web Store submissions. The train explicitly fails rather than adopting `0.2.3` or the highest failed tag. A maintainer must establish a successful normal release workflow submission after resolving the dashboard blocker; this PR does not bootstrap by guessing from a published store version or a manual dashboard submission.

Ruleset **26306750**, `extension-version-immutability`, is active for `refs/tags/extension-v*` with **creation, update and deletion** rules. The **only** bypass actor is RepositoryRole **5** (repository admin), mode `always`. This bypass applies to all three rules, including update/deletion; non-admin actors cannot create tags. The release App has **not** been added. An owner must install/authorize it and deliberately add its bypass before enabling the train. No tag was created to test enforcement.

## Main-branch inspection and Google binding handoff

`release.yml` manual dispatch on **main** runs only `inspect-webstore`, using the existing environment variables/service account and `chromewebstore.readonly` scope. Push-only CI/packaging/upload/publish jobs do not run. No new tag is needed. The command is `node apps/extension/scripts/publish-webstore.mjs --status` with `CWS_ACCESS_TOKEN`, `CWS_PUBLISHER_ID` and `CWS_ITEM_ID`; it performs only a v2 GET `:fetchStatus`.

**Two existing settings reject main. Neither was changed.**

- Environment `reader-extension-production` currently allows only the `extension-v*` **tag** deployment policy (61634280). An owner must add an exact **branch** policy `main`, retaining the tag policy and **no required reviewers**. Otherwise the job cannot reach Google authentication.
- Provider `projects/927694253189/locations/global/workloadIdentityPools/reader-github/providers/reader-release` currently requires this repository/owner plus an extension tag and `release.yml` at that tag. Its service-account `roles/iam.workloadIdentityUser` principalSet already selects repository ID 1388387271; that binding does not need replacing. The provider's attribute condition must deliberately admit the two exact main workflows as below, preserving tag release trust. This is proposed configuration, **not an applied change**:

```text
assertion.repository_id == '1388387271' &&
assertion.repository_owner_id == '307332157' && (
  (assertion.ref.startsWith('refs/tags/extension-v') &&
   assertion.workflow_ref.startsWith('mdbase-dev/mdbase-reader/.github/workflows/release.yml@refs/tags/extension-v')) ||
  (assertion.ref == 'refs/heads/main' &&
   assertion.event_name == 'workflow_dispatch' &&
   assertion.workflow_ref == 'mdbase-dev/mdbase-reader/.github/workflows/release.yml@refs/heads/main') ||
  (assertion.ref == 'refs/heads/main' &&
   assertion.event_name in ['schedule', 'workflow_dispatch'] &&
   assertion.workflow_ref == 'mdbase-dev/mdbase-reader/.github/workflows/extension-train.yml@refs/heads/main')
)
```

Existing non-secret environment variables remain `CWS_WORKLOAD_IDENTITY_PROVIDER`, `CWS_SERVICE_ACCOUNT` (`reader-webstore@mdbase-connect.iam.gserviceaccount.com`), `CWS_PUBLISHER_ID` (`01a9bdcf-e8d0-46ba-956d-2ef4dde4dc43`), and `CWS_ITEM_ID` (`kimdfjefhbfgfecconmaiaaindjccidp`). No secret, IAM, provider or environment setting was changed. Service-account store access remains publisher-wide, so workflows hard-target Reader.

## Publisher diagnostics and slow uploads

The publisher keeps CWS **v2**, normal review and `blockOnWarnings: true`. It reports bounded, credential-redacted `error.details` and pre-upload status. If upload succeeds but submission fails, inspect the dashboard instead of blindly rerunning upload. Rerun only failed jobs when failure was provably before mutation; never retry an unknown-outcome mutation automatically.

Slow upload processing is polled to completion, then `crxVersion` must be known and match before submission. **API limitation:** the current v2 upload response documents that `crxVersion` is omitted during async processing, while `fetchStatus` exposes only `lastAsyncUploadState` and versions of **published/submitted revisions**, not the newly uploaded unsubmitted draft. Those older revisions cannot safely verify the upload. Therefore missing version now **fails closed** instead of silently submitting. Polling cannot recover an unexposed draft version; this part of the requested behavior needs Google API support/operator verification. No undocumented field, re-upload, deprecated v1 fallback or post-submission inference is used. The v1 API support ended October 15, 2026.

References: [v2 upload response](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload), [v2 status fields](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus), [v1 retirement](https://developer.chrome.com/docs/webstore/api/v1). See [the corrected dashboard checklist](extension-store-checklist.md). Store-installed copies receive Chrome's normal updates after approval/publication; unpacked copies do not. Zotero release behavior is unchanged.
