import { ReaderI18nProvider } from "@mdbase-reader/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ReactNode } from "react";

/** Tests render the real synchronous English catalogue, never a mocked translator. */
export function withI18n(children: ReactNode): React.JSX.Element {
  return <ReaderI18nProvider>{children}</ReaderI18nProvider>;
}

export function renderWithI18n(children: ReactNode): string {
  return renderToStaticMarkup(withI18n(children));
}
