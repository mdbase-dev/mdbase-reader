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
  SourceFileAttachmentRequest,
  SourceFileImportRequest,
  SourceId,
  SourceImportOptions,
  SourceRecordCreationRequest,
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
  /** Present when the collection can hold sources without a document. */
  readonly createSource?: (
    request: Omit<SourceRecordCreationRequest, "collectionId">,
    options?: SourceImportOptions,
  ) => Promise<Source | null>;
  /** Present when files can be attached to existing sources; rejects with the problem. */
  readonly attachSourceFile?: (
    request: SourceFileAttachmentRequest,
    options?: SourceImportOptions,
  ) => Promise<Source>;
  /** Stores a found citation on a new source; rejects so the caller can report it. */
  readonly saveNewSourceCitation?: (
    source: Source,
    citation: Readonly<Record<string, unknown>>,
  ) => Promise<Source>;
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
        .library({
          signal: controller.signal,
          replaceableFamily: "reader-library-load",
          onProgress: updateLibrary,
        })
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
  const writeSource = useSourceWrite(
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
  const writes = useMemo(
    () => sourceWrites(gateway, writeSource, reconcileSource),
    [gateway, reconcileSource, writeSource],
  );
  return {
    library,
    selectedSource,
    selectSource,
    retryLibrary,
    importStatus,
    importError,
    ...writes,
    reconcileSource,
  };
}

type SourceWrite = (operation: () => Promise<Source>, failure: string) => Promise<Source | null>;

function sourceWrites(
  gateway: ReaderWorkspaceGateway,
  writeSource: SourceWrite,
  reconcileSource: (source: Source) => void,
): Pick<
  LibrarySelection,
  "importSourceFile" | "createSource" | "attachSourceFile" | "saveNewSourceCitation"
> {
  const createSource = gateway.createSource?.bind(gateway);
  const attachSourceFile = gateway.attachSourceFile?.bind(gateway);
  const saveNewSourceCitation = gateway.saveNewSourceCitation?.bind(gateway);
  return {
    importSourceFile: (request, options) =>
      writeSource(
        () => gateway.importSourceFile(request, options),
        "Reader could not import this document.",
      ),
    ...(createSource
      ? {
          createSource: (request, options) =>
            writeSource(() => createSource(request, options), "Reader could not add this source."),
        }
      : {}),
    ...(attachSourceFile
      ? {
          attachSourceFile: async (request, options) => {
            const updated = await attachSourceFile(request, options);
            reconcileSource(updated);
            return updated;
          },
        }
      : {}),
    ...(saveNewSourceCitation
      ? {
          saveNewSourceCitation: async (source, citation) => {
            const saved = await saveNewSourceCitation(source, citation);
            reconcileSource(saved);
            return saved;
          },
        }
      : {}),
  };
}

/** Runs one source mutation with shared busy state and errors, then updates the library. */
function useSourceWrite(
  setLibrary: Dispatch<SetStateAction<AsyncResource<ReaderLibrarySnapshot>>>,
  setSelectedSourceId: Dispatch<SetStateAction<SourceId | null>>,
  selectedSourceIdRef: RefObject<SourceId | null>,
  setImportStatus: Dispatch<SetStateAction<"idle" | "importing">>,
  setImportError: Dispatch<SetStateAction<string | null>>,
): SourceWrite {
  return useCallback(
    async (operation, failure) => {
      setImportStatus("importing");
      setImportError(null);
      try {
        const written = await operation();
        setLibrary((current) => addImportedSource(current, written));
        selectedSourceIdRef.current = written.id;
        setSelectedSourceId(written.id);
        return written;
      } catch (reason) {
        if (!isAbortError(reason)) {
          setImportError(readerErrorMessage(reason, failure));
        }
        return null;
      } finally {
        setImportStatus("idle");
      }
    },
    [selectedSourceIdRef, setImportError, setImportStatus, setLibrary, setSelectedSourceId],
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
