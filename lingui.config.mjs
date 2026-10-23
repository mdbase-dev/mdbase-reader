import { i18nConfig } from "@mdbase-dev/i18n/config";

export default i18nConfig({
  path: "<rootDir>/packages/i18n/locales/{locale}/messages",
  include: [
    "<rootDir>/apps/reader/src",
    "<rootDir>/apps/extension/src",
    "<rootDir>/apps/electron/src",
    "<rootDir>/apps/capacitor/src",
    "<rootDir>/packages/i18n/src",
    "<rootDir>/packages/core/src",
    "<rootDir>/packages/migration/src",
    "<rootDir>/packages/ui/src",
    "<rootDir>/packages/reading-surface/src",
    "<rootDir>/packages/markdown-editor/src",
    "<rootDir>/packages/renderer-pdf/src",
    "<rootDir>/packages/renderer-epub/src",
    "<rootDir>/packages/renderer-html/src",
  ],
  exclude: ["**/*.test.*", "**/*.spec.*", "**/testing/**", "**/tests/**"],
});
