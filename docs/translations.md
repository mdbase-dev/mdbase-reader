# Interface translations

Reader uses Lingui 6.9 with generated IDs from English source and semantic context. PO catalogues under `packages/i18n/locales/<language>/messages.po` are locally authored translations; adjacent JSON files are compiler-owned ICU data. Never translate documents, paths, stable behavioral keys, product names or authority diagnostics.

## Languages and runtime

Supported languages: English, French, German, Spanish, Japanese, Korean, Brazilian Portuguese (`pt`), Russian, Simplified Chinese (`zh`) and Italian (`it`, endonym “Italiano”). The TaskNotes plugin explicitly identifies its Portuguese variant as Brazilian Portuguese.

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

Kit commit `24e9f5d0` includes the public-bin fix, nested plural/explicit-instance/class-field source-guard repairs, field-level tracking, rendered-state notice detection, compiled-catalogue composition checking and obsolete-message pruning. Scripts invoke its public `mdbase-i18n` bin directly; no adapter or source exclusions are needed. Its source guard passes all 487 modules without newly unmarked copy, so adoption adds no English message IDs.

While catalogues are being authored, `pnpm exec lingui compile --workers 1` permits development fallback; it is **not** evidence of translation completeness. Empty target PO entries must never be filled with English just to pass checks.

## Source conventions

Use `Trans` and bound `t` from `useLingui` in `@lingui/react/macro` for components. Static maps must contain lazy descriptors or translate only when called during rendering. Never eagerly translate at module scope, lowercase a translated label to derive another concept, or compare translated text to drive behavior. Counts use whole-message plurals; display-only numbers and dates use the active locale. Keep persisted timestamps, record fields and identifiers unchanged.

Vite macro transforms cover the app, extension pages and separately built worker IIFEs. Extension pages mount the same provider with an asynchronous `chrome.storage.local` locale adapter; the classic service worker loads bundled JSON assets (no executable dynamic imports), follows the same storage key and refreshes persisted context-menu labels on activation. Chrome manifest descriptions/shortcuts use generated `_locales` catalogues; these framework-owned labels follow Chrome's language, while pages and context menus follow the explicit Reader extension choice.

Electron's main process initializes synchronous English from copied compiler-owned JSON, negotiates OS preferences and persists its choice under userData. A narrow validated preload IPC updates native dialogs when the renderer language changes. Capacitor uses the shared renderer; framework-owned prompts follow the OS. Package tests use real Lingui catalogues, not translator mocks. Native builds transform emitted JS after TypeScript so `/macro` imports are not shipped.

## Shared kit dependency

This branch vendors `@mdbase-dev/i18n` from Connect commit `24e9f5d0`:

- `vendor/mdbase-dev-i18n-0.1.0-beta.141-24e9f5d0.tgz`
- SHA256 `b65ce6066f9e096eea183209c93b42950f21f8e78a0d105838a15da9ca82ce46`

