import { Wordmark } from "@mdbase-dev/ui/brand";
import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";

import { readerSession } from "./connect.js";
import { ImportController } from "./import-controller.js";
import { importHref } from "./import-navigation.js";
import { ImportDestination } from "./ImportDestination.js";
import { ImportInput } from "./ImportInput.js";
import { ImportConfirm, ImportPreview, ImportStatus } from "./ImportReview.js";
import "./import.css";
const subscribe = (listener: () => void): (() => void) => readerSession.subscribe(listener);
const snapshot = (): ReaderConnectSnapshot => readerSession.getSnapshot();
export function ImportPage({ service }: { service: "home" | "zotero" | "readwise" }): JSX.Element {
  const session = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [controller] = useState(() => new ImportController(readerSession));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const opened = useMemo(
    () =>
      session.status === "ready" ? readerSession.connectedCollection(session.collectionId) : null,
    [session],
  );
  useEffect(() => {
    void readerSession
      .start()
      .then((outcome) => {
        const error = connectProblemMessage(outcome);
        if (error) {
          controller.update({ error });
        }
      })
      .catch(() => controller.update({ error: "Could not connect to mdbase." }));
    const warn = (event: BeforeUnloadEvent): void => {
      if (controller.getSnapshot().busy) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      controller.dispose();
    };
  }, [controller]);
  return (
    <main className="import-page">
      <header>
        <Wordmark app="reader" />
        <a href={`${import.meta.env.BASE_URL}${location.search}`}>Back to library</a>
      </header>
      {service !== "home" ? (
        <nav aria-label="Import navigation">
          <a href={importHref()}>Import a library</a>
          <span> / {service === "zotero" ? "Zotero" : "Readwise Reader"}</span>
        </nav>
      ) : null}
      <h1>
        {service === "home"
          ? "Bring your library with you."
          : `Import from ${service === "zotero" ? "Zotero" : "Readwise Reader"}`}
      </h1>
      <p className="import-intro">
        Your sources, notes and files, in a collection you control. Preview first. Nothing is
        imported until you confirm the destination.
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
          <ImportDestination
            session={session}
            disabled={state.busy || !!state.boundTarget}
            onError={(error) => controller.update({ error })}
          />
          {opened ? <ImportConfirm state={state} opened={opened} controller={controller} /> : null}
        </>
      )}
      {/* Connection problems matter once a service is chosen, not on the landing page. */}
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
        <p>References, original files, notes, collections and native annotations.</p>
        <strong>Import an export bundle →</strong>
      </a>
      <a href={importHref("readwise")}>
        <span className="import-service-mark" aria-hidden="true">
          R
        </span>
        <h2>Readwise Reader</h2>
        <p>
          Reader documents and files, plus highlights from Kindle, Apple Books and other Readwise
          sources.
        </p>
        <strong>Connect and scan your library →</strong>
      </a>
    </div>
  );
}
