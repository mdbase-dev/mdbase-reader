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

`i18n:check` uses the shared kit's extraction-sync, raw-PO completeness, generated-ID, ICU argument/plural/select/rich-text contracts, strict compilation and structural source guards. Both normal `check` and `build` enforce it, and CI runs those commands. CI does not translate. Identical proper terms require explicit reviewed generated-ID allowlisting per locale in `i18n-policy.json`. Compiler-owned JSON is excluded from Prettier, not from catalogue validation.

During local authoring only, `check:code` runs the unchanged lint/typecheck/test suite and `build:code` builds every workspace without asserting catalogue completeness. Neither substitutes for the normal release gates. Run finite checks/builds via `rpnpm` on this machine.

The initial kit's pnpm bin silently exits because its direct-entry guard compares a symlink against an ESM real path. `scripts/i18n.mjs` calls the actual kit `main()` explicitly and is a temporary portable entry adapter, not a check bypass.

While catalogues are being authored, `pnpm exec lingui compile --workers 1` permits development fallback; it is **not** evidence of translation completeness. Empty target PO entries must never be filled with English just to pass checks.

## Source conventions

Use `Trans` and bound `t` from `useLingui` in `@lingui/react/macro` for components. Static maps must contain lazy descriptors or translate only when called during rendering. Never eagerly translate at module scope, lowercase a translated label to derive another concept, or compare translated text to drive behavior. Counts use whole-message plurals; display-only numbers and dates use the active locale. Keep persisted timestamps, record fields and identifiers unchanged.

Vite macro transforms cover the app, extension pages and separately built worker IIFEs. Extension pages mount the same provider with an asynchronous `chrome.storage.local` locale adapter; the classic service worker loads bundled JSON assets (no executable dynamic imports), follows the same storage key and refreshes persisted context-menu labels on activation. Chrome manifest descriptions/shortcuts use generated `_locales` catalogues; these framework-owned labels follow Chrome's language, while pages and context menus follow the explicit Reader extension choice.

Electron's main process initializes synchronous English from copied compiler-owned JSON, negotiates OS preferences and persists its choice under userData. A narrow validated preload IPC updates native dialogs when the renderer language changes. Capacitor uses the shared renderer; framework-owned prompts follow the OS. Package tests use real Lingui catalogues, not translator mocks. Native builds transform emitted JS after TypeScript so `/macro` imports are not shipped.

## Shared kit dependency

This branch vendors `@mdbase-dev/i18n` from Connect commit `096d80bf`:

- `vendor/mdbase-dev-i18n-0.1.0-beta.141-096d80bf.tgz`
- SHA256 `ba0d9ca37ab265482c8716672995523db9a5f56d15554507bf408b7dcf50e95b`

**Replace the file dependency with the published npm version at merge time**, after the next Connect release. No publication or deployment is authorized by this branch.

## Integration status

This is not yet a complete multilingual release. Translation handoff `5eab755` contains 1,872 English messages and eight deliberately empty target PO scaffolds. The shell/renderer/model source helpers are merged, with a final renderer follow-up pending. Shared public UI catalogue composition, authored target languages, final full remote gates/builds and translated-layout acceptance remain in progress. Sample preview record contents are intentionally preserved as user-like data.

Recorded Chromium preview acceptance (2026-10-23, desk `gcp/reader-i18n`, 1280×686 page viewport) verified all nine picker options, Japanese `html.lang` and date formatting, persisted reload, failed German chunk retaining Japanese and its saved choice, and clearing the failure notice after successful recovery. This used development-fallback target data: it is **not** acceptance of translated Japanese/German copy or their final layouts, connected LAB workflows, or native GUI behavior.
