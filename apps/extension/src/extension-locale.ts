import { isLocale, type I18nRuntime, type LocaleStorage } from "@mdbase-dev/i18n";

const localeKey = "mdbase-reader:locale";

/** Shared by pages and the service worker; unlike localStorage, this reaches both. */
export const extensionLocaleStorage: LocaleStorage = {
  getLocale: async () => {
    const value: unknown = (await chrome.storage.local.get(localeKey))[localeKey];
    return isLocale(value) ? value : null;
  },
  setLocale: async (locale) => {
    await chrome.storage.local.set({ [localeKey]: locale });
  },
};

export function followExtensionLocale(runtime: I18nRuntime): () => void {
  const follow = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    const value: unknown = changes[localeKey]?.newValue;
    if (area === "local" && isLocale(value) && value !== runtime.i18n.locale) {
      // Selection is generation-guarded by the kit; a stale chunk cannot win.
      void runtime.selectLocale(value).catch(() => undefined);
    }
  };
  chrome.storage.onChanged.addListener(follow);
  return () => chrome.storage.onChanged.removeListener(follow);
}
