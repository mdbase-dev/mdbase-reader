import { Trans, useLingui } from "@lingui/react/macro";
import { Wordmark } from "@mdbase-dev/ui/brand";

import { importHref } from "./import-navigation.js";
import { ImportInput } from "./ImportInput.js";
import { ImportConfirm, ImportPreview, ImportStatus } from "./ImportReview.js";
import "./import.css";

import type { ImportController, ImportState } from "./import-controller.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type { JSX, ReactNode } from "react";

export type ImportService = "home" | "zotero" | "readwise";

/** Shared import UI only: no sign-in/session/client construction. */
export function ImportPageView({
  service,
  state,
  controller,
  opened,
  destination,
}: {
  readonly service: ImportService;
  readonly state: ImportState;
  readonly controller: ImportController;
  readonly opened: ReaderConnectedCollection | null;
  readonly destination: ReactNode;
}): JSX.Element {
  const { t } = useLingui();
  return (
    <main className="import-page">
      <header>
        <Wordmark app="reader" />
        <a href={`${import.meta.env.BASE_URL}${location.search}`}>
          <Trans>Back to library</Trans>
        </a>
      </header>
      {service !== "home" ? (
        <nav aria-label={t({ message: "Import navigation", context: "ImportPageView interface" })}>
          <a href={importHref()}>
            <Trans>Import a library</Trans>
          </a>
          <span> / {service === "zotero" ? "Zotero" : "Readwise Reader"}</span>
        </nav>
      ) : null}
      <h1>
        {service === "home"
          ? t({ message: "Bring your library with you." })
          : t`Import from ${service === "zotero" ? "Zotero" : "Readwise Reader"}`}
      </h1>
      <p className="import-intro">
        <Trans>
          Your sources, notes and files, in a collection you control. Preview first. Nothing is
          imported until you confirm the destination.
        </Trans>
      </p>
      {service === "home" ? (
        <ImportTiles />
      ) : (
        <>
          <ImportInput
            service={service}
            disabled={state.busy || !!state.boundTarget}
            controller={controller}
          />
          {state.plan ? <ImportPreview plan={state.plan} /> : null}
          {destination}
          {opened ? <ImportConfirm state={state} opened={opened} controller={controller} /> : null}
        </>
      )}
      {service !== "home" ? <ImportStatus state={state} controller={controller} /> : null}
    </main>
  );
}

function ImportTiles(): JSX.Element {
  return (
    <div className="import-tiles">
      <a href={importHref("zotero")}>
        <span className="import-service-mark" aria-hidden="true">
          Z
        </span>
        <h2>Zotero</h2>
        <p>
          <Trans>References, original files, notes, collections and native annotations.</Trans>
        </p>
        <strong>
          <Trans>Import an export bundle →</Trans>
        </strong>
      </a>
      <a href={importHref("readwise")}>
        <span className="import-service-mark" aria-hidden="true">
          R
        </span>
        <h2>Readwise Reader</h2>
        <p>
          <Trans>
            Reader documents and files, plus highlights from Kindle, Apple Books and other Readwise
            sources.
          </Trans>
        </p>
        <strong>
          <Trans>Connect and scan your library →</Trans>
        </strong>
      </a>
    </div>
  );
}
