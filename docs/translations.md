# Interface translations

Reader uses Lingui 6.9 with generated IDs from English source and semantic context. PO catalogues under `packages/i18n/locales/<language>/messages.po` are locally authored translations; adjacent JSON files are compiler-owned ICU data. Never translate documents, paths, stable behavioral keys, product names or authority diagnostics.

## Languages and runtime

Supported languages: English, French, German, Spanish, Japanese, Korean, Brazilian Portuguese (`pt`) and Russian, plus Simplified Chinese (`zh`). The TaskNotes plugin explicitly identifies its Portuguese variant as Brazilian Portuguese.

The **Display settings** menu contains the language picker. The default is the best supported browser/OS locale, otherwise English. A successful explicit selection persists. English is synchronous with no fetch; target catalogues are lazy chunks from Reader's own deployment. A failed chunk leaves the current language and previous persisted choice intact. The real provider and non-React helpers share one injected Lingui singleton; `html.lang` follows activation. This does not imply collection access works offline.

## Local authoring and checks

```sh
pnpm i18n:extract
# Local language agents author/review target PO files, never English placeholders.
pnpm i18n:source
pnpm i18n:check
```

`i18n:check` uses the shared kit's extraction-sync, raw-PO completeness, generated-ID, ICU argument/plural/select/rich-text contracts, strict compilation and structural source guards. It also runs `check --compose` against `packages/i18n/node_modules/@mdbase-dev/ui/dist/locales/{locale}/messages.json`, the only runtime `CatalogueSource` library, to reject app/library translation collisions in every locale. Both normal `check` and `build` enforce it, and CI runs those commands. CI does not translate. Identical proper terms require explicit reviewed generated-ID allowlisting per locale in `i18n-policy.json`. Compiler-owned JSON is excluded from Prettier, not from catalogue validation.

During local authoring only, `check:code` runs the unchanged lint/typecheck/test suite and `build:code` builds every workspace without asserting catalogue completeness. Neither substitutes for the normal release gates. Run finite checks/builds via `rpnpm` on this machine.

Kit commit `a36fa009` includes the public-bin fix, nested plural/explicit-instance/class-field source-guard repairs, field-level tracking, rendered-state notice detection, compiled-catalogue composition checking and obsolete-message pruning. Scripts invoke its public `mdbase-i18n` bin directly; no adapter or source exclusions are needed. Its source guard passes all 487 modules without newly unmarked copy, so adoption adds no English message IDs.

While catalogues are being authored, `pnpm exec lingui compile --workers 1` permits development fallback; it is **not** evidence of translation completeness. Empty target PO entries must never be filled with English just to pass checks.

## Source conventions

Use `Trans` and bound `t` from `useLingui` in `@lingui/react/macro` for components. Static maps must contain lazy descriptors or translate only when called during rendering. Never eagerly translate at module scope, lowercase a translated label to derive another concept, or compare translated text to drive behavior. Counts use whole-message plurals; display-only numbers and dates use the active locale. Keep persisted timestamps, record fields and identifiers unchanged.

Vite macro transforms cover the app, extension pages and separately built worker IIFEs. Extension pages mount the same provider with an asynchronous `chrome.storage.local` locale adapter; the classic service worker loads bundled JSON assets (no executable dynamic imports), follows the same storage key and refreshes persisted context-menu labels on activation. Chrome manifest descriptions/shortcuts use generated `_locales` catalogues; these framework-owned labels follow Chrome's language, while pages and context menus follow the explicit Reader extension choice.

Electron's main process initializes synchronous English from copied compiler-owned JSON, negotiates OS preferences and persists its choice under userData. A narrow validated preload IPC updates native dialogs when the renderer language changes. Capacitor uses the shared renderer; framework-owned prompts follow the OS. Package tests use real Lingui catalogues, not translator mocks. Native builds transform emitted JS after TypeScript so `/macro` imports are not shipped.

## Shared kit dependency

This branch vendors `@mdbase-dev/i18n` from Connect commit `a36fa009`:

- `vendor/mdbase-dev-i18n-0.1.0-beta.141-a36fa009.tgz`
- SHA256 `da2ae8145e5744733c29726a5b56f999c19f82bdd9d48c57d67da29cc18dd9b5`

