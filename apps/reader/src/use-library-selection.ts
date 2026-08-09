import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { readerErrorMessage } from "./errors.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Source, SourceFileImportRequest, SourceId, SourceSummary } from "@mdbase-reader/core";

export interface LibrarySelection {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly selectSource: (id: SourceId) => void;
  readonly retryLibrary: () => void;
  readonly importStatus: "idle" | "importing";
  readonly importError: string | null;
  readonly importSourceFile: (
    request: Omit<SourceFileImportRequest, "collectionId">,
  ) => Promise<Source | null>;
}

export function useLibrarySelection(gateway: ReaderWorkspaceGateway): LibrarySelection {
  const [library, setLibrary] = useState<AsyncResource<ReaderLibrarySnapshot>>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "importing">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const selectedSourceIdRef = useRef<SourceId | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const updateLibrary = (snapshot: ReaderLibrarySnapshot): void => {
      if (controller.signal.aborted) {
        return;
      }
      setLibrary({ status: "ready", value: snapshot });
      const current = selectedSourceIdRef.current;
      const next =
        current && snapshot.sources.some(({ id }) => id === current)
          ? current
          : (snapshot.sources[0]?.id ?? null);
      selectedSourceIdRef.current = next;
      setSelectedSourceId(next);
    };
    void gateway
      .library({ signal: controller.signal, onProgress: updateLibrary })
      .then(updateLibrary)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLibrary({
            status: "error",
            message: readerErrorMessage(reason, "Reader could not load this collection."),
          });
        }
      });
    return () => controller.abort();
  }, [attempt, gateway]);

  const selectedSource = useMemo(() => {
    if (library.status !== "ready" || !selectedSourceId) {
      return null;
    }
    return library.value.sources.find(({ id }) => id === selectedSourceId) ?? null;
  }, [library, selectedSourceId]);
  const selectSource = useCallback((id: SourceId): void => {
    selectedSourceIdRef.current = id;
    setSelectedSourceId(id);
  }, []);
  const retryLibrary = useCallback((): void => {
    setLibrary({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  const importSourceFile = useImportSourceFile(
    gateway,
    setLibrary,
    setSelectedSourceId,
    selectedSourceIdRef,
    setImportStatus,
    setImportError,
  );
  return {
    library,
    selectedSource,
    selectSource,
    retryLibrary,
    importStatus,
    importError,
    importSourceFile,
  };
}

function useImportSourceFile(
  gateway: ReaderWorkspaceGateway,
  setLibrary: Dispatch<SetStateAction<AsyncResource<ReaderLibrarySnapshot>>>,
  setSelectedSourceId: Dispatch<SetStateAction<SourceId | null>>,
  selectedSourceIdRef: RefObject<SourceId | null>,
  setImportStatus: Dispatch<SetStateAction<"idle" | "importing">>,
  setImportError: Dispatch<SetStateAction<string | null>>,
): LibrarySelection["importSourceFile"] {
  return useCallback(
    async (request) => {
      setImportStatus("importing");
      setImportError(null);
      try {
        const imported = await gateway.importSourceFile(request);
        setLibrary((current) => addImportedSource(current, imported));
        selectedSourceIdRef.current = imported.id;
        setSelectedSourceId(imported.id);
        return imported;
      } catch (reason) {
        setImportError(readerErrorMessage(reason, "Reader could not import this document."));
        return null;
      } finally {
        setImportStatus("idle");
      }
    },
    [
      gateway,
      selectedSourceIdRef,
      setImportError,
      setImportStatus,
      setLibrary,
      setSelectedSourceId,
    ],
  );
}

function addImportedSource(
  current: AsyncResource<ReaderLibrarySnapshot>,
  imported: Source,
): AsyncResource<ReaderLibrarySnapshot> {
  return current.status === "ready"
    ? {
        status: "ready",
        value: {
          ...current.value,
          sources: [imported, ...current.value.sources.filter(({ id }) => id !== imported.id)],
        },
      }
    : current;
}
