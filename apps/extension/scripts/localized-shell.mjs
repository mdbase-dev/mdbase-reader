import { readFileSync } from "node:fs";

import { setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

// Kept in sync with the extracted, translator-visible descriptors in shell-messages.ts.
const messages = {
  description: "Save the page you are reading and revisit your mdbase annotations.",
  actionTitle: "Save to mdbase Reader",
  openCommand: "Open mdbase Reader for this page",
  highlightCommand: "Highlight the selected passage in mdbase Reader",
};

export const chromeLocales = {
  en: "en",
  fr: "fr",
  de: "de",
  es: "es",
  ja: "ja",
  ko: "ko",
  pt: "pt_BR",
  ru: "ru",
  zh: "zh_CN",
};
export function shellCatalogue(locale) {
  return readFileSync(
    new URL(`../../../packages/i18n/locales/${locale}/messages.json`, import.meta.url),
    "utf8",
  );
}
export function chromeMessages(locale) {
  const catalogue = JSON.parse(shellCatalogue(locale));
  const translator = setupI18n({ locale, messages: catalogue.messages });
  return Object.fromEntries(
    Object.entries(messages).map(([key, message]) => {
      const id = generateMessageId(message);
      if (!(id in catalogue.messages)) throw new Error(`Shell message not extracted: ${message}`);
      // Chrome treats $ as a placeholder introducer, unlike Lingui.
      return [key, { message: translator._(id).replaceAll("$", () => "$$") }];
    }),
  );
}
