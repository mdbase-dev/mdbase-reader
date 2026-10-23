import { i18n } from "@lingui/core";
import { createI18nRuntime, type Catalogue } from "@mdbase-dev/i18n";
import english from "@mdbase-reader/i18n/english";

import { extensionLocaleStorage, followExtensionLocale } from "./extension-locale.js";

/** Classic worker: JSON assets, not dynamic executable chunks or remote packs. */
export const backgroundI18n = createI18nRuntime({
  i18n,
  english,
  loadLocale: async (locale) => {
    const response = await fetch(chrome.runtime.getURL(`locales/${locale}.json`));
    if (!response.ok) {
      throw new Error("Bundled extension catalogue is unavailable");
    }
    return (await response.json()) as Catalogue;
  },
  storage: extensionLocaleStorage,
});

followExtensionLocale(backgroundI18n);
export const backgroundLocaleReady = backgroundI18n.initialize().catch(() => undefined);
