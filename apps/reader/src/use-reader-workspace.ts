import { useCallback, type Dispatch, type SetStateAction } from "react";

import { selectedResource, type SelectedValue } from "./selected-resource.js";
import {
  useAnnotationTransclusion,
  type AnnotationTransclusionController,
} from "./use-annotation-transclusion.js";
import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";
import { useLibrarySelection } from "./use-library-selection.js";
import {
  useSelectedSourceResources,
  type AnnotationState,
} from "./use-selected-source-resources.js";
import { useSourceDraft } from "./use-source-draft.js";
import {
  useAnnotationCreation,
  useAnnotationDeletion,
  useAnnotationUpdate,
  useReadingPositionSave,
} from "./use-workspace-mutations.js";

import type { SourceDraftSnapshot } from "./source-draft-session.js";
import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  AnnotationDeletionPlan,
  FileId,
  ReadingPosition,
  Source,
  SourceFileImportRequest,
  SourceImportOptions,
  SourceId,
  SourceSummary,
} from "@mdbase-reader/core";

export type AsyncResource<Value> =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly value: Value }
  | { readonly status: "error"; readonly message: string };

export interface ReaderSourceWorkspaceController {
  readonly sourceRecord: AsyncResource<Source>;
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly draft: string;
  readonly draftReady: boolean;
  readonly saveStatus: "saved" | "unsaved" | "saving" | "error";
  readonly saveError: string | null;
  readonly draftRecovery?: SourceDraftSnapshot;
  readonly resolveDraftConflict?: (choice: "local" | "remote") => void;
  readonly citation: CitationEditorController;
  readonly transclusion: AnnotationTransclusionController;
  readonly setDraft: (value: string) => void;
  readonly saveDraft: () => void;
  readonly createAnnotation: (request: AnnotationCreationRequest) => Promise<Annotation>;
  readonly updateAnnotation: (annotation: Annotation, body: string) => Promise<Annotation>;
  readonly planAnnotationDeletion: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly deleteAnnotation: (
    annotation: Annotation,
    plan: AnnotationDeletionPlan,
  ) => Promise<void>;
  readonly saveReadingPosition: (
    sourceId: SourceId,
    documentFileId: FileId,
    position: ReadingPosition,
  ) => Promise<void>;
}

export interface ReaderWorkspaceController extends ReaderSourceWorkspaceController {
  readonly library: AsyncResource<ReaderLibrarySnapshot>;
  readonly selectedSource: SourceSummary | null;
  readonly reconcileSource: (source: Source) => void;
  readonly selectSource: (id: SourceId | null) => void;
  readonly importSourceFile: (
    request: Omit<SourceFileImportRequest, "collectionId">,
    options?: SourceImportOptions,
  ) => Promise<Source | null>;
  readonly importStatus: "idle" | "importing";
  readonly importError: string | null;
  readonly retryLibrary: () => void;
}

export function useReaderWorkspace(gateway: ReaderWorkspaceGateway): ReaderWorkspaceController {
  const library = useLibrarySelection(gateway);
  const source = useSourceToolsWorkspace(
    gateway,
    library.selectedSource?.id ?? null,
    library.reconcileSource,
  );
  return {
    ...library,
    ...source,
  };
}

// Source-scoped editing keeps hydration, autosave, mutations, and revision state together.

export function useSourceToolsWorkspace(
  gateway: ReaderWorkspaceGateway,
  selectedSourceId: SourceId | null,
  reconcileSource: (source: Source) => void,
): ReaderSourceWorkspaceController {
  const resources = useSelectedSourceResources(gateway, selectedSourceId);
  const { source, setSource, annotations, setAnnotations } = resources;
  const sourceRecord = selectedResource(selectedSourceId, source);
  const annotationResource = selectedResource(selectedSourceId, annotations);
  const publishSource = useCallback(
    (value: SelectedValue<AsyncResource<Source>>): void => {
      setSource((current) => (current?.sourceId === value.sourceId ? value : current));
      if (value.value.status === "ready") {
        reconcileSource(value.value.value);
      }
    },
    [reconcileSource, setSource],
  );
  const publishDraft = useCallback(
    (value: Source): void => {
      publishSource({ sourceId: value.id, value: { status: "ready", value } });
    },
    [publishSource],
  );
  const { session, snapshot } = useSourceDraft(
    gateway,
    sourceRecord.status === "ready" ? sourceRecord.value : null,
    publishDraft,
  );
  const draftValue = snapshot.body;
  const setDraft = (value: string): void => {
    session?.edit(value);
  };
  const saveDraft = (): void => {
    void session?.save();
  };
  const setDraftState = (value: SelectedValue<string>): void => {
    if (value.sourceId === selectedSourceId) {
      session?.edit(value.value);
    }
  };
  const annotationMutations = useSelectedAnnotationMutations(gateway, setAnnotations);
  const saveReadingPosition = useReadingPositionSave(gateway, sourceRecord, publishSource);
  const citation = useSelectedCitationEditor(gateway, sourceRecord, publishSource);
  const transclusion = useSelectedTransclusion(
    gateway,
    sourceRecord,
    draftValue,
    publishSource,
    setDraftState,
  );

  return {
    sourceRecord,
    annotations: annotationResource,
    draft: draftValue,
    draftReady: session !== null,
    saveStatus: snapshot.status,
    saveError: snapshot.error,
    draftRecovery: snapshot,
    resolveDraftConflict: (choice) => session?.resolve(choice),
    citation,
    transclusion,
    setDraft,
    saveDraft,
    ...annotationMutations,
    saveReadingPosition,
  };
}

function useSelectedAnnotationMutations(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): Pick<
  ReaderSourceWorkspaceController,
  "createAnnotation" | "updateAnnotation" | "planAnnotationDeletion" | "deleteAnnotation"
> {
  const deletion = useAnnotationDeletion(gateway, setAnnotations);
  return {
    createAnnotation: useAnnotationCreation(gateway, setAnnotations),
    updateAnnotation: useAnnotationUpdate(gateway, setAnnotations),
    planAnnotationDeletion: deletion.plan,
    deleteAnnotation: deletion.remove,
  };
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
