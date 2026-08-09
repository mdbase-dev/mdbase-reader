import { useCallback, useEffect, useState } from "react";

import { readerErrorMessage } from "./errors.js";
import { selectedResource, selectedValue, type SelectedValue } from "./selected-resource.js";
import {
  useAnnotationTransclusion,
  type AnnotationTransclusionController,
} from "./use-annotation-transclusion.js";
import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";
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
  readonly draftReady: boolean;
  readonly saveStatus: "idle" | "saving";
  readonly saveError: string | null;
  readonly citation: CitationEditorController;
  readonly transclusion: AnnotationTransclusionController;
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
          if (value) {
            setDraftState({ sourceId, value: value.body });
          }
          setSource({
            sourceId,
            value: value
              ? { status: "ready", value }
              : { status: "error", message: "This source record no longer exists." },
          });
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
              message: annotationLoadError(reason),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, selectedSource]);

  const sourceId = selectedSource?.id ?? null;
  const sourceRecord = selectedResource(sourceId, source);
  const annotationResource = selectedResource(sourceId, annotations);
  const selectedDraft = selectedValue(sourceId, draft);
  const draftValue = selectedDraft.matched ? selectedDraft.value : "";
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
  const citation = useSelectedCitationEditor(gateway, sourceRecord, setSource);
  const transclusion = useSelectedTransclusion(
    gateway,
    sourceRecord,
    draftValue,
    setSource,
    setDraftState,
  );

  return {
    sourceRecord,
    annotations: annotationResource,
    draft: draftValue,
    draftReady: selectedDraft.matched,
    saveStatus: sourceId && saving?.sourceId === sourceId && saving.value ? "saving" : "idle",
    saveError: sourceId && saveError?.sourceId === sourceId ? saveError.value : null,
    citation,
    transclusion,
    setDraft,
    saveDraft,
    createAnnotation: createSelectedAnnotation,
    saveReadingPosition,
  };
}

function annotationLoadError(reason: unknown): string {
  return readerErrorMessage(reason, "Reader could not load this source's annotations.");
}

function useSelectedCitationEditor(
  gateway: ReaderWorkspaceGateway,
  source: AsyncResource<Source>,
  setSource: (value: SelectedValue<AsyncResource<Source>>) => void,
): CitationEditorController {
  return useCitationEditor({
    gateway,
    source: source.status === "ready" ? source.value : null,
    onSaved: (value) => setSource({ sourceId: value.id, value: { status: "ready", value } }),
  });
}

function useSelectedTransclusion(
  gateway: ReaderWorkspaceGateway,
  source: AsyncResource<Source>,
  draft: string,
  setSource: (value: SelectedValue<AsyncResource<Source>>) => void,
  setDraft: (value: SelectedValue<string>) => void,
): AnnotationTransclusionController {
  return useAnnotationTransclusion({
    gateway,
    source,
    draft,
    onSaved: (value) => {
      setSource({ sourceId: value.id, value: { status: "ready", value } });
      setDraft({ sourceId: value.id, value: value.body });
    },
  });
}
