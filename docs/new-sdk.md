# Reader on the new mdbase SDK

Reader is being ported from prod Connect (`@mdbase-dev/connect`) to the public application
entry of the new SDK (`@mdbase-dev/sdk`, `MdbaseConnect`).

## Pin

`packages/connect/vendor/mdbase-dev-sdk-7193fd0d.tgz` comes from SDK source
`7193fd0d396dfec3b339fd3b353248bf3354d963`, SHA256
`2d03c9ddd75d844861ebf864cb7c0c4c51bbfed59965d8f29573053467ccfd03`. Its source commit, hashes
and protocol dependency (beta129 `d765e675c3da`) are recorded in
`packages/connect/vendor/mdbase-next-sdk.json`.

This is a **development intake, not release-qualified**. It is the first intake with the live
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
- `vite.config.ts` excludes `@mdbase-dev/sdk` from dev pre-bundling and emits ES-module
  workers, so the SDK's module-relative Worker URL resolves.

**Blocked:** at `7193fd0d` the Reader build fails inside the SDK bundle. It references a
`sqlite3-worker1.mjs` that the package does not ship. The SDK's native wasm is also not
bundler-emitted. Both are SDK fixes; no app workaround is added. Old local data and pending
writes need no cutover handoff.

## Checks

The adapter, recovery and lifecycle tests run over the SDK's `MemoryReplica` and application
fixture (`@mdbase-reader/connect/testing`). They do not qualify native runtime, registration or
end-to-end LAB operation.
