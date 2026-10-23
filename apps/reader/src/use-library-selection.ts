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
  CslProvenance,
  Source,
  SourceDeletionPlan,
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
    provenance?: CslProvenance,
  ) => Promise<Source>;
  /** Present when sources can be removed: checks one, listing the records that link to it. */
  readonly planSourceRemoval?: (id: SourceId) => Promise<SourceDeletionPlan>;
  /** Removes a checked source and drops it from the library; rejects with the problem. */
  readonly removeSource?: (plan: SourceDeletionPlan) => Promise<void>;
}

export interface LibrarySelectionState extends LibrarySelection {
  readonly selectedSourceId: SourceId | null;
  readonly reconcileSource: (source: Source) => void;
}

export function retainedSourceSelection(
  current: SourceId | null,
  snapshot: ReaderLibrarySnapshot,
): SourceId | null {
  return current &&
    (snapshot.sourceIndex?.complete === false || snapshot.sources.some(({ id }) => id === current))
    ? current
    : null;
}

export function useLibrarySelection(
  gateway: ReaderWorkspaceGateway,
  initialSourceId: SourceId | null = null,
): LibrarySelectionState {
  const [library, setLibrary] = useState<AsyncResource<ReaderLibrarySnapshot>>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  // Bumped when another tab, app or device changes the sources.
  const [libraryRevision, setLibraryRevision] = useState(0);
  const libraryShown = useRef(false);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(initialSourceId);
  const [importStatus, setImportStatus] = useState<"idle" | "importing">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const selectedSourceIdRef = useRef<SourceId | null>(initialSourceId);

  useEffect(
    () => gateway.subscribeLibrary?.(() => setLibraryRevision((value) => value + 1)),
    [gateway],
  );

  useEffect(() => {
    const controller = new AbortController();
    // A shown library stays as it is until the reread completes, rather than
    // shrinking to the first page.
    const progressive = !libraryShown.current;
    const updateLibrary = (snapshot: ReaderLibrarySnapshot): void => {
      if (controller.signal.aborted) {
        return;
      }
      if (snapshot.sourceIndex?.complete !== false) {
        libraryShown.current = true;
      }
      setLibrary({ status: "ready", value: snapshot });
      const current = selectedSourceIdRef.current;
      // An incomplete index cannot prove a requested/restored source is absent.
      // Browsing a collection alone must not hydrate an arbitrary first source.
      const next = retainedSourceSelection(current, snapshot);
      selectedSourceIdRef.current = next;
      setSelectedSourceId(next);
    };
    const timer = window.setTimeout(() => {
      void gateway
        .library({
          signal: controller.signal,
          replaceableFamily: "reader-library-load",
          ...(progressive ? { onProgress: updateLibrary } : {}),
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
  }, [attempt, gateway, libraryRevision]);

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
  const removal = useSourceRemovalWrites(
    gateway,
    setLibrary,
    setSelectedSourceId,
    selectedSourceIdRef,
  );
  return {
    library,
    selectedSource,
    selectSource,
    retryLibrary,
    importStatus,
    importError,
    ...writes,
    ...removal,
    selectedSourceId,
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
          saveNewSourceCitation: async (source, citation, provenance) => {
            const saved = await saveNewSourceCitation(source, citation, provenance);
            reconcileSource(saved);
            return saved;
          },
        }
      : {}),
  };
}

/** Source removal, when the collection offers it; a removed source leaves the library. */
function useSourceRemovalWrites(
  gateway: ReaderWorkspaceGateway,
  setLibrary: Dispatch<SetStateAction<AsyncResource<ReaderLibrarySnapshot>>>,
  setSelectedSourceId: Dispatch<SetStateAction<SourceId | null>>,
  selectedSourceIdRef: RefObject<SourceId | null>,
): Pick<LibrarySelection, "planSourceRemoval" | "removeSource"> {
  const planSourceRemoval = useMemo(() => gateway.planSourceRemoval?.bind(gateway), [gateway]);
  const removeSource = useCallback(
    async (plan: SourceDeletionPlan): Promise<void> => {
      if (!gateway.removeSource) {
        throw new Error("This collection cannot remove sources.");
      }
      await gateway.removeSource(plan);
      setLibrary((current) => removeLibrarySource(current, plan.sourceId));
      if (selectedSourceIdRef.current === plan.sourceId) {
        selectedSourceIdRef.current = null;
        setSelectedSourceId(null);
      }
    },
    [gateway, selectedSourceIdRef, setLibrary, setSelectedSourceId],
  );
  return planSourceRemoval && gateway.removeSource ? { planSourceRemoval, removeSource } : {};
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

function removeLibrarySource(
  current: AsyncResource<ReaderLibrarySnapshot>,
  id: SourceId,
): AsyncResource<ReaderLibrarySnapshot> {
  return current.status === "ready"
    ? {
        status: "ready",
        value: { ...current.value, sources: current.value.sources.filter((s) => s.id !== id) },
      }
    : current;
}
