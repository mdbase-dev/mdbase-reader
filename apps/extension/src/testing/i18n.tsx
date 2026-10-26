import { ReaderI18nProvider } from "@mdbase-reader/i18n/react";
import { createRoot as createReactRoot } from "react-dom/client";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";

import type { ReactNode } from "react";
import type { Container, Root, RootOptions } from "react-dom/client";

/** Tests render the real synchronous English catalogue, never a mocked translator. */
export function withI18n(children: ReactNode): React.JSX.Element {
  return <ReaderI18nProvider>{children}</ReaderI18nProvider>;
}

export function renderWithI18n(children: ReactNode): string {
  return renderReactMarkup(withI18n(children));
}

export const renderToStaticMarkup = renderWithI18n;

export function createRoot(container: Container, options?: RootOptions): Root {
  const root = createReactRoot(container, options);
  return {
    render: (children) => root.render(withI18n(children)),
    unmount: () => root.unmount(),
  };
}
