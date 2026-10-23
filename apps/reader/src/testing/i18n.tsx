import { ReaderI18nProvider } from "@mdbase-reader/i18n/react";
import { createRoot as createReactRoot } from "react-dom/client";
import { renderToStaticMarkup as renderReactMarkup } from "react-dom/server";

import type { ReactNode } from "react";
import type { Container, Root, RootOptions } from "react-dom/client";
import type { ServerOptions } from "react-dom/server";

/** Real English catalogue/provider, shared by component tests (never a translator mock). */
export function renderToStaticMarkup(children: ReactNode, options?: ServerOptions): string {
  return renderReactMarkup(<ReaderI18nProvider>{children}</ReaderI18nProvider>, options);
}

export function createRoot(container: Container, options?: RootOptions): Root {
  const root = createReactRoot(container, options);
  return {
    render: (children) => root.render(<ReaderI18nProvider>{children}</ReaderI18nProvider>),
    unmount: () => root.unmount(),
  };
}
