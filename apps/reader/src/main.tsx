import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { OpeningScreen } from "@mdbase-dev/ui/screens";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import "@mdbase-reader/ui/styles.css";
import "./reader.css";
import "./reader-improvements.css";
import "./annotation-polish.css";
import "./reader-shell.css";
import "./notes-panel.css";
import "@mdbase-dev/ui/feedback.css";
import "./feedback-shell.css";

import { readerBuildEnvironment } from "./build-environment.js";
import { ConfirmProvider } from "./ConfirmProvider.js";
import { EnvironmentBadge } from "./EnvironmentBadge.js";
import { FeedbackRoot } from "./FeedbackRoot.js";
import { forgetOfflineCopies } from "./forget-offline-copies.js";
import { completeAppGrantCallback } from "./grant-callback.js";
import { ReaderI18nProvider } from "./i18n.js";
import { importService } from "./import-navigation.js";
import { keepFocusedFieldInView } from "./keep-focused-field-in-view.js";
import "./environment-badge.css";
import { setupPwaInstall } from "./pwa-install.js";
import { ReaderErrorBoundary } from "./ReaderErrorBoundary.js";

import type { ImportService } from "./ImportPageView.js";
import "./pwa-install.css";
const PreviewReader = lazy(async () => ({ default: (await import("./preview.js")).PreviewReader }));
const NativeImportPage = lazy(async () => ({
  default: (await import("./NativeImportPage.js")).NativeImportPage,
}));

// Every build environment (lab, staging, production) opens collections through
// the public SDK entry; the build names its exact environment or refuses.
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
// The in-memory interface preview is the one page that needs no environment.
// Every served build names its exact environment; anything else refuses here
// instead of falling back to another environment or the legacy entry.
const preview = new URL(location.href).searchParams.has("preview");
const buildEnvironment =
  preview && !migrationService ? null : readerBuildEnvironment(import.meta.env.VITE_MDBASE_ENV);
// The Private collection consent popup returns here. It hands the result to
// the waiting reader tab and closes, without starting a second mdbase entry.
const grantCallback = buildEnvironment !== null && completeAppGrantCallback(new URL(location.href));
// Worded like the collection gate's first screen, so the SDK download is not a blank page.
function StartingReader(): React.JSX.Element {
  useLocale();
  return <OpeningScreen app="reader" title={translate({ message: "Starting mdbase Reader…" })} />;
}
createRoot(root).render(
  <StrictMode>
    <ReaderI18nProvider>
      <ConfirmProvider>
        <FeedbackRoot>
          <EnvironmentBadge />
          <ReaderErrorBoundary>
            {grantCallback ? (
              <p className="reader-grant-callback">
                <Trans>You can close this window.</Trans>
              </p>
            ) : migrationService ? (
              <Suspense fallback={<StartingReader />}>
                <SdkReader service={migrationService} />
              </Suspense>
            ) : preview ? (
              <Suspense fallback={null}>
                <PreviewReader />
              </Suspense>
            ) : (
              <Suspense fallback={<StartingReader />}>
                <SdkReader />
              </Suspense>
            )}
          </ReaderErrorBoundary>
        </FeedbackRoot>
      </ConfirmProvider>
    </ReaderI18nProvider>
  </StrictMode>,
);
