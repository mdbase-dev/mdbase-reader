# Reader on the mdbase SDK

Reader pins `@mdbase-dev/sdk` beta.209. Application access goes through `createMdbase`
and the public `Mdbase` interface; the shared collection UI and translations come from
`@mdbase-dev/ui` and `@mdbase-dev/i18n`. The manifest validator uses `@mdbase-dev/sdk/manifest`.
There is no direct legacy Connect or protocol dependency.

## Collections and repositories

Every web build enters `SdkReaderRoot` from `main.tsx`. The SDK owns sign-in,
selection, setup and connection lifetime. `nativeReaderCollection(connection)`
borrows that connection for Reader's domain repositories and never closes its client.
Repository values are native `RecordView`, `QueryResult` and plain JSON. Reads use
options objects; writes retain native record witnesses and settle through `settle`.
The old application sessions, Connect-shaped native adapter and revisionless
annotation cache have been removed.

Reader still owns its domain mapping, complete-list requirement, deletion confirmation,
and the create naming/relink journal. The SDK owns mutation identity, receipts,
optimistic state and record observation. Reader's connection and pending-write UI
uses `snapshot.sync.state` and `pendingFor`.

## Editors

Source notes and annotation editors open SDK native record leases through `Mdbase`.
They use the same interface whether the application was created directly or belongs
to a shared session. The SDK owns autosave, conflicts, observation and exact mutation
recovery. Reader keeps its existing source checkpoint and older annotation draft
recovery, retaining the SDK's actual recovery reference when needed.

The sample preview has no real `Mdbase`, so source-note and annotation body editing
are read-only there. Connected web editing uses native leases.

## Extension integration dependency

The extension editor now also requires a real `Mdbase`. Its current repository RPC
bridge cannot supply native record leases. No lease commands or compatibility shim
have been added to that bridge: extension editor depends on
feat/extension-shared-session. That lane will supply each extension page with a real
`Mdbase` using `session: {build, host}`.

## Imports and validation

All environments use the SDK import destination and native migration target. A
started import stays bound to its confirmed collection; a retired scope cannot
publish completion for its replacement. Import settlement uses original mutation
identities and confirmed readback.

Unit tests use the public SDK `MemoryReplica` and application fixtures through
`@mdbase-reader/connect/testing`. They establish in-process behavior, not live LAB,
native-runtime, authentication or durability qualification. Historical vendored
archives and publisher custody metadata are maintained separately.
