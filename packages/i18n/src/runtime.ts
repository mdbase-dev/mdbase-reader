import { I18n, i18n, type MessageDescriptor, type MessageOptions } from "@lingui/core";
import { createI18nRuntime } from "@mdbase-dev/i18n";
import { uiCatalogues } from "@mdbase-dev/ui/i18n";

import english from "../locales/en/messages.json";

import type { LocaleStorage } from "@mdbase-dev/i18n";

const loaders = {
  fr: () => import("../locales/fr/messages.json"),
  de: () => import("../locales/de/messages.json"),
  es: () => import("../locales/es/messages.json"),
  it: () => import("../locales/it/messages.json"),
  ja: () => import("../locales/ja/messages.json"),
  ko: () => import("../locales/ko/messages.json"),
  pt: () => import("../locales/pt/messages.json"),
  ru: () => import("../locales/ru/messages.json"),
  zh: () => import("../locales/zh/messages.json"),
};

const storageKey = "mdbase-reader:locale";
const browserStorage: LocaleStorage = {
  getLocale: () => {
    try {
      return globalThis.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  },
  setLocale: (locale) => {
    // Some private/embedded browsers refuse storage; a language can still be
    // used for this session. Never let this block startup or discard a draft.
    try {
      globalThis.localStorage.setItem(storageKey, locale);
    } catch {
      return;
    }
  },
};

let localeStorage = browserStorage;

/** Set before mounting an extension page; keep exactly one owner of the singleton. */
export function setReaderLocaleStorage(storage: LocaleStorage): void {
  localeStorage = storage;
}

// Lingui 6.9 decodes JavaScript escapes after interpolation, including in user text such as
// `C:\x41dir`. Encode string-value backslashes for that single decoding pass; values passed in
// are never mutated.
const renderMessage = I18n.prototype._.bind(i18n);
i18n._ = (
  id: string | MessageDescriptor,
  values?: Record<string, unknown>,
  options?: MessageOptions,
): string =>
  typeof id === "string"
    ? renderMessage(id, literalValues(values), options)
    : renderMessage({ ...id, ...(id.values ? { values: literalValues(id.values) } : {}) });
i18n.t = i18n._.bind(i18n);

function literalValues(
  values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return (
    values &&
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        typeof value === "string" ? value.replaceAll("\\", "\\u005c") : value,
      ]),
    )
  );
}

// English is immediately active, with no fetch or asynchronous startup gate.
export const readerI18n = createI18nRuntime({
  i18n,
  english,
  libraries: [uiCatalogues],
  loadLocale: async (locale) => (await loaders[locale]()).default,
  storage: {
    getLocale: () => localeStorage.getLocale(),
    setLocale: (locale) => localeStorage.setLocale(locale),
  },
});
export { i18n };
export { isLocale, localeNames, locales, formatters } from "@mdbase-dev/i18n";
export type { Locale, LocaleStorage } from "@mdbase-dev/i18n";
