# Reader web continuous deployment

Ops `app-cd.yml` owns this independent app line through its single reusable
`app-publish.yml`. It selects exact-source green main, waits for the authenticated
SDK producer to be in both live production servers, then dispatches
`deploy-reader.yml` with `source_sha` and `target`: staging → fresh browser smoke →
production → fresh browser smoke. Each boundary rechecks exact CI and ancestry.
Main may advance while a qualified ancestor is being published.

The publisher authenticates npm/Sigstore production provenance and the same
producer's signed staging archive, frozen original bytes and installed SDK/UI
members before running the unprivileged web build. Staging mechanically derives an
ephemeral install for every canonical SDK peer from that authenticated producer,
as Writer does. Committed staging/LAB aliases and archived originals are not
modified; their age cannot block a later production SDK repin. Normal local and
extension builds keep using their committed side-by-side aliases. The protected
job executes only workflow-owned helpers and isolated pinned tools, never the
candidate or artifact's scripts. It validates immutable same-run artifact custody,
all static bytes, the offline shell and capture route behavior. Entry filenames
end in the source's first twelve hex characters. Dashboard identity is served
identity, never the manifest pin.

Production captures the canonical Pages deployment and transitive assets before
upload. Incomplete upload, verification or smoke (including cancellation) invokes
the ordinary recovery job, which restores the captured UUID and verifies its
alias/bytes over a stable interval. Recovery cannot make the attempt green. Ops
holds only Reader; Server CD and other app lines are unaffected. Inspect exact
receipts/recovery, then use `bin/release app-line clear reader` in ops. Never
redispatch an unknown write.

The old native branch publisher and its manual qualification/deploy entry points
are retired. Web environments admit main only, without reviewers or wait timers.
They retain existing Cloudflare secrets and pin only the raw target trust asset
with `READER_TRUST_ASSET_SHA256`. Existing roots, policy keys, extension signing
identities and user data are unchanged. Production and staging are never retargeted.

## Extension shipping is independent

Ops owns the independent `reader-extension-chrome` store target through
`publish-reader-extension.yml`. The retired weekly train and extension-tag publisher
have no parallel upload path. The new uploader preserves GitHub ZIP/checksum releases
and automatically submits to Chrome's normal review queue; approval automatically
releases the version. See [extension app CD](extension-releases.md) for version
reservations, custody, target holds and supervisor prerequisites. Zotero's existing
tag route and both extension identities remain unchanged. Web-only builds never
upload an extension to Pages. Old intake fixtures are not publication authority.

## Live rollback drill

A direct human main dispatch may opt into `drill: true` for production only.
All ordinary checks still run. The source must already be canonical and served;
a distinct deployment UUID must become live. Only after normal smoke succeeds
does workflow-owned code deliberately fail it. Ordinary recovery must record
`ok: true`, `restored: true` and the captured previous UUID. This proves same-source
Pages recovery, not changed-source recovery, signed-in operations or store shipping.
Keep the failed run and bounded artifacts, and complete the ops deployment report.

## Authenticated SDK intake

When `GITHUB_TOKEN` is present, SDK release metadata and staging archive/bundle
bytes use GitHub REST. Asset bytes use
`/repos/mdbase-dev/mdbase-connect/releases/assets/<id>` with
`Accept: application/octet-stream` and Bearer authentication. Without a token,
assets use their exact `browser_download_url`; authenticated failures never fall
back anonymously. Exact asset names and browser URLs, SHA256 digests, and the
repository/workflow/ref/source attestation identity remain mandatory. npm and
unrelated archive hosts never receive the token; tokens and asset IDs are not
persisted in plans.

Staging installation uses the same transport. Installed-original comparison
re-downloads use the same transport and retain the plan digest and every-member
checks. The workflow supplies the read-only job token only to intake,
installation and comparison, alongside existing workflow-owned API checks. The
build wrapper deletes it after the original gate and before dependency or
application hooks. Dependency installation itself does not receive it. All jobs
inherit `actions: read` and `contents: read`, with no write overrides.

Transient reads retain retryable 403/408/429/5xx responses and network failures,
with waits of 5, 20, 60 and 120 seconds and a 30-second per-attempt timeout. One
read permits five attempts over 355 seconds; the protected guard step allows
seven minutes. Existing job deadlines and upload/recovery constraints are unchanged.
