import { readerI18n, setReaderLocaleStorage } from "@mdbase-reader/i18n";
import { ReaderI18nProvider } from "@mdbase-reader/i18n/react";
import "@mdbase-reader/ui/styles.css";
import { createRoot } from "react-dom/client";

import { credentiallessFetch } from "./credentialless-fetch.js";
import { extensionLocaleStorage, followExtensionLocale } from "./extension-locale.js";
import { startTheme } from "./extension-theme.js";
import "./extension.css";

/** Starts one extension page. Its fetches use signed grants, never ambient portal cookies. */
export function mount(page: React.JSX.Element): void {
  globalThis.fetch = credentiallessFetch(globalThis.fetch.bind(globalThis));
  // Before rendering, so the page never shows the other theme first.
  startTheme(localStorage, document.documentElement, window);
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Reader extension root is missing.");
  }
  setReaderLocaleStorage(extensionLocaleStorage);
  followExtensionLocale(readerI18n);
  createRoot(root).render(<ReaderI18nProvider>{page}</ReaderI18nProvider>);
}
