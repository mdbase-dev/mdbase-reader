import { useCallback, type Dispatch, type SetStateAction } from "react";

import type { AsyncResource, SelectedValue } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type {
  Annotation,
  AnnotationCreationRequest,
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
