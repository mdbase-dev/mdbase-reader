import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { readerErrorMessage } from "./errors.js";

import type { SelectedValue } from "./selected-resource.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceId } from "@mdbase-reader/core";

export type AnnotationState = SelectedValue<AsyncResource<readonly Annotation[]>> | null;
export type SourceState = SelectedValue<AsyncResource<Source>> | null;

export interface SelectedSourceResources {
  readonly source: SourceState;
  readonly setSource: Dispatch<SetStateAction<SourceState>>;
  readonly annotations: AnnotationState;
  readonly setAnnotations: Dispatch<SetStateAction<AnnotationState>>;
  readonly draft: SelectedValue<string> | null;
  readonly setDraft: Dispatch<SetStateAction<SelectedValue<string> | null>>;
}

export function useSelectedSourceResources(
  gateway: ReaderWorkspaceGateway,
  sourceId: SourceId | null,
): SelectedSourceResources {
  const [source, setSource] = useState<SourceState>(null);
  const [annotations, setAnnotations] = useState<AnnotationState>(null);
  const [draft, setDraft] = useState<SelectedValue<string> | null>(null);
  useEffect(() => {
    if (!sourceId) {
      return;
    }
    const controller = new AbortController();
    void gateway
      .source(sourceId, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          if (value) {
            setDraft({ sourceId, value: value.body });
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
              message: readerErrorMessage(
                reason,
                "Reader could not load this source's annotations.",
              ),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, sourceId]);
  return { source, setSource, annotations, setAnnotations, draft, setDraft };
}
