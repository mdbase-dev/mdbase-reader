# Reader extension app CD

Approved 2026-11-09: ops app CD owns the independent `reader-extension-chrome`
target. `publish-reader-extension.yml` runs only on main, on its first dispatch
attempt, with an exact main-ancestor `source_sha`. No weekly train, GO step,
cooldown, release-tag publisher or enable variable remains. The off switch is the
ops `app-stop` issue marker `<!-- mdbase-app-line:reader-extension-chrome -->`.
A whole-Reader stop also holds the extension; an extension failure never holds
Reader web, another store or Server CD.

## Qualification, custody and submission

- Required workflows/jobs are defined **only** in ops `config/client-apps.json`,
  `store_checks.extension-chrome`. The source must have exact-main-push CI and the
  production extension package job green on the newest run attempt. Ops selects
  the candidate; the workflow re-reads the same policy and attempts before writes.
  Pending/failed checks wait. A proven pre-upload refusal retains
  `exact-main-ci-required`, `write_started: false`; ops records `store-unchanged`
  without an app-stop. After any possible upload, the same refusal stops the target.
- A read-only preflight preserves pending/staged review and async upload. Rejected,
  cancelled, warned or taken-down states fail closed. No review is cancelled or
  replaced. One whole-workflow concurrency group serializes this store.
- The version exceeds the live store channels and all `extension-v*` reservations,
  using the source package manifest as a floor. For example, manifest 0.5.0 plus
  live/reserved 0.5.1 yields **0.5.2**, not 0.5.1 again. Chrome numeric component
  limits apply. A higher explicit manifest version wins. A source already proven
  live by an exact run receipt is a no-op.
- An unprivileged job authenticates the original production SDK's integrity,
  Sigstore provenance, producer and protected trust digest before installation.
  Frozen installation disables hooks and pnpmfiles; every installed original
  member is compared before hooks/build. Only the ephemeral package version changes.
  No store credentials or protected environment enter this job.
- The protected uploader executes workflow-owned code, not candidate modules. It
  reconstructs the exact source plan and checks the immutable artifact ID/digest,
  workflow/run/attempt/source/tree binding, package SHA256SUMS and production MV3
  manifest. It repeats canonical checks, holds, and the live production SDK producer
  ancestry gate before upload and submission. Existing SDK signatures, digests,
  provenance, attestation authentication and extension identity are not bypassed.
- A permanent `extension-vVERSION` tag reserves the number **before** upload, even
  if upload fails or its outcome is unknown. No tag is updated or deleted; tag pushes
  no longer dispatch an extension publisher. Only the existing release App may
  reserve a version after the supervisor verifies its existing ruleset authorization.
- The same protected uploader preserves the existing GitHub distribution channel:
  it creates the reserved tag's ZIP + SHA256SUMS release from the exact verified
  store bytes before upload. A failed release stops this target without a store
  write; its reserved version is still consumed. There is no second release build.
- Holds are read through the existing ops store-line Actions bridge, using its
  returned first-attempt run and exact bounded artifact. The release App needs
  Actions-write access, not an added Issues grant; all line policy stays in ops.
- Upload and submit are each attempted once. The v2 upload must return the exact
  `crxVersion`; async success without that version remains a stop, never a guessed
  submission. `DEFAULT_PUBLISH` releases automatically after approval, without
  skipping review; `blockOnWarnings: true` remains. There is no second GO step.
- The final `reader-store-extension-chrome-RUN` artifact contains only bounded
  `store-cd-result.json` identity/outcome/reason/version/digest/write-boundary fields.
  Ops retains `app-cd-reader-publish-extension-chrome-RUN` for the daily summary.
  No tokens, Google response bodies, customer data or raw logs are retained.
  Build/upload/rejection/unknown-write failures stop only this target. Never
  redispatch an unknown write or clear a hold without reconciling it.

Chrome v2 references: [status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus),
[upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload),
[publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish).
In particular, fetchStatus exposes no uploaded-draft version, and DEFAULT_PUBLISH
means release immediately after approval. Store-installed copies receive Chrome
updates; unpacked builds do not.

## First live run and store preconditions

Merge the ops store-gate fix and TaskNotes companion first, this Reader change
next, then ops Reader enrollment. Reader #155 (authenticated release asset reads)
is already the base. Wait for both configured Reader main-push jobs. The release
supervisor owns the first live submission at the next eligible fifteen-minute
app-CD tick (Actions fallback minutes `07,22,37,52` UTC); implementation never
dispatches a release or app-CD workflow.

Before that tick, use the [store checklist](extension-store-checklist.md). Version
0.5.2 is expected only if the highest live/reserved version remains 0.5.1; live
store state was not read during implementation. A higher store/tag version raises
it automatically. Pending review waits without allocating a version.

## Existing distribution evidence, 2026-11-09

The only existing store publisher is Chrome. No Firefox AMO or Edge publisher,
listing or credentials are introduced.

| App               | Real channel today           | Evidence inspected                                                                                                                                                               | Added to app CD                                                |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Browser extension | Yes, Chrome                  | `release.yml` run 41348531792 (2026-11-01): package, checksum download, Google authentication and upload/submit steps succeeded; `extension-v0.5.1` release has ZIP + SHA256SUMS | Yes, Chrome only                                               |
| Electron desktop  | No demonstrated distribution | No desktop publishing workflow; all nine GitHub releases are extension releases, no desktop installer assets or successful desktop channel uploads                               | No; product decision on channel/signing/updater                |
| Capacitor mobile  | No demonstrated distribution | No iOS/Android store publisher or uploads in workflow history; no mobile release assets                                                                                          | No; product decision on platforms/listings/signing             |
| Zotero exporter   | No demonstrated distribution | Tag packaging code exists in `release.yml`, but no `zotero-exporter-v*` release, tag, XPI release asset or successful release job in the inspected history                       | No; decide whether to activate the existing GitHub XPI channel |

The three release runs immediately before 0.5.1 were 40236722529 (0.5.0),
37020696442 (0.4.1), and 36868829802 (0.4.0). Their CI/package/checksum-download/
Google-authentication steps succeeded; the combined **Upload and submit for review**
step failed. Each run has **zero retained artifacts**. Allowed evidence therefore
cannot distinguish upload from submission failure, prove an HTTP reason, or name
a missing dashboard field. No raw logs were read or copied. The 0.5.1 run proves
that this same submission boundary subsequently succeeded, not the specific fix
or today's listing state. The replacement splits bounded upload/submission reasons,
retains them durably and refuses policy warnings; it does not claim to repair an
unproved historical dashboard defect.
