import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";
import "./reader-improvements.css";
import "./annotation-polish.css";
import "./reader-shell.css";
import "@mdbase-dev/ui/feedback.css";
import "./feedback-shell.css";

import { EnvironmentBadge } from "./EnvironmentBadge.js";
import { FeedbackRoot } from "./FeedbackRoot.js";
import { forgetOfflineCopies } from "./forget-offline-copies.js";
import { completeAppGrantCallback } from "./grant-callback.js";
import { importService } from "./import-navigation.js";
import { keepFocusedFieldInView } from "./keep-focused-field-in-view.js";
import "./environment-badge.css";
import { setupPwaInstall } from "./pwa-install.js";

import type { ImportService } from "./ImportPageView.js";
import "./pwa-install.css";
const PreviewReader = lazy(async () => ({ default: (await import("./preview.js")).PreviewReader }));
const ConnectReader = lazy(async () => ({
  default: (await import("./ConnectReader.js")).ConnectReader,
}));
const NativeImportPage = lazy(async () => ({
  default: (await import("./NativeImportPage.js")).NativeImportPage,
}));

// Library imports bring PDF parsing and compression code that ordinary reading never needs.
const ImportPage = lazy(async () => {
  const module = await import("./ImportPage.js");
  return { default: module.ImportPage };
});

// LAB builds open collections through the public SDK entry, loaded only there.
// Staging and production keep Connect: the SDK has no production release trust yet.
const SdkReader = lazy(async () => {
  const [{ SdkReaderRoot }, { readerSdk }] = await Promise.all([
    import("./SdkReaderRoot.js"),
    import("./sdk-application.js"),
  ]);
  const sdk = readerSdk();
  return {
    default: ({ service }: { service?: ImportService }) =>
      service ? (
        <Suspense fallback={null}>
          <NativeImportPage sdk={sdk} service={service} />
        </Suspense>
      ) : (
        <SdkReaderRoot sdk={sdk} />
      ),
  };
});

const stopPwaInstall = setupPwaInstall("mdbase reader");
if (import.meta.hot) {
  import.meta.hot.dispose(stopPwaInstall);
}

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Reader root element is missing.");
}
forgetOfflineCopies(globalThis.indexedDB);
keepFocusedFieldInView(window);
const migrationService = importService(location.pathname);
// LAB: the Private collection consent popup returns here. It hands the result to
// the waiting reader tab and closes, without starting a second mdbase entry.
// (Staging and production keep Connect, whose own sign-in return is untouched.)
const grantCallback =
  import.meta.env.VITE_MDBASE_ENV === "lab" && completeAppGrantCallback(new URL(location.href));
createRoot(root).render(
  <StrictMode>
    <FeedbackRoot>
      <EnvironmentBadge />
      {grantCallback ? (
        <p className="reader-grant-callback">You can close this window.</p>
      ) : migrationService ? (
        <Suspense fallback={null}>
          {import.meta.env.VITE_MDBASE_ENV === "lab" ? (
            <SdkReader service={migrationService} />
          ) : (
            <ImportPage service={migrationService} />
          )}
        </Suspense>
      ) : new URL(location.href).searchParams.has("preview") ? (
        <Suspense fallback={null}>
          <PreviewReader />
        </Suspense>
      ) : import.meta.env.VITE_MDBASE_ENV === "lab" ? (
        <Suspense fallback={null}>
          <SdkReader />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <ConnectReader />
        </Suspense>
      )}
    </FeedbackRoot>
  </StrictMode>,
);