Public UI integration uses `vendor/mdbase-dev-ui-0.1.0-beta.141-a36fa009.tgz` (SHA256 `e7199463d7f4d282cfd6f5f16e71dc1aa1029330a634f43112ae5b2f63dea7a0`). Its `uiCatalogues` source is composed by the shared runtime, so library strings remain library-owned and use the exact same Lingui singleton. Reader gives potentially colliding generic messages semantic contexts to prevent independent PO translations from conflicting. This is the coordinator's strict-complete shared UI pin: 197 active messages per locale, with obsolete `nzHlj8` pruned. Translation integration is complete; it is not publisher/release qualification. Reader’s protected publisher gate currently refuses it against the approved UI original. Historical approved tarballs, trust pins and verification tests have not been changed; normal authorized intake/release qualification is required before that gate can be green.

**Replace the file dependency with the published npm version at merge time**, after the next Connect release. No publication or deployment is authorized by this branch.

## Reviewed identical terms

`allowIdentical` lists only reviewed message IDs: CSL/DOI, PDF/EPUB and Web format labels, the Tab key, GiB units, placeholder-only punctuation, Spanish “No”, technical `citekey` labels, and legitimate German/Portuguese cognates (for example Format, Status, Software, Layout, German Organisation and Portuguese Volume). German “in” and “Tag(s)” are deliberate contextual translations, not placeholders. These are legitimate invariant terms, not fallback prose. No empty target or arbitrary English sentence is permitted by the check.

## Integration status

All eight target catalogues are merged and pass the kit’s strict authored-entry/ICU/tag checks: 1,894 messages per locale, with no English fallback placeholders. German `efc7753`, Russian `c5f9efc`, Portuguese `73c5043` and Japanese `b4fdf29` complete the previous French/Spanish/Korean/Chinese integration. Japanese passed `progress.py` against its base; unreachable `one` plural arms were then removed for Japanese's `other`-only plural rules, preserving authored text. Public UI catalogue composition also passes for every locale. This is still not a release-qualified build: protected publisher inputs and the shared UI artifact require authorized qualification. See the PR for current full gates and layout evidence. `rpnpm build` checks/builds every workspace for development; `rpnpm build:production` sets `MDBASE_ENV` inside the remote job for the CI-equivalent production build. The import-confirmation plural now uses one named `collectionName` argument in every arm (rather than duplicate positional arguments), allowing valid Korean/Chinese `other`-only plurals without losing an argument. Existing translations were carried mechanically across this contract-only ID change and the nine semantic-context ID moves. The public CommandPalette now uses `readerCommandGroupLabel` through its presentation-only `groupLabel` callback. Group, command and `showAll` IDs remain unchanged; the real-catalogue integration test checks live Japanese/German headings, browse limits and command execution. Sample preview record contents are intentionally preserved as user-like data.

Final-pin palette acceptance (2026-10-24, desk `gcp/reader-palette`, local `:19300/?preview`) verifies Japanese/German headings at 1280×686 and 390×844, persisted reload, original source titles, no page overflow or page errors. Opening a sample source through the palette exposes all six translated group headings; top/bottom captures verify the scrollable groups. Evidence and repeatable scripts: initiative `burst/inventory/reader-palette/`. The temporary desktop, tunnel and dev server were stopped. This remains sample-preview acceptance only.

Authored German/Japanese layout acceptance (2026-10-24, desk `gcp/reader-final-i18n`, local `:19300/?preview`) covers the library, settings and add-source dialog at 1280×686, and library/settings at 390×844. All 12 captures have no page-level horizontal overflow or page errors. Locale/date/status text, `html.lang`, persisted reload and live dock-tab title updates pass. Built-in tab titles retranslate; saved view names and source titles remain user data. Evidence is in the initiative workspace's `burst/inventory/reader-layout/`. This is sample-preview acceptance, not connected LAB or native GUI verification.

Recorded Chromium preview acceptance (2026-10-23, desk `gcp/reader-i18n`, 1280×686 page viewport) verified all nine picker options, Japanese `html.lang` and date formatting, persisted reload, failed German chunk retaining Japanese and its saved choice, and clearing the failure notice after successful recovery. This used development-fallback target data: it is **not** acceptance of translated Japanese/German copy or their final layouts, connected LAB workflows, or native GUI behavior.
