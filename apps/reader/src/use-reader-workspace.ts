import { useCallback, useEffect, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { selectedResource, type SelectedValue } from "./selected-resource.js";
import { useLibrarySelection, type LibrarySelection } from "./use-library-selection.js";
import { useAnnotationCreation, useReadingPositionSave } from "./use-workspace-mutations.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  FileId,
  ReadingPosition,
  Source,
  SourceFileImportRequest,
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
  readonly importStatus: "idle" | "importing";
  readonly importError: string | null;
  readonly selectSource: (id: SourceId) => void;
  readonly setDraft: (value: string) => void;
  readonly saveDraft: () => void;
  readonly importSourceFile: (
    request: Omit<SourceFileImportRequest, "collectionId">,
  ) => Promise<Source | null>;
  readonly createAnnotation: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly saveReadingPosition: (
    sourceId: SourceId,
    documentFileId: FileId,
    position: ReadingPosition,
  ) => Promise<void>;
  readonly retryLibrary: () => void;
}

export function useReaderWorkspace(gateway: ReaderWorkspaceGateway): ReaderWorkspaceController {
  const library = useLibrarySelection(gateway);
  const source = useSelectedSourceWorkspace(gateway, library.selectedSource);
  return {
    ...library,
    ...source,
  };
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
  const saveReadingPosition = useReadingPositionSave(gateway, sourceRecord, setSource);

  return {
    sourceRecord,
    annotations: annotationResource,
    draft: draftValue,
    saveStatus: sourceId && saving?.sourceId === sourceId && saving.value ? "saving" : "idle",
    saveError: sourceId && saveError?.sourceId === sourceId ? saveError.value : null,
    setDraft,
    saveDraft,
    createAnnotation: createSelectedAnnotation,
    saveReadingPosition,
  };
}
