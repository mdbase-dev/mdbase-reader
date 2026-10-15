# Reader on the new mdbase SDK

## Current declared Private setup SDK intake — 2026-10-15

SDK `9a033b252860ec8624da0abb5ffdecbac56332d2` replaces the prior
`d3559aaa` intake. Native at this source compacts the shared lock from Reader's
two declared packs into one atomic write with the original CAS guard; no
manifest or permission changes. The SDK preserves actionable setup-conflict
messages in every consuming app. Original archive SHA256:
`90ef67523dfa11cb36efe0d996475f1a1c82ac71074e4cd4e95c6fbe02c18be9`.
Native owns bounded declaration-bound setup and atomic starter publication;
the SDK retains only the protected original MID for uncertain-result reconciliation.
No unsigned administration, widened manifest or Hosted fallback is introduced.
The packaged runtime is source `a4331ad466a0d16e87ab3bedeb0963a1e0d1867e`,
SHA256 `3c803e83f81a05855f6e30ca79036d6b19383048a6b11ba5c9a0b5ebf3a1bbe2`.
The ordinary Sign in / Add chooser owns one popup and the original Native
preparation, callback and custody ACK. The callback page delivers only; the
original SDK closes after completion. No app-side alternate protocol, scope,
key transfer or grant-store migration is introduced. Application declaration and
storage identities remain unchanged. Tests and LAB builds do not prove Native
admission, READ/edit/reload or production release qualification.

## Prior intake notes (superseded SDK pin)


Reader is being ported from prod Connect (`@mdbase-dev/connect`) to the public application
entry of the new SDK (`@mdbase-dev/sdk`, `MdbaseConnect`).

## Pin

`packages/connect/vendor/mdbase-dev-sdk-dev-3f417b6d.tgz` is the original
`sdk-dev-3f417b6d` cut from SDK source
`3f417b6d941a42444f17568d7489071d23fcb141`, SHA256
`0c5f04c6adad67d747055ebe12963403e374aefde0999861d759f35e4e118ba6` (4346749 bytes).
Its source, SRI, native pins and original bundled protocol are recorded in
`packages/connect/vendor/mdbase-next-sdk.json`. The SDK bundles beta129
`c280cd194ffd`; the direct legacy protocol dependency remains `d765e675c3da` unchanged.

This is a **DEV/LAB development intake, not release-qualified**. It includes the
public error/status helpers and portable/native-origin sign-in APIs in one pin.
The SDK owns registration, authorization, selection, readiness, Worker, runtime
and recovery. The original 3555291-byte native runtime matches the committed
`9f90af73e1591cafe9c35bdd42f18ae49d5a91a0186e78695e841fecabcd833a` pin,
including the public setup-assessment ABI and owner-binding fixes.
This cut delivers registration-refusal guidance, Private-collection availability
reasons and collection deletion APIs. The earlier unused-protocol exception is
not carried forward; this archive has no vendor warnings. Packaged integrity and
ordinary/frozen installation do not establish live LAB acceptance.

The current cut adds SDK-owned lazy Worker startup and pairing only from a
sign-in gesture, native-return opening, and refused/expired sign-in recovery.
Refusal copy and the enabled Sign in action come from the SDK; clicking invokes
`approve()`, including while authorizing. No app-side pairing or renewal engine
is introduced. Writer's optional file-access consent remains a later SDK capability.

## Design

- Apps reach the SDK only through `@mdbase-reader/connect`. The native adapter is the
  `@mdbase-reader/connect/native` subpath. Staging and production Reader web builds retain
  legacy Connect. The extension loads the SDK only in its offscreen document, not in its
  service worker or page-status bundle.
- `nativeReaderCollection(connection)` builds Reader's existing repositories over the
  connection's borrowed `records` client and `files`:
  - `native-client.ts` maps Reader's Connect-shaped reads, queries and writes onto native
    `get`/`find`/`query`/`pages`/`queryContract` and `create`/`update`/`replaceDocument`/`delete`.
  - Contract-scoped reads and writes use `getContract` and the contract options of
    `create`/`update`/`delete`. As in prod Connect, a contract view carries contract fields and
    no body. A contract write is read back through the same contract view.
  - File descriptors take their media type from the replica (`FileView.mediaType`).
  - Writes keep one mutation ID. A write the replica captured is saved: confirmed, or saved on
    this device when the log hasn't confirmed it within 3 s. The SDK's write ledger keeps and
    settles those across reloads, so Reader keeps no pending-write list of its own. Only a
    refused write fails. An unknown outcome surfaces `operation_outcome_unknown` with the
    original `request_id`, which can be recovered.
  - `native-files.ts` resumes uploads with the same transfer and mutation IDs and checks
    digests on download.
  - Every await is fenced by `connection.isCurrent()`.
- Unsupported features are refused (`unsupported_operation`), never emulated. See the gap list
  in the coordinator's `reader-sdk-gaps.md`.
