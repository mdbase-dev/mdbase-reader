# Reader SDK beta.123 migration

## Scope and commits

Worktree: `~/worktrees/consumers/mdbase-reader-sdk-beta123`, branch `sdk/beta123`,
based on `51398b5`. No canonical checkout changes, push, PR, deployment, or real
collection access. Disk checked before installation: 178 GiB available; 177 GiB
available after checks/builds. Node 22.22.0, pnpm 10.7.0.

- `ec4a2c5`: pin every direct `@mdbase-dev/*` dependency to exactly
  `0.1.0-beta.123`, regenerate `pnpm-lock.yaml` with pnpm.
- `ab3426f`: adopt SDK link predicates and revisionless batched reads.
- `67e9495`: adapt scan sizes and saved-view CEL.
- `ec7ce08`: repair stale browser-audit labels without changing production UI.

## Replacements and retained behaviour

| Before                                                                                   | After / reason                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `annotation-query.ts` builds scalar `source.asFile()` target predicates.                 | `linksTo("source", canonicalPath)` owns escaping, missing/null guards and authority resolution. No client basename resolver or new ambiguity policy.                                                                                                                                        |
| `annotationRecordsAt()` builds 50-path disjunctions and drains batches serially.         | `readMany()` owns escaped path selection, deduplication, input ordering and bounded batches (SDK defaults: 100 paths, four independent batches). Reader only maps found entries and adapts failures.                                                                                        |
| A body-query failure discards the cache-check result and falls back to revisioned reads. | Both outer failures and successful outcomes containing batch errors use the existing typed `ConnectRepositoryError` adaptation. Partial batch results are not mistaken for missing records. The same whole-load revisioned-read fallback remains. Missing entries also require point reads. |
| `annotation-source.ts` declares a local optional `values` shape.                         | Uses the SDK's declared `QueryRecord.values`. The source-ID projection remains: `linksTo` supplies predicates, not projected IDs. Its CEL now guards missing source fields and optionally selects the resolved record's ID.                                                                 |
| Small `firstPageSize` values precede larger intended scan sizes.                         | Source libraries/import scans pin 1,000-row pages; annotation overviews pin 500; content/source lookups pin 250. Small bounded ID/link lookups remain unchanged. No total-result cap is imposed on complete membership scans.                                                               |
| Saved library filters dereference optional metadata directly.                            | Standard CEL optional selection handles absent/null reading metadata and missing documents/media types/tags, with the same inbox/note defaults as Reader's immediate UI filtering.                                                                                                          |

Legacy source-ID acceptance is retained: the unresolved-link `contains()` query
is only a candidate filter, followed by exact parsed-reference equality. Aliases
remain accepted when their target is the exact legacy ID; prefix collisions and
links resolving to a different source remain excluded. A membership guard was
added without changing that fallback.

**Not removed:** `annotationQueryScopes()` and its 100-path clauses carry a
resolved-source projection which beta.123 `readMany` cannot express. The four-worker
whole-document hydration and `AnnotationRecordCache` remain because annotations
need authoritative revisions for editing/deletion; beta.123 batch results have
none. Progressive first-16/next-64 publication, cache/mutation ordering, cancellation
ownership, and exact pending-write recovery are unchanged. Batched reads carry
the lifetime signal, not latest-wins coordination that would cancel sibling batches.

## beta.112 → beta.123 compatibility review

Reviewed the Connect tag-to-tag CHANGELOG diff and the query-helper, typed-change,
record-session and client README documentation in the release worktree.

- Standard CEL replaces the old `note`/`present` aliases and rejects field
  selection on null. Reader already avoids those aliases; the new source projection
  guards and saved-library filter changes address nullable metadata. Existing
  user-authored views using retired syntax need owner-reviewed edits; no stored
  collection records or views were rewritten.
- Saved views now require `mdbase.view` implementations. Reader already provisions
  that pack and saves ordinary records; manifest verification and pack-upgrade
  tests pass. No new permissions or setup declaration changes were needed.
- Hosted updates require `patch`, not `fields`; Reader already uses `patch`.
- Removed setup diagnostic counters are not consumed by Reader.
- Typed events and cached `describe()` replace no Reader code: production Reader
  has no collection watch/changes loop or description cache to delete. Adding a
  watch would change behaviour rather than remove a workaround, so none was added.
- SDK refresh-error states require no new session API/UI variants. Reader's custom
  record-session adapters, error/conflict UI and durable recovery tests still pass;
  Reader does not currently use connection-backed `records.follow()`.

## Files and line accounting

Implementation commits change 28 files, **+364 / −119 lines**:

- Dependencies/lockfile: root `package.json`, `pnpm-lock.yaml`,
  `packages/{connect,ui,markdown-editor}/package.json`, and
  `apps/{reader,extension}/package.json`: +33 / −33.
- Production TypeScript: `packages/connect/src/{annotation-query,annotation-source,
annotation-repository,repository-client,diagnostics,source-repository,source-lookups,
content-search-repository,migration-target}.ts` and
  `apps/reader/src/mdbase-library-views.ts`: **+41 / −41**.
