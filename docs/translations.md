# Interface translations

This branch migrates Reader and its shells to Lingui 6.9. English source and semantic context generate message IDs. PO files under `locales/<language>/messages.po` are locally authored, reviewable translations; JSON files are compiler-owned ICU data. Never edit generated JSON or translate user content, paths, stable keys or product names.

## Commands

- `pnpm i18n:extract`: extract English and scaffold all nine locale catalogues.
- `pnpm i18n:compile`: compile catalogues (development only while translation work is incomplete).

Target languages are English, French, German, Spanish, Japanese, Korean, Brazilian Portuguese, Russian and Simplified Chinese. Empty PO translations remain visibly incomplete; never fill them with English placeholders.

## Integration in progress

The initial runtime slice initializes synchronous English and wraps the app in a real Lingui provider. The shared `@mdbase-dev/i18n` kit, lazy locales, persisted language choice, source/completeness guards, shell builds and the remaining interface migration follow in subsequent commits. This slice is not a complete multilingual release.

For app components use `Trans` and `useLingui` from `@lingui/react/macro`. Bound `t` from `useLingui` tracks language changes. For non-React model code prefer lazy `msg` descriptors for static maps; translate at render time. If a non-React function must translate immediately, use the shared Lingui instance rather than an unrelated `setupI18n()` instance. Never eagerly translate at module load, and never compare translated labels to drive behavior.

New Vite entry points need `lingui({ macroTransform: true })`. The initial app Vite configuration supplies this transform for both production and Vitest. Tests must render actual translated components inside the real provider, not mock translation functions.
