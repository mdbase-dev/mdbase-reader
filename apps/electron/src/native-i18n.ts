import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { i18n } from "@lingui/core";
import { createI18nRuntime, isLocale, type Catalogue, type I18nRuntime } from "@mdbase-dev/i18n";

let runtime: I18nRuntime | undefined;

/** The main process has its own singleton, compiler-owned assets and OS preferences. */
export function initializeNativeLocale(userData: string, preferences: readonly string[]): void {
  const storagePath = join(userData, "reader-locale.json");
  runtime = createI18nRuntime({
    i18n,
    english: JSON.parse(
      readFileSync(new URL("./locales/en/messages.json", import.meta.url), "utf8"),
    ) as Catalogue,
    loadLocale: async (locale) =>
      JSON.parse(
        await readFile(new URL(`./locales/${locale}/messages.json`, import.meta.url), "utf8"),
      ) as Catalogue,
    preferences,
    storage: {
      getLocale: async () => {
        try {
          const value: unknown = JSON.parse(await readFile(storagePath, "utf8"));
          return isLocale(value) ? value : null;
        } catch {
          return null;
        }
      },
      setLocale: async (locale) => {
        await writeFile(storagePath, JSON.stringify(locale));
      },
    },
  });
  void runtime.initialize().catch(() => undefined);
}

export async function selectNativeLocale(value: unknown): Promise<void> {
  if (!isLocale(value) || !runtime) {
    throw new Error("Unsupported native interface locale");
  }
  await runtime.selectLocale(value);
}
