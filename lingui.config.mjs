import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  locales: ["en", "fr", "de", "es", "ja", "ko", "pt", "ru", "zh"],
  sourceLocale: "en",
  fallbackLocales: { default: "en" },
  format: formatter({ origins: true, lineNumbers: false }),
  catalogs: [
    {
      path: "<rootDir>/packages/i18n/locales/{locale}/messages",
      include: [
        "<rootDir>/apps/reader/src",
        "<rootDir>/apps/extension/src",
        "<rootDir>/apps/electron/src",
        "<rootDir>/apps/capacitor/src",
        "<rootDir>/packages/core/src",
        "<rootDir>/packages/ui/src",
        "<rootDir>/packages/reading-surface/src",
        "<rootDir>/packages/markdown-editor/src",
        "<rootDir>/packages/renderer-pdf/src",
        "<rootDir>/packages/renderer-epub/src",
        "<rootDir>/packages/renderer-html/src",
      ],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/testing/**"],
    },
  ],
  compileNamespace: "json",
});