Its `createI18nRuntime` encodes backslashes in interpolated string values once per Lingui instance, so user text such as `C:\x41dir` renders literally. Reader relies on it and has no wrapper of its own; a second encoding pass would display `\` as `\u005c`.

Public UI integration uses `vendor/mdbase-dev-ui-0.1.0-beta.141-24e9f5d0.tgz` (SHA256 `1230707f2ba9545a041f2a9325ab5e2d25ed001885ebc0369d836e00b19d30f0`). Its `uiCatalogues` source is composed by the shared runtime, so library strings remain library-owned and use the exact same Lingui singleton. Reader gives potentially colliding generic messages semantic contexts to prevent independent PO translations from conflicting. This is the coordinator's strict-complete shared UI pin: 197 active messages per locale, with obsolete `nzHlj8` pruned. Translation integration is complete; it is not publisher/release qualification. Reader’s protected publisher gate currently refuses it against the approved UI original. Historical approved tarballs, trust pins and verification tests have not been changed; normal authorized intake/release qualification is required before that gate can be green.

**Replace the file dependency with the published npm version at merge time**, after the next Connect release. No publication or deployment is authorized by this branch.

Italian also appears in the separate citation-output locale picker. The citation-js bundled locale subset has no Italian data, so `src/locales/csl-it-IT.xml` supplies pinned, attributed CSL data (see its adjacent README), loaded lazily from Reader’s own deployment. Citation output language remains an explicit choice, separate from interface language; source metadata is never rewritten.

All shells were audited: web and Capacitor share the renderer’s ten-locale runtime; Electron validates through the kit and copies every compiled locale; extension pages/worker share kit validation and the Chrome map emits `it` assets. Zotero exporter has no locale list or locale-negotiation system; its standalone UI remains outside this catalogue scope.

## Reviewed identical terms

`allowIdentical` lists only reviewed message IDs: CSL/DOI, PDF/EPUB and Web format labels, the Tab key, GiB units, placeholder-only punctuation, Spanish “No”, technical `citekey` labels, and legitimate German/Portuguese cognates (for example Format, Status, Software, Layout, German Organisation and Portuguese Volume). German “in” and “Tag(s)” are deliberate contextual translations, not placeholders. Italian additionally retains reviewed Circa, FILE, Password, Post, Software, Standard, Tag, Volume, No and the preposition “in”; its 27 allowlisted IDs contain only Italian words, established loanwords, technical terms and argument-only punctuation. These are legitimate invariant terms, not fallback prose. No empty target or arbitrary English sentence is permitted by the check.

## Italian review

Italian catalogue `efbcb5f` contributes 1,894 messages. Extraction normalizes PO wrapping only; in-product review corrected the interface-language label (which incorrectly contained the large-document warning), Readwise Feed wording, neutral import/citation help and one restart notice. The long Readwise token/download/metadata guarantees, Zotero checksum/folder instructions and citation structured/CSL help were reviewed in context. No user titles, citation keys, rich-text tags or placeholders changed.

Italian acceptance (2026-10-24, desk `gcp/reader-italian`, preview `:19310/?preview`) passes at 1280×686 and 390×844: picker, persisted reload, dates/plurals, all six palette headings and structured/CSL citation help/output, with no page errors or page horizontal overflow. Long migration help and warning plurals were reviewed through actual disabled components without SDK/collection access. Built Electron runtime persistence and emitted extension Italian assets also pass smoke checks. Evidence: initiative `burst/inventory/reader-italian/`. Ten-locale strict composition/plural/source gates, lint/typecheck, all 1,346 workspace tests and full development/production builds pass. The full check still has exactly five pre-existing protected-publisher fixture failures (175/180 pass); no fixtures or qualification pins were changed. Zotero exporter XPI is 11,243 bytes, below 5,000,000. This is not connected LAB/import or native GUI certification. Temporary desk, tunnel, harness and dev server were removed/stopped.

## Integration status

All nine target catalogues (ten including English) are merged and pass the kit’s strict authored-entry/ICU/tag checks: 1,894 messages per locale, with no English fallback placeholders. German `efc7753`, Russian `c5f9efc`, Portuguese `73c5043` and Japanese `b4fdf29` complete the previous French/Spanish/Korean/Chinese integration. Japanese passed `progress.py` against its base; unreachable `one` plural arms were then removed for Japanese's `other`-only plural rules, preserving authored text. Public UI catalogue composition also passes for every locale. This is still not a release-qualified build: protected publisher inputs and the shared UI artifact require authorized qualification. See the PR for current full gates and layout evidence. `rpnpm build` checks/builds every workspace for development; `rpnpm build:production` sets `MDBASE_ENV` inside the remote job for the CI-equivalent production build. The import-confirmation plural now uses one named `collectionName` argument in every arm (rather than duplicate positional arguments), allowing valid Korean/Chinese `other`-only plurals without losing an argument. Existing translations were carried mechanically across this contract-only ID change and the nine semantic-context ID moves. The public CommandPalette now uses `readerCommandGroupLabel` through its presentation-only `groupLabel` callback. Group, command and `showAll` IDs remain unchanged; the real-catalogue integration test checks live Japanese/German/Italian headings, browse limits and command execution. Sample preview record contents are intentionally preserved as user-like data.

Final-pin palette acceptance (2026-10-24, desk `gcp/reader-palette`, local `:19300/?preview`) verifies Japanese/German headings at 1280×686 and 390×844, persisted reload, original source titles, no page overflow or page errors. Opening a sample source through the palette exposes all six translated group headings; top/bottom captures verify the scrollable groups. Evidence and repeatable scripts: initiative `burst/inventory/reader-palette/`. The temporary desktop, tunnel and dev server were stopped. This remains sample-preview acceptance only.

Authored German/Japanese layout acceptance (2026-10-24, desk `gcp/reader-final-i18n`, local `:19300/?preview`) covers the library, settings and add-source dialog at 1280×686, and library/settings at 390×844. All 12 captures have no page-level horizontal overflow or page errors. Locale/date/status text, `html.lang`, persisted reload and live dock-tab title updates pass. Built-in tab titles retranslate; saved view names and source titles remain user data. Evidence is in the initiative workspace's `burst/inventory/reader-layout/`. This is sample-preview acceptance, not connected LAB or native GUI verification.

Recorded Chromium preview acceptance (2026-10-23, desk `gcp/reader-i18n`, 1280×686 page viewport) verified all nine picker options, Japanese `html.lang` and date formatting, persisted reload, failed German chunk retaining Japanese and its saved choice, and clearing the failure notice after successful recovery. This used development-fallback target data: it is **not** acceptance of translated Japanese/German copy or their final layouts, connected LAB workflows, or native GUI behavior.
