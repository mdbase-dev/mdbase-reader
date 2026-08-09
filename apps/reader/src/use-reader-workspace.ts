import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { readerErrorMessage } from "./errors.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  Source,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";

export type AsyncResource<Value> =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly value: Value }
  | { readonly status: "error"; readonly message: string };

export interface ReaderWorkspaceController {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly sourceRecord: AsyncResource<Source>;
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly draft: string;
  readonly saveStatus: "idle" | "saving";
  readonly saveError: string | null;
  readonly selectSource: (id: SourceId) => void;
  readonly setDraft: (value: string) => void;
  readonly saveDraft: () => void;
  readonly createAnnotation: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly retryLibrary: () => void;
}

interface LibrarySelection {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly selectSource: (id: SourceId) => void;
  readonly retryLibrary: () => void;
}

interface SelectedValue<Value> {
  readonly sourceId: SourceId;
  readonly value: Value;
}

export function useReaderWorkspace(gateway: ReaderWorkspaceGateway): ReaderWorkspaceController {
  const library = useLibrarySelection(gateway);
  const source = useSelectedSourceWorkspace(gateway, library.selectedSource);
  return {
    ...library,
    ...source,
  };
}

function useLibrarySelection(gateway: ReaderWorkspaceGateway): LibrarySelection {
  const [library, setLibrary] = useState<AsyncResource<ReaderLibrarySnapshot>>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | null>(null);
  const selectedSourceIdRef = useRef<SourceId | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void gateway
      .library({ signal: controller.signal })
      .then((snapshot) => {
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
      })
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

  return { library, selectedSource, selectSource, retryLibrary };
}

function useSelectedSourceWorkspace(
  gateway: ReaderWorkspaceGateway,
  selectedSource: SourceSummary | null,
): Omit<ReaderWorkspaceController, keyof LibrarySelection> {
  const [source, setSource] = useState<SelectedValue<AsyncResource<Source>> | null>(null);
  const [annotations, setAnnotations] = useState<SelectedValue<
    AsyncResource<readonly Annotation[]>
  > | null>(null);
  const [draft, setDraftState] = useState<SelectedValue<string> | null>(null);
  const [saving, setSaving] = useState<SelectedValue<boolean> | null>(null);
  const [saveError, setSaveError] = useState<SelectedValue<string | null> | null>(null);

  useEffect(() => {
    if (!selectedSource) {
      return;
    }
    const sourceId = selectedSource.id;
    const controller = new AbortController();
    void gateway
      .source(sourceId, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setSource({
            sourceId,
            value: value
              ? { status: "ready", value }
              : { status: "error", message: "This source record no longer exists." },
          });
          if (value) {
            setDraftState({ sourceId, value: value.body });
          }
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setSource({
            sourceId,
            value: {
              status: "error",
              message: readerErrorMessage(reason, "Reader could not open the source note."),
            },
          });
        }
      });
    void gateway
      .annotations(sourceId, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setAnnotations({ sourceId, value: { status: "ready", value } });
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setAnnotations({
            sourceId,
            value: {
              status: "error",
              message: readerErrorMessage(
                reason,
                "Reader could not load this source's annotations.",
              ),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, selectedSource]);

  const sourceId = selectedSource?.id ?? null;
  const sourceRecord = selectedResource(sourceId, source);
  const annotationResource = selectedResource(sourceId, annotations);
  const draftValue = sourceId && draft?.sourceId === sourceId ? draft.value : "";
  const setDraft = useCallback(
    (value: string): void => {
      if (sourceId) {
        setDraftState({ sourceId, value });
      }
    },
    [sourceId],
  );
  const saveDraft = useCallback((): void => {
    if (!sourceId || sourceRecord.status !== "ready" || sourceRecord.value.body === draftValue) {
      return;
    }
    setSaving({ sourceId, value: true });
    setSaveError({ sourceId, value: null });
    void gateway
      .saveSourceBody(sourceRecord.value, draftValue)
      .then((value) => setSource({ sourceId, value: { status: "ready", value } }))
      .catch((reason: unknown) =>
        setSaveError({
          sourceId,
          value: readerErrorMessage(reason, "Reader could not save the source note."),
        }),
      )
      .finally(() => setSaving({ sourceId, value: false }));
  }, [draftValue, gateway, sourceId, sourceRecord]);
  const createSelectedAnnotation = useAnnotationCreation(gateway, setAnnotations);

  return {
    sourceRecord,
    annotations: annotationResource,
    draft: draftValue,
    saveStatus: sourceId && saving?.sourceId === sourceId && saving.value ? "saving" : "idle",
    saveError: sourceId && saveError?.sourceId === sourceId ? saveError.value : null,
    setDraft,
    saveDraft,
    createAnnotation: createSelectedAnnotation,
  };
}

function useAnnotationCreation(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<
    SetStateAction<SelectedValue<AsyncResource<readonly Annotation[]>> | null>
  >,
): (request: AnnotationCreationRequest) => Promise<Annotation> {
  return useCallback(
    async (request: AnnotationCreationRequest): Promise<Annotation> => {
      const created = await gateway.createAnnotation(request);
      setAnnotations((current) => {
        const values =
          current?.sourceId === request.sourceId && current.value.status === "ready"
            ? current.value.value
            : [];
        return {
          sourceId: request.sourceId,
          value: { status: "ready", value: [created, ...values] },
        };
      });
      return created;
    },
    [gateway, setAnnotations],
  );
}

function selectedResource<Value>(
  sourceId: SourceId | null,
  selected: SelectedValue<AsyncResource<Value>> | null,
): AsyncResource<Value> {
  if (!sourceId) {
    return { status: "idle" };
  }
  return selected?.sourceId === sourceId ? selected.value : { status: "loading" };
}
