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
import type {
  Source,
  SourceFileImportRequest,
  SourceId,
  SourceImportOptions,
  SourceSummary,
} from "@mdbase-reader/core";

export interface LibrarySelection {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly selectSource: (id: SourceId | null) => void;
  readonly retryLibrary: () => void;
  readonly importStatus: "idle" | "importing";
  readonly importError: string | null;
  readonly importSourceFile: (
    request: Omit<SourceFileImportRequest, "collectionId">,
    options?: SourceImportOptions,
  ) => Promise<Source | null>;
}

export interface LibrarySelectionState extends LibrarySelection {
  readonly reconcileSource: (source: Source) => void;
}

export function useLibrarySelection(gateway: ReaderWorkspaceGateway): LibrarySelectionState {
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
    const timer = window.setTimeout(() => {
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
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, gateway]);

  const selectedSource = useMemo(() => {
    if (library.status !== "ready" || !selectedSourceId) {
      return null;
    }
    return library.value.sources.find(({ id }) => id === selectedSourceId) ?? null;
  }, [library, selectedSourceId]);
  const selectSource = useCallback((id: SourceId | null): void => {
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
  const reconcileSource = useCallback(
    (source: Source): void => setLibrary((current) => replaceLibrarySource(current, source)),
    [],
  );
  return {
    library,
    selectedSource,
    selectSource,
    retryLibrary,
    importStatus,
    importError,
    importSourceFile,
    reconcileSource,
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
    async (request, options) => {
      setImportStatus("importing");
      setImportError(null);
      try {
        const imported = await gateway.importSourceFile(request, options);
        setLibrary((current) => addImportedSource(current, imported));
        selectedSourceIdRef.current = imported.id;
        setSelectedSourceId(imported.id);
        return imported;
      } catch (reason) {
        if (!isAbortError(reason)) {
          setImportError(readerErrorMessage(reason, "Reader could not import this document."));
        }
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

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
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

export function replaceLibrarySource(
  current: AsyncResource<ReaderLibrarySnapshot>,
  replacement: Source,
): AsyncResource<ReaderLibrarySnapshot> {
  if (current.status !== "ready") {
    return current;
  }
  const index = current.value.sources.findIndex(({ id }) => id === replacement.id);
  if (index < 0) {
    return current;
  }
  const sources = [...current.value.sources];
  sources[index] = replacement;
  return {
    status: "ready",
    value: { ...current.value, sources },
  };
}
