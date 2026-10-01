import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";

import { insertAnnotationInDraft } from "./insert-annotation-in-draft.js";
import { selectedResource, type SelectedValue } from "./selected-resource.js";
import {
  useAnnotationTransclusion,
  type AnnotationTransclusionController,
} from "./use-annotation-transclusion.js";
import { useCitationEditor, type CitationEditorController } from "./use-citation-editor.js";
import { useLibrarySelection, type LibrarySelection } from "./use-library-selection.js";
import {
  useSelectedSourceResources,
  type AnnotationState,
} from "./use-selected-source-resources.js";
import { useSourceDraft } from "./use-source-draft.js";
import { useSourceFields, type SourceFieldsController } from "./use-source-fields.js";
import {
  useAnnotationCreation,
  useAnnotationDeletion,
  useAnnotationUpdate,
  useReadingPositionSave,
} from "./use-workspace-mutations.js";

import type { SourceDraftSession, SourceDraftSnapshot } from "./source-draft-session.js";
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
import type { SharedTextDocument } from "@mdbase-reader/markdown-editor";

export type AsyncResource<Value> =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly value: Value }
  | { readonly status: "error"; readonly message: string };

export interface ReaderSourceWorkspaceController {
  readonly sourceRecord: AsyncResource<Source>;
  readonly annotations: AsyncResource<readonly Annotation[]>;
  readonly draft: string;
  readonly draftReady: boolean;
  readonly draftDocument?: SharedTextDocument;
  readonly saveStatus: "saved" | "unsaved" | "saving" | "error";
  readonly saveError: string | null;
  readonly draftRecovery?: SourceDraftSnapshot;
  readonly resolveDraftConflict?: (choice: "local" | "remote") => void;
  readonly citation: CitationEditorController;
  /** The source's friendly fields (title, authors, …), edited outside its citation. */
  readonly sourceFields: SourceFieldsController;
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
  /** Takes a source written elsewhere (an attached file, a stored citation) as current. */
  readonly adoptSource: (source: Source) => void;
}

export interface ReaderWorkspaceController
  extends
    ReaderSourceWorkspaceController,
    Pick<LibrarySelection, "createSource" | "attachSourceFile" | "saveNewSourceCitation"> {
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

export function useReaderWorkspace(
  gateway: ReaderWorkspaceGateway,
  initialSourceId: SourceId | null = null,
): ReaderWorkspaceController {
  const selection = useLibrarySelection(gateway, initialSourceId);
  const source = useSourceToolsWorkspace(
    gateway,
    selection.selectedSourceId,
    selection.reconcileSource,
  );
  const resolved = source.sourceRecord.status === "ready" ? source.sourceRecord.value : null;
  const library = useMemo(() => {
    const indexed = selection.library;
    if (
      !resolved ||
      indexed.status !== "ready" ||
      indexed.value.sources.some(({ id }) => id === resolved.id)
    ) {
      return indexed;
    }
    // A targeted read can complete before its page in the background index.
    return {
      status: "ready" as const,
      value: {
        ...indexed.value,
        sources: [...indexed.value.sources, resolved],
      },
    };
  }, [resolved, selection.library]);
  return {
    ...selection,
    ...source,
    library,
    selectedSource: selection.selectedSource ?? resolved,
    ...adoptingWrites(selection, source.adoptSource),
  };
}

/**
 * Writes outside the source panel must also replace the open source record: annotations are
 * checked against its documents, so a stale copy rejects a newly attached file.
 */
export function adoptingWrites(
  library: Pick<LibrarySelection, "attachSourceFile" | "saveNewSourceCitation">,
  adoptSource: (source: Source) => void,
): Pick<LibrarySelection, "attachSourceFile" | "saveNewSourceCitation"> {
  const { attachSourceFile, saveNewSourceCitation } = library;
  return {
    ...(attachSourceFile
      ? {
          attachSourceFile: async (request, options) => {
            const updated = await attachSourceFile(request, options);
            adoptSource(updated);
            return updated;
          },
        }
      : {}),
    ...(saveNewSourceCitation
      ? {
          saveNewSourceCitation: async (target, citation) => {
            const updated = await saveNewSourceCitation(target, citation);
            adoptSource(updated);
            return updated;
          },
        }
      : {}),
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
  const sourceFields = useSourceFields({
    gateway,
    sourceId: selectedSourceId,
    onSaved: publishDraft,
  });
  const transclusion = useSelectedTransclusion(
    gateway,
    sourceRecord,
    draftValue,
    publishSource,
    setDraftState,
    session,
  );

  return {
    sourceRecord,
    annotations: annotationResource,
    draft: draftValue,
    draftReady: session !== null,
    ...(session ? { draftDocument: session } : {}),
    saveStatus: snapshot.status,
    saveError: snapshot.error,
    draftRecovery: snapshot,
    resolveDraftConflict: (choice) => session?.resolve(choice),
    citation,
    sourceFields,
    transclusion,
    setDraft,
    saveDraft,
    ...annotationMutations,
    saveReadingPosition,
    adoptSource: publishDraft,
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
  session: SourceDraftSession | null,
): AnnotationTransclusionController {
  return useAnnotationTransclusion({
    gateway,
    source,
    draft,
    ...(session
      ? {
          persist: (source: Source, annotation: Annotation) =>
            insertAnnotationInDraft(session, source, annotation),
        }
      : {}),
    onSaved: (value) => {
      setSource({ sourceId: value.id, value: { status: "ready", value } });
      setDraft({ sourceId: value.id, value: value.body });
    },
  });
}
