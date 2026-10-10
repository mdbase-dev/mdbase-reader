# Native SDK preparation

Reader's existing Connect web, extension and native-shell paths remain active.
This branch does not enable a new sign-in or collection runtime. Historical
Reader PR #60 is not the native SDK integration.

## Read-only records foundation

`packages/connect/src/next-reader-records.ts` uses the public `@mdbase-dev/sdk`
client directly. It is a source/annotation data foundation, not an implementation
of Reader's complete application repositories or a Connect-compatible SDK facade.
It returns actual SDK `RecordView` objects and native mapped/tagged values:

- Requires caller-supplied, qualified **semantic** digests for the exact
  `dev.mdbase.reader.source` and `dev.mdbase.reader.annotation` contracts,
  both `1.0.0-beta.1`. Raw Markdown/type-pack resource hashes are not inferred
  to be those semantic digests. These inputs still need native setup qualification.
- Selects implementing types and field bindings from `describe`, not starter
  filenames, paths or default type names. Ambiguous/missing contracts or providers,
  required fields and nested field-reference bindings are refused explicitly.
- Lists effective metadata without body reads, using SDK cursor pages without
  automatic restart. Incomplete, changing-cut, duplicate-native-identity or
  changing-provider results fail rather than become a complete library snapshot.
  Consumers must discard an in-progress load on error; yielded pages are not a
  separately saved or complete library.
- Opens full source by captured native UUID/path; requires actual body/document
  and matching document revision, then rechecks the provider binding. No Markdown
  is reconstructed from frontmatter. Native pending/hold/unresolved state remains
  available on the genuine view; a read does not imply saved or writable status.
- Preserves the original source/annotation body and native field maps. Ordinary
  core-domain mapping is still required before these rows can serve Reader's UI.
  A portable source/annotation ID is not automatically a native record UUID.
- Caller abort signals fence publication. The shared factory/session owns the
  client lifetime; this module has no SDK/session/lease/auth engine and no writes.

The release-qualified SDK successor `8cbc82fb` archive/source/hash and SHA512
are pinned in `vendor/mdbase-next-sdk.json`, including SDK808's session fix,
SDK809 leases, SDK811's fixture fix and SDK814's shared read helpers. Reader's
working pages/get implementation is unchanged; helper batching is not a native
atomic snapshot, and People producer compatibility is not qualified here. This is source/package qualification,
not per-app trust/origin/runtime/session/operation acceptance; no native Files
producer is qualified here. The archive comes from release, not npm. Tests use MemoryReplica record frames with synthetic Reader
contract/type metadata and controlled safety responses. They are not native
parser, manifest-install, custody, sign-in, runtime or LAB acceptance.

## Remaining integration boundaries

- Web/native-shell composition must use the shared sign-in, native collection
  factory and manifest-driven setup helpers, with qualified trust/origin/runtime
  inputs. Do not copy TaskNotes bootstrap, Worker, route, lease or auth glue.
- The Chrome extension requires the shared portable device-code/grant session
  following the sign-in join ledger, durable ownership/wake and the exact extension
  origin. The old portable flow omits `client_noise_key` and cannot be blindly
  reused. The first-party HTTPS/LAB-loopback session is not an extension fallback.
- Native Files must preserve returned stable `fileId`, current content revision,
  lifecycle/cancellation and recovery. A path lookup after upload confirmation or
  a legacy HTTP shim cannot manufacture native upload identity.
- Annotation creation currently shares one logical mutation ID across asset,
  annotation and transclusion steps. Native integration needs distinct persisted
  UUID intent IDs per step and a stable upload-transfer UUID. A flow-level ID such
  as `mutation-1` is not a reusable native wire UUID.
- Publish `asset-stored` only after the original `FileWrite.confirmed` succeeds.
  Pending/unknown outcomes retain the original native `fileId` and intent/transfer
  identities. Subsequent annotation/transclusion recovery must qualify their own
  original receipts and actual readback; never replace a MID or resubmit merely
  because transport lost a response.
- Source/annotation create/edit/reading-state/session writes, saved views, file
  reads/uploads, imports and extension page-status integration remain to be ported.
  Native writes need actual admitted provider mappings, current full-source/CAS
  evidence and truthful supplied grant/state preflight, without widening consent.

The earlier SDK807 `5ba1314b` archive remains held and must not be reused. The
corrected successor source/package pin was authorized after SDK808's actual merge
and release qualification; it does not enable Reader's browser/session path.
Journal integration remains last and local-only.
