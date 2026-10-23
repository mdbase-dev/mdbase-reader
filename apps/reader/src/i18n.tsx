import { i18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

import english from "../../../locales/en/messages.json";

import type { JSX, ReactNode } from "react";

// English is synchronous: neither startup nor tests require a catalogue request.
i18n.load("en", english.messages as Messages);
i18n.activate("en");

export { i18n };

export function ReaderI18nProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
