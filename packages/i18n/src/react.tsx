import { I18nProvider } from "@lingui/react";

import { i18n } from "./runtime.js";

import type { JSX, ReactNode } from "react";

export function ReaderI18nProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
