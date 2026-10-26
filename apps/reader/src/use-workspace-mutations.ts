import { t as translate } from "@lingui/core/macro";
import { annotationId, dateTime } from "@mdbase-reader/core";
import { useCallback, type Dispatch, type SetStateAction } from "react";

import { publishSharedAnnotation, sharedAnnotationResource } from "./shared-annotation-resource.js";

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
  _setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): (request: AnnotationCreationRequest) => Promise<Annotation> {
  return useCallback(
    async (request: AnnotationCreationRequest): Promise<Annotation> => {
      const pending = pendingAnnotation(request);
      const setOwnerAnnotations = sharedAnnotationResource(gateway, request.sourceId).set;
      setOwnerAnnotations((current) => {
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
        setOwnerAnnotations((current) => replacePendingAnnotation(current, pending, created));
        return created;
      } catch (reason) {
        setOwnerAnnotations((current) => removePendingAnnotation(current, pending));
        throw reason;
      }
    },
    [gateway],
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

function replaceAnnotation(
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
  annotation: Annotation,
  updated: Annotation,
): void {
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
}

export function useAnnotationUpdate(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): (annotation: Annotation, body: string) => Promise<Annotation> {
  return useCallback(
    async (annotation, body) => {
      const updated = await gateway.updateAnnotation(annotation, body);
      publishSharedAnnotation(gateway, annotation, updated);
      replaceAnnotation(setAnnotations, annotation, updated);
      return updated;
    },
    [gateway, setAnnotations],
  );
}

/** Changes a highlight's colour, or undefined when the collection cannot. */
export function useAnnotationRecolor(
  gateway: ReaderWorkspaceGateway,
  setAnnotations: Dispatch<SetStateAction<AnnotationState>>,
): ((annotation: Annotation, color: string) => Promise<Annotation>) | undefined {
  const recolor = useCallback(
    async (annotation: Annotation, color: string): Promise<Annotation> => {
      if (!gateway.setAnnotationColor) {
        throw new Error(translate({ message: "This collection cannot change highlight colours." }));
      }
      const updated = await gateway.setAnnotationColor(annotation, color);
      publishSharedAnnotation(gateway, annotation, updated);
      replaceAnnotation(setAnnotations, annotation, updated);
      return updated;
    },
    [gateway, setAnnotations],
  );
  return gateway.setAnnotationColor ? recolor : undefined;
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
      publishSharedAnnotation(gateway, annotation, null);
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
): (
  sourceId: SourceId,
  documentFileId: FileId,
  position: ReadingPosition,
  progress?: number | null,
) => Promise<void> {
  return useCallback(
    async (sourceId, documentFileId, position, progress): Promise<void> => {
      if (source.status !== "ready" || source.value.id !== sourceId) {
        return;
      }
      const updated = await gateway.saveReadingPosition(
        source.value,
        documentFileId,
        position,
        progress,
      );
      setSource({ sourceId: updated.id, value: { status: "ready", value: updated } });
    },
    [gateway, setSource, source],
  );
}
