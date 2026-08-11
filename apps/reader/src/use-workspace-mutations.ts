import { annotationId, dateTime } from "@mdbase-reader/core";
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
      const pending = pendingAnnotation(request);
      setAnnotations((current) => {
        const values =
          current?.sourceId === request.sourceId && current.value.status === "ready"
            ? current.value.value
            : [];
        return {
          sourceId: request.sourceId,
          value: { status: "ready", value: [pending, ...values] },
        };
      });
      try {
        const created = await gateway.createAnnotation(request);
        setAnnotations((current) => replacePendingAnnotation(current, pending, created));
        return created;
      } catch (reason) {
        setAnnotations((current) => removePendingAnnotation(current, pending));
        throw reason;
      }
    },
    [gateway, setAnnotations],
  );
}

function pendingAnnotation(request: AnnotationCreationRequest): Annotation {
  return {
    collectionId: request.collectionId,
    sourceId: request.sourceId,
    source: request.source,
    ...(request.document ? { document: request.document } : {}),
    annotationType: request.annotationType,
    ...(request.motivation ? { motivation: request.motivation } : {}),
    ...(request.color ? { color: request.color } : {}),
    ...(request.locator ? { locator: request.locator } : {}),
    ...(request.target ? { target: request.target } : {}),
    tags: request.tags,
    body: request.body,
    id: annotationId(`pending_${crypto.randomUUID()}`),
    createdAt: dateTime(new Date().toISOString()),
    createdBy: "dev.mdbase.reader",
  };
}

function replacePendingAnnotation(
  current: AnnotationState,
  pending: Annotation,
  created: Annotation,
): AnnotationState {
  if (current?.sourceId !== pending.sourceId || current.value.status !== "ready") {
    return current;
  }
  const withoutPending = current.value.value.filter(
    (candidate) => candidate.id !== pending.id && candidate.id !== created.id,
  );
  return {
    sourceId: pending.sourceId,
    value: { status: "ready", value: [created, ...withoutPending] },
  };
}

function removePendingAnnotation(current: AnnotationState, pending: Annotation): AnnotationState {
  if (current?.sourceId !== pending.sourceId || current.value.status !== "ready") {
    return current;
  }
  return {
    sourceId: pending.sourceId,
    value: {
      status: "ready",
      value: current.value.value.filter((candidate) => candidate.id !== pending.id),
    },
  };
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
  setSource: (value: Exclude<SourceState, null>) => void,
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
