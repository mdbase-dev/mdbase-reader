# Reader on the new mdbase SDK

Reader is being ported from prod Connect (`@mdbase-dev/connect`) to the public application
entry of the new SDK (`@mdbase-dev/sdk`, `MdbaseConnect`).

## Pin

`packages/connect/vendor/mdbase-dev-sdk-38001079.tgz` comes from SDK source
`3800107992f345cbf62665b945a5073de34e07b6`, SHA256
`d2c04aeb38932d43fba0601ab385f325898b3794845cee5322a42ca64ad412e4`. Its source commit, hashes
and protocol dependency (beta129 `d765e675c3da`) are recorded in
`packages/connect/vendor/mdbase-next-sdk.json`.

This is a **development intake, not release-qualified**. It carries the live
`MdbaseConnect` singleton: registration, then storage, then Worker, then runtime, plus
`snapshot.selection` and `approve`/`reauthorize`/`chooseAnother`. Its public entry refuses the
production environment.

## Design

- Apps reach the SDK only through `@mdbase-reader/connect`. The native adapter is the
  `@mdbase-reader/connect/native` subpath, so the Connect-only bundles (extension, staging,
  production) never parse the SDK entry or its Worker.
- `nativeReaderCollection(connection)` builds Reader's existing repositories over the
  connection's borrowed `records` client and `files`:
  - `native-client.ts` maps Reader's Connect-shaped reads, queries and writes onto native
    `get`/`find`/`query`/`pages`/`queryContract` and `create`/`update`/`replaceDocument`/`delete`.
  - Contract-scoped reads and writes use `getContract` and the contract options of
    `create`/`update`/`delete`. As in prod Connect, a contract view carries contract fields and
    no body. A contract write is read back through the same contract view.
  - File descriptors take their media type from the replica (`FileView.mediaType`).
  - Writes keep one mutation ID. They report saved only after a confirmed receipt or readback;
    otherwise they surface `operation_outcome_unknown` with the original `request_id`, which
    can be recovered.
  - `native-files.ts` resumes uploads with the same transfer and mutation IDs and checks
    digests on download.
  - Every await is fenced by `connection.isCurrent()`.
- Unsupported features are refused (`unsupported_operation`), never emulated. See the gap list
  in the coordinator's `reader-sdk-gaps.md`.
- `SdkReaderRoot` leaves sign-in, consent, collection selection and approval, and setup
  (`configure()`) to the SDK:
  - It starts the entry once (StrictMode-safe) and forwards foreground state.
  - It renders the reading workspace only for a current connection with READY readiness.
  - It disposes its adapters, never the borrowed client.
  - For a collection requested by the link, `approval_required` and `invalid` offer
    **Approve this collection** or **Choose another collection**. Reader never falls back to
    another collection.

## Live hookup

- `src/sdk-application.ts`: `readerSdk()` is the page's single `MdbaseConnect`. It uses the
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

The production build passes at `38001079`, and the emitted wasm matches the SDK's asset pins.
Live LAB registration, Worker start and readiness have not been exercised. Old local data and
pending writes need no cutover handoff.

## Checks

The adapter, recovery and lifecycle tests run over the SDK's `MemoryReplica` and application
fixture (`@mdbase-reader/connect/testing`). They do not qualify native runtime, registration or
end-to-end LAB operation.
