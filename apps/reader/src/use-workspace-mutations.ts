import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { SelectedValue } from "./selected-resource.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
  AnnotationDeletionPlan,
  FileId,
  ReadingPosition,
  Source,
  SourceId,
} from "@mdbase-reader/core";

type AnnotationState = SelectedValue<AsyncResource<readonly Annotation[]>> | null;
type SourceState = SelectedValue<AsyncResource<Source>> | null;

export function useAnnotationCreation(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
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

export function useAnnotationUpdate(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): (annotation: Annotation, body: string) => Promise<Annotation> {
  return useCallback(
    async (annotation, body) => {
      const updated = await gateway.updateAnnotation(annotation, body);
      setAnnotations((current) => {
        if (current?.sourceId !== annotation.sourceId || current.value.status !== "ready") {
          return current;
        }
        return {
          sourceId: annotation.sourceId,
          value: {
            status: "ready",
            value: current.value.value.map((candidate) =>
              candidate.id === updated.id ? updated : candidate,
            ),
          },
        };
      });
      return updated;
    },
    [gateway, setAnnotations],
  );
}

export function useAnnotationDeletion(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): {
  readonly plan: (annotation: Annotation) => Promise<AnnotationDeletionPlan>;
  readonly remove: (annotation: Annotation, plan: AnnotationDeletionPlan) => Promise<void>;
} {
  const plan = useCallback(
    (annotation: Annotation) => gateway.planAnnotationDeletion(annotation),
    [gateway],
  );
  const remove = useCallback(
    async (annotation: Annotation, deletionPlan: AnnotationDeletionPlan): Promise<void> => {
      await gateway.deleteAnnotation(annotation, deletionPlan);
      setAnnotations((current) => {
        if (current?.sourceId !== annotation.sourceId || current.value.status !== "ready") {
          return current;
        }
        return {
          sourceId: annotation.sourceId,
          value: {
            status: "ready",
            value: current.value.value.filter((candidate) => candidate.id !== annotation.id),
          },
        };
      });
    },
    [gateway, setAnnotations],
  );
  return { plan, remove };
}

export function useReadingPositionSave(
  gateway: ReaderWorkspaceGateway,
  source: AsyncResource<Source>,
  setSource: Dispatch<SetStateAction<SourceState>>,
): (sourceId: SourceId, documentFileId: FileId, position: ReadingPosition) => Promise<void> {
  return useCallback(
    async (sourceId, documentFileId, position): Promise<void> => {
      if (source.status !== "ready" || source.value.id !== sourceId) {
        return;
      }
      const updated = await gateway.saveReadingPosition(source.value, documentFileId, position);
      setSource({ sourceId: updated.id, value: { status: "ready", value: updated } });
    },
    [gateway, setSource, source],
  );
}
