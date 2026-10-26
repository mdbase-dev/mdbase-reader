import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { describeError, type NativeReaderCollection } from "@mdbase-reader/connect/native";
import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from "react";

import { ImportController } from "./import-controller.js";
import { ImportPageView, type ImportService } from "./ImportPageView.js";
import { SdkReaderRoot, type ReaderNativeScope, type ReaderSdk } from "./SdkReaderRoot.js";

/** App input/progress survives the SDK's chooser. The provider returns the actual
 * current domain collection, never a session/client facade or bootstrap engine. */
interface NativeImportFlow {
  readonly controller: ImportController;
  bind(scope: ReaderNativeScope): () => void;
}

/** Imports write only to the collection the SDK still reports as open and ready. */
function isReadyConnection({ mdbase, connection }: ReaderNativeScope): boolean {
  const { phase } = mdbase.getSnapshot();
  return phase.kind === "ready" && phase.collectionId === connection.id && connection.isCurrent();
}

function importFlow(opened: (collection: NativeReaderCollection | null) => void): NativeImportFlow {
  let current: ReaderNativeScope | null = null;
  const controller = new ImportController({
    connectedCollection: () => (current && isReadyConnection(current) ? current.collection : null),
  });
  return {
    controller,
    bind(scope: ReaderNativeScope): () => void {
      current = scope;
      opened(scope.collection);
      return () => {
        if (current === scope) {
          current = null;
          controller.stop();
          opened(null);
        }
      };
    },
  };
}

export function NativeImportPage({
  sdk,
  service,
}: {
  readonly sdk: ReaderSdk;
  readonly service: ImportService;
}): JSX.Element {
  const [opened, setOpened] = useState<NativeReaderCollection | null>(null);
  const [flow] = useState(() => importFlow(setOpened));
  const { controller } = flow;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
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
        service === "home" ? null : (
          <section className="import-step" aria-labelledby="import-destination-title">
            <h2 id="import-destination-title">
              <Trans>Choose a destination</Trans>
            </h2>
            <SdkReaderRoot
              sdk={sdk}
              embedded
              renderNative={(scope) => <NativeImportDestination scope={scope} flow={flow} />}
            />
          </section>
        )
      }
    />
  );
}

function NativeImportDestination({
  scope,
  flow,
}: {
  readonly scope: ReaderNativeScope;
  readonly flow: NativeImportFlow;
}): JSX.Element {
  const { t } = useLingui();
  const { mdbase, connection, collection } = scope;
  const { controller } = flow;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const caller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    caller.current = control;
    const unbind = flow.bind({ mdbase, connection, collection });
    return () => {
      control.abort();
      unbind();
    };
  }, [flow, mdbase, connection, collection]);
  const choose = async (): Promise<void> => {
    const control = caller.current;
    if (!control || control.signal.aborted || busy.current || !connection.isCurrent()) {
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      await mdbase.chooseAnother({ signal: control.signal });
    } catch (error: unknown) {
      if (!aborted(control)) {
        controller.update({
          error:
            describeError(error)?.message ??
            translate({ message: "Could not change the collection. Please try again." }),
        });
      }
    } finally {
      if (!aborted(control)) {
        busy.current = false;
        setWorking(false);
      }
    }
  };
  return (
    <div className="import-step">
      <p>{t`Collection: ${collection.collectionName}`}</p>
      <button
        type="button"
        disabled={working || state.busy || !!state.boundTarget}
        onClick={() => void choose()}
      >
        <Trans>Choose another collection</Trans>
      </button>
    </div>
  );
}

function aborted(control: AbortController): boolean {
  return control.signal.aborted;
}