- `SdkReaderRoot` renders the shared `CollectionGate` from `@mdbase-dev/ui/collections`
  (vendored as `vendor/mdbase-dev-ui-dev-<cut>.tgz`, pinned in `vendor/mdbase-ui-dev.json`):
  - The gate owns sign-in, choosing, approval, setup review, problems and sign-out
    (`signOut()`, never `close()`). Reader supplies only its name and mark.
  - It starts the entry once (StrictMode-safe); the entry follows page visibility.
  - It renders the reading workspace only for the connection the gate hands over in
    phase `ready`, and disposes its adapters, never the borrowed client.
  - The header shows the shared `CollectionSwitcher`; unsaved edits are confirmed
    before switching. Legacy `ConnectReader` keeps its own `CollectionPicker`.
  - `apps/reader` depends on the same SDK cut as `packages/connect`, so app-ui's SDK
    peer resolves to it. The legacy native sign-in imports the release SDK819 archive
    under the alias `@mdbase-dev/sdk-legacy-729b5391`.

## Live hookup

- `src/sdk-application.ts`: `readerSdk()` is the page's single `createMdbase` entry. It uses the
  bundled canonical manifest unchanged: logical ID `dev.mdbase.reader`, name, and homepage
  origin. The SDK registers it and rebinds to the actual registered ID before any storage.
  Construction does no IO.
- `src/main.tsx`: builds with `VITE_MDBASE_ENV=lab` (the LAB Pages deployment) lazily load
  `SdkReaderRoot` over that entry. Staging and production still render `ConnectReader` until
  the SDK has production release trust.
- `vite.config.ts` excludes `@mdbase-dev/sdk` from dev pre-bundling, emits ES-module workers,
  and gives worker bundles the same build-tagged file names, so the SDK Worker,
  `runtime-lab.wasm`, `sqlite3.wasm` and `sqlite3.js` are each emitted once. The SDK stays out of
  the eager entry chunks.

The previous production build passed at `38001079`; n1 checks are recorded
separately from live LAB acceptance.
Live LAB registration, Worker start and readiness have not been exercised. Old local data and
pending writes need no cutover handoff.

## Extension SDK owner

The extension runs one SDK entry in an on-demand offscreen document. The service worker
creates that document; extension pages and the worker use a same-origin BroadcastChannel
with explicit public application and Reader repository commands. Repository results are
structured clones of the host's typed values. Callers never close the SDK owner.

Calls retain their original host generation. Already-aborted calls do not dispatch;
caller disposal and host replacement settle outstanding calls without retrying mutations.
The last SDK snapshot is retained unchanged during restart, with transport availability
reported separately. Uncertain body writes go through SDK recovery of the original request
and readback, never a fresh mutation. Saved-page marks and highlights work without an open
panel. Public SDK-fixture tests are not real-Chrome, authenticated or durability acceptance;
those checks remain pending an isolated LAB lease.

## Library imports in SDK mode

LAB `/import`, `/import/zotero` and `/import/readwise` use the same public SDK
entry and original native collection as the reading workspace. The import home
shows the existing tiles without starting sign-in. Service pages keep the existing
inputs, preview, confirmation and progress UI, with embedded SDK destination
actions instead of loading the legacy `readerSession`. Staging and production
retain their existing import session and UI.

The app import controller retains the parsed input while the SDK chooses a
destination. Its narrow domain provider returns only the actual collection whose
original connection and aggregate SDK readiness are current. The existing native
migration target owns record/file operations through the public SDK, with original
identities, receipt recovery and confirmed readback unchanged. A destination check
is still required before import, and a started import stays bound to its confirmed
collection. Retired scopes stop the job; late checks, progress and completions
cannot become confirmation for a replacement scope. No SDK session, storage,
setup or recovery engine is supplied by this UI.

## Launch-branch integration

`next/new-sdk` brings together the public-entry/import line and the shared collection
screens. Setup review, problems and live notices (migration, update requirements,
account suspension) come from `@mdbase-dev/ui/collections` over the SDK's phase and
`describeError` copy, without raw or developer-only diagnostics.

The older next-branch record-read foundation, provider rechecks and optional
native sign-in/owned-popup controls are preserved, not substituted for the LAB
public entry. Historical SDK819 artifacts are not the active dependency.

The source-qualified Chrome Store identity is
`chrome-extension://kimdfjefhbfgfecconmaiaaindjccidp`, documented in
`docs/extension-releases.md` at `7ea5dded5b8d196763d4565224502c9840b2ced3`.
This is distinct from unpacked development installs; it does not prove SDK
extension acceptance or effective CORS configuration.

## Checks

The adapter, recovery and lifecycle tests run over the SDK's `MemoryReplica` and application
fixture (`@mdbase-reader/connect/testing`). They do not qualify native runtime, registration or
end-to-end LAB operation.
