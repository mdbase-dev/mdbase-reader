import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";
import "./reader-improvements.css";
import "./annotation-polish.css";
import "./reader-shell.css";

import { ConnectReader } from "./ConnectReader.js";
import { EnvironmentBadge } from "./EnvironmentBadge.js";
import { forgetOfflineCopies } from "./forget-offline-copies.js";
import { importService } from "./import-navigation.js";
import { keepFocusedFieldInView } from "./keep-focused-field-in-view.js";
import { PreviewReader } from "./preview.js";
import "./environment-badge.css";

// Library imports bring PDF parsing and compression code that ordinary reading never needs.
const ImportPage = lazy(async () => {
  const module = await import("./ImportPage.js");
  return { default: module.ImportPage };
});

import { setupPwaInstall } from "./pwa-install.js";
import "./pwa-install.css";

const stopPwaInstall = setupPwaInstall("mdbase reader");
if (import.meta.hot) import.meta.hot.dispose(stopPwaInstall);

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
forgetOfflineCopies(globalThis.indexedDB);
keepFocusedFieldInView(window);
const migrationService = importService(location.pathname);
createRoot(root).render(
  <StrictMode>
    <EnvironmentBadge />
    {migrationService ? (
      <Suspense fallback={null}>
        <ImportPage service={migrationService} />
      </Suspense>
    ) : new URL(location.href).searchParams.has("preview") ? (
      <PreviewReader />
    ) : (
      <ConnectReader />
    )}
  </StrictMode>,
);
