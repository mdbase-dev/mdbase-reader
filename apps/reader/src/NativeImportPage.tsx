import { describeError, type NativeReaderCollection } from "@mdbase-reader/connect/native";
import { useEffect, useRef, useState, useSyncExternalStore, type JSX } from "react";

import { ImportController } from "./import-controller.js";
import { ImportPageView, type ImportService } from "./ImportPageView.js";
import { isReadyReaderConnection } from "./sdk-ready-connection.js";
import { SdkReaderRoot, type ReaderNativeScope, type ReaderSdk } from "./SdkReaderRoot.js";

/** App input/progress survives the SDK's chooser. The provider returns the actual
 * current domain collection, never a session/client facade or bootstrap engine. */
interface NativeImportFlow {
  readonly controller: ImportController;
  bind(scope: ReaderNativeScope): () => void;
}

function importFlow(opened: (collection: NativeReaderCollection | null) => void): NativeImportFlow {
  let current: ReaderNativeScope | null = null;
  const controller = new ImportController({
    connectedCollection: () =>
      current && isReadyReaderConnection(current.connection, current.application.getSnapshot())
        ? current.collection
        : null,
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
          <SdkReaderRoot
            sdk={sdk}
            embedded
            renderNative={(scope) => <NativeImportDestination scope={scope} flow={flow} />}
          />
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
  const { application, connection, collection } = scope;
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
    const unbind = flow.bind({ application, connection, collection });
    return () => {
      control.abort();
      unbind();
    };
  }, [flow, application, connection, collection]);
  const choose = async (): Promise<void> => {
    const control = caller.current;
    if (!control || control.signal.aborted || busy.current || !connection.isCurrent()) {
      return;
    }
    busy.current = true;
    setWorking(true);
    try {
      await application.chooseAnother({ signal: control.signal });
    } catch (error: unknown) {
      if (!aborted(control)) {
        controller.update({
          error:
            describeError(error)?.message ?? "Could not change the collection. Please try again.",
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
    <section className="import-step" aria-labelledby="import-destination-title">
      <h2 id="import-destination-title">Choose a destination</h2>
      <p>Collection: {collection.collectionName}</p>
      <button
        type="button"
        disabled={working || state.busy || !!state.boundTarget}
        onClick={() => void choose()}
      >
        Choose another collection
      </button>
    </section>
  );
}

function aborted(control: AbortController): boolean {
  return control.signal.aborted;
}
