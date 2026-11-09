# Reader Chrome CD supervisor checklist

Implementation approval was given on **2026-11-09**. This is a prerequisite and
reconciliation checklist, not another approval/GO step or an enable switch.
Do not upload, submit, publish or cancel a review while checking the setup.

- Verify the existing `reader-extension-production` environment admits the exact
  **main branch**, with no required reviewers. Read-only API inspection on
  2026-11-09 showed only an `extension-v*` tag branch policy; no policy was changed.
- Verify the existing Google workload identity provider admits this repository's
  exact `publish-reader-extension.yml@refs/heads/main` workflow and main ref.
  Preserve the same service account/publisher/item and the store signing identity.
  Do not broaden trust to arbitrary workflows, forks, branches or PRs. Google
  provider settings were not re-read during this implementation.
- Confirm the existing `CWS_WORKLOAD_IDENTITY_PROVIDER`, `CWS_SERVICE_ACCOUNT`,
  `CWS_PUBLISHER_ID`, `CWS_ITEM_ID` bindings. All four variable **names** were
  present in the extension environment; values and credentials are not reports.
- Supply the existing production `READER_TRUST_ASSET_SHA256` protected **public
  digest** to the extension environment. It was not among the extension
  environment variable names on 2026-11-09. Verify it against the authenticated
  production SDK trust; do not invent a digest or change a key to make a build pass.
- Confirm the existing release automation App installation and credential access
  for Reader and ops/Connect evidence reads and Actions-write access to the existing
  ops store-line bridge. No Issues grant is added to the App. Confirm the
  App can create immutable `extension-v*` version reservations under the existing
  tag ruleset. Do not remove creation/update/deletion protections or reuse an old
  version. App installation, org-level credential availability and ruleset bypass
  authorization require supervisor verification; no new credentials are created.
- Inspect the **existing** listing's live version, any pending/staged/rejected
  review and draft upload, plus current package/listing/privacy/permission warnings.
  Resolve only actual dashboard findings. Historical step outcomes do not prove
  which listing field was missing. Preserve an existing pending review; do not
  submit a replacement. Existing staged or externally uploaded drafts need explicit
  reconciliation, not guessed ownership. The workflow never creates a listing.
- Confirm the ops gate fix, Reader change and enrollment are merged in the stated
  order, canonical main checks are green and no whole-Reader or extension app-stop
  is open. No workflow was dispatched and no stop cleared by implementation.
- Let the supervisor observe the first normal tick and retain its exact bounded
  ops/app records, then verify pending review or publication. Version is expected
  to start at 0.5.2 only under the stated live/tag assumptions. On rejection or
  unknown upload, reconcile the exact store version/run before clearing **only**
  `reader-extension-chrome`; never bypass the hold by manual tagging/upload.
