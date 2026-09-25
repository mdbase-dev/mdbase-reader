# Screenshot upload performance: investigation and proposed design

Status: proposal, not implemented or deployed. Browser evidence is from an isolated LAB hosted collection, not production or a local-authority route. No new server-side measurements were taken for this design review.

## Evidence

Nine browser-driven area saves with 9–54 KB PNGs took 5.35–6.36 seconds (median 5.86 seconds). Six network-instrumented saves showed:

- upload commit: 3.01–3.55 seconds;
- annotation creation: 0.34–1.01 seconds;
- sequential upload-open, status, prepare-part, object PUT, commit, then annotation creation.

Browser request timings include transport and server processing; they do not attribute the commit duration to individual storage or SQL operations. Test fixtures were deleted and the owned LAB browser stopped. Existing source-level Reader timing changes were not deployed for these measurements.

## What the implementation actually does

Relevant Connect files:

- `packages/client/src/files.ts`: `uploadKnownSource`, `uploadPart`.
- `crates/connect-hosted-provider/src/provider/files/upload.rs`: `commit_file_upload`, `validate_upload_completion`, `finalize_upload_object`, `commit_verified_file`.
- `crates/connect-hosted-provider/src/blob_store.rs`: `presign_put`, `verify_object`, `copy`.
- `crates/connect-hosted-provider/src/provider/files/maintenance.rs`.
- `crates/connect-hosted-provider/src/provider/mutation_journal_files.rs`.

The normal fresh single-PUT commit performs three object HEADs, two full GET/hash verifications, a COPY, and a DELETE, plus authorization, transfer state, receipt journal, and metadata database work. Staging existence is checked twice. `verify_object` really downloads and hashes the body; it is not a metadata checksum check. Successful commit awaits staging deletion even though deletion failure only logs a warning.

### Important correction: the second verification is not simply redundant

The presigned PUT binds the staging key and length, not the declared SHA-256. It does not impose create-only semantics. An unexpired PUT URL can overwrite staging even after the database transfer changes to `completing`.

Consequently, staging may change between verification and COPY. Checking the copied destination protects against that race. Removing destination verification while keeping the current unconditional COPY would weaken integrity. Likewise, making the current mutable staging key the published file would be unsafe.

Cloudflare's current [R2 S3 compatibility table](https://developers.cloudflare.com/r2/api/s3/api/) documents conditional PUT (`If-None-Match`) and conditional COPY (`x-amz-copy-source-if-match`). These are design inputs, not substitutes for live R2 acceptance tests. An ETag is not the application's SHA-256 digest.

## Recommended target: immutable candidate object, verify once, publish metadata

Use the existing generic file-transfer lifecycle, not a Reader-only storage mechanism.

1. **Open:** authenticate and authorize; record the expected digest, length, path/base revision, owner and a unique candidate object key. Atomically distinguish a new session from a resumed one. Return initial progress and the prepared single-PUT request in the same response for small uploads.
2. **Upload:** issue a presigned PUT whose signature requires `If-None-Match: *`. No client grant may overwrite or delete the candidate. Every upload attempt uses a unique key. A repeated successful PUT returns a precondition failure, which is resolved via status/commit rather than treated as proof of wrong content. A bad candidate requires a new attempt/key.
3. **Verify:** transition under durable ownership into finalization, then GET the candidate once and compute authoritative SHA-256 and length. Only verified bytes may become a visible file. A candidate's object key stays unchanged across publication: staging versus published is database state, not a reason to copy bytes.
4. **Publish:** transactionally revalidate authorization, expected revision, collection state and quota; publish the file/version/change plus receipt, and durably schedule any cleanup. Coordinate the existing outer mutation journal with the inner receipt rather than introduce an independent success definition.
5. **Return:** acknowledge only after verified metadata is committed. Nonessential object deletion runs through durable background cleanup, not before the response.

For larger files, retain multipart upload under the same lifecycle. Only the provider can complete the upload; completing it must make the resulting unique candidate immutable to outstanding part URLs. Verify the completed object once before publication. Validate this property against actual R2 behavior.

### Required race and recovery guarantees

- Create-only headers must be signed, accepted by browser CORS, and enforced by R2; they cannot be optional client conventions.
- Once verified, neither old signed URLs nor stale provider attempts may replace the object.
- A lost response replays the same receipt, not another annotation/file/version.
- A crash after object creation but before metadata publication is recoverable; unreferenced candidates remain invisible.
- Only a live, fenced finalizer may publish. Revocation, revision conflicts, expiry, collection deletion and abort must still win at their defined boundaries.
- Cleanup must never delete a referenced object. Cleanup intent and ownership must survive crashes.
- Outstanding presigned requests can finish late, and deleting an unreferenced object can permit a create-only URL to recreate it. Retain cleanup/reconciliation coverage past URL expiry and possible in-flight completion; do not treat one successful DELETE as permanent absence. Use durable retries and orphan reconciliation.
- Object keys must not be reusable across distinct upload attempts, collection lifetimes or logical file replacements.

This reduces the ordinary small-upload browser path to open+prepare, PUT, commit, followed by Reader's annotation creation. It removes the ordinary copy, duplicate full read, and successful-upload staging deletion. Actual latency must be remeasured; a sub-second promise is not supported by the current evidence.

## Incremental path

1. Add privacy-bounded server timing for HTTP authorization, journal claim/completion, transfer/key loading, each HEAD/GET/COPY/DELETE, SQL pool/lock wait, verification CPU, metadata transaction, and total. Record fixed stage names, duration, outcome and coarse size buckets only; no keys, URLs, tokens or content.
2. Move successful staging cleanup to durable queued work using existing deletion infrastructure, with explicit coverage for late presigned writes. Do not merely spawn a task or ignore deletion errors.
3. Have upload-open return new/resumed state, progress and prepared first-part information. Avoid the immediate status and prepare calls only when the returned state makes that safe. Keep explicit resume support.
4. Validate immutable candidates against real R2 before replacing the old finalization path. Existing persisted transfers must finish under their original semantics during a bounded migration.

If immutable candidates cannot yet be deployed, preserve destination verification. A copy-then-verify-destination-only design could remove staging verification, but requires careful handling of invalid objects and ambiguous COPY outcomes, strict fencing against late copies, and quota/abuse controls. It is not a safe one-line optimization. Verifying staging then copying with an ETag precondition is another possibility, but should not silently elevate ETags into a cryptographic identity guarantee.

## Acceptance suite

- Small PNG and larger PDF; first upload and resumed/replayed upload.
- Same-length wrong digest, truncated body, zero-byte file.
- Attempt to omit/change signed create-only header; repeated and concurrent PUTs.
- Overwrite staging during commit (regression against the current race).
- Crash/lost response at every object and database boundary.
- Concurrent finalizers, lease takeover, abort, expiry, revoke, revision conflict and collection deletion.
- Presigned writes completing after cleanup; no orphan leak and no deletion of live data.
- Multipart retries and completion with old part URLs.
- Measure p50/p95 click-to-durable-annotation and per-stage server latency, separately from capture rendering and subsequent image display.

Do not parallelize annotation publication with an uncommitted attachment. Reader can show honest progress and retain the local preview without calling an unsafe save complete.