- Tests: nine changed/new unit-test files beside those modules, including
  `annotation-read-many.test.ts`: +287 / −42. Coverage includes the real published
  SDK transport seam (205 paths → 100/100/5 batches), quoted/backslash/Unicode paths,
  duplicates, missing rows, empty input, no fabricated revisions, typed outer/batch
  failures, warm-cache fallback, legacy links, and scan sizes.
- Browser fixtures: `apps/reader/scripts/{audit-dockview,audit-simple-annotations}.mjs`:
  +3 / −3. Correct palette label is “Search sources and commands”; conflict action
  is “Keep mine”.

This report is additional documentation, excluded from those implementation counts.
Generated manifest environment drift from tests was restored, not committed.

## Validation

| Command / suite                                          | Exact result                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` / final `pnpm install --frozen-lockfile`  | Pass; all six direct mdbase dependency declarations resolve to beta.123. Installation warns that the existing `unrs-resolver` build script is ignored.                                                                                                                                                                                  |
| `pnpm check`                                             | Pass: ESLint with zero warnings, Prettier, architecture (552 production files, 915 relative imports, 17 workspace packages; zero warnings), all workspace typechecks and tests. 237 Vitest files / **1,037 tests** plus **55 Node tests**, all passed. Connect: 33 files / 123 tests; Reader: 100 files / 390 tests plus 12 Node tests. |
| `pnpm build`                                             | Pass for all five build-bearing apps; manifest validation passes. Reader/extension retain large-chunk warnings.                                                                                                                                                                                                                         |
| `pnpm --filter @mdbase-reader/app test:pdf-touch`        | Pass: handle drag/crossing/autoscroll plus real mobile Reader save/reload scenario. Evidence `/tmp/pdf-touch-handles-EgcrdE`, `/tmp/reader-audit-gWaWBz`.                                                                                                                                                                               |
| `pnpm --filter @mdbase-reader/app test:a11y`             | Pass: 11 screens, no unexpected violations (suite's existing `landmark-unique` allowance unchanged).                                                                                                                                                                                                                                    |
| `test:browser` with `READER_AUDIT_SHARED_EDITING_ONLY=1` | Pass: 7 scenarios, `/tmp/reader-audit-FFbIlz`.                                                                                                                                                                                                                                                                                          |
| `test:browser` with `READER_AUDIT_READING_ONLY=1`        | Pass: 5 scenarios, `/tmp/reader-audit-TdEE5L`.                                                                                                                                                                                                                                                                                          |
| `test:browser` with `READER_AUDIT_RESPONSIVE_ONLY=1`     | Pass: 7 scenarios, `/tmp/reader-audit-ro1EJM`.                                                                                                                                                                                                                                                                                          |
| `test:browser` with `READER_AUDIT_FORMATS_ONLY=1`        | Pass: 4 scenarios, `/tmp/reader-audit-XCEH6G`.                                                                                                                                                                                                                                                                                          |
| Default `pnpm --filter @mdbase-reader/app test:browser`  | **Fails after 27 completed scenarios**, waiting 30 seconds for the workbench annotation's “Edit here” button in `audit-annotation-workbench.mjs`. No captured page errors, console errors or failed requests. Evidence `/tmp/reader-audit-0PJCyv`.                                                                                      |
| Default browser baseline                                 | **Same failure after the same 27 scenarios** on original `51398b5` code, beta.112 SDK and beta.117 UI, retaining only the corrected audit labels. Evidence `/tmp/reader-audit-Q2Agqf`. Baseline ran temporarily in this worktree; the committed upgrade and frozen beta.123 installation were restored afterwards.                      |

Logs: `/tmp/reader-beta123-check-final.log`, `reader-beta123-build.log`,
`reader-beta123-pdf-touch.log`, `reader-beta123-browser.log` (a11y/initial run),
`reader-beta123-browser-final.log`, `reader-beta123-browser-modes.log`, and
`reader-beta112-browser-baseline.log`. Browser servers and browsers were owned,
loopback-only, closed after testing, and used disposable intercepted fixtures.
No real Connect/LAB authority acceptance was attempted.

## Risks and wave B

- Larger pinned scan pages may delay the first response versus the former small
  first page, but avoid permanently small cursor pages. UI publication batching is
  preserved. SDK body batching now overlaps up to four independent batches; those
  batches are not one atomic collection snapshot, just as the former multi-query
  scan was not atomic. No latency improvement is claimed from fixture results.
- The default browser suite remains red on a demonstrated baseline fixture failure;
  it is not reported as passed and workbench production behaviour was not changed.
- **beta.124 revisioned batches:** replace cold N-point revision hydration when
  negotiated authoritative revisions/body forms are available. Preserve editing
  CAS, local-save-overtakes-read and shared cancellation semantics; do not infer a
  revision from `mtime`, size or body content.
- **Metadata queries:** source-ID projection queries/scoped overviews could transfer
  only the needed identity/source metadata; `select` alone does not guarantee that
  today. Projection-capable path batching could retire the retained scoped builder.
- **Authority feature discovery:** select negotiated revision/metadata paths instead
  of inventing error-triggered capability probes or fallback layers.
- **`files.stat`:** replace folder enumeration in `documents.ts` and
  `collection-files.ts` while retaining file-ID-first lookup, revision/digest checks,
  migrated-file fallback, and document URL lease ownership.
