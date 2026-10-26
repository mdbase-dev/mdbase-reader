import { t as translate } from "@lingui/core/macro";
import { useLingui as useLocale } from "@lingui/react";
import { connectProblemMessage, type ReaderConnectSnapshot } from "@mdbase-reader/connect";
import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";

import { readerSession } from "./connect.js";
import { ImportController } from "./import-controller.js";
import { ImportDestination } from "./ImportDestination.js";
import { ImportPageView, type ImportService } from "./ImportPageView.js";

const subscribe = (listener: () => void): (() => void) => readerSession.subscribe(listener);
const snapshot = (): ReaderConnectSnapshot => readerSession.getSnapshot();

/** Existing production import session; the LAB native route never loads this module. */
export function ImportPage({ service }: { service: ImportService }): JSX.Element {
  useLocale();
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
      .catch(() =>
        controller.update({ error: translate({ message: "Could not connect to mdbase." }) }),
      );
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
    <ImportPageView
      service={service}
      state={state}
      controller={controller}
      opened={opened}
      destination={
        <ImportDestination
          session={session}
          disabled={state.busy || !!state.boundTarget}
          onError={(error) => controller.update({ error })}
        />
      }
    />
  );
}
