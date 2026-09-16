import {
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

import { readerErrorMessage } from "./errors.js";
import { sharedAnnotationResource } from "./shared-annotation-resource.js";

import type { SelectedValue } from "./selected-resource.js";
import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, Source, SourceId } from "@mdbase-reader/core";

const noSubscription = (): (() => void) => () => undefined;
const noAnnotations = (): AnnotationState => null;
const ignoreAnnotations: Dispatch<SetStateAction<AnnotationState>> = () => undefined;

export type AnnotationState = SelectedValue<AsyncResource<readonly Annotation[]>> | null;
export type SourceState = SelectedValue<AsyncResource<Source>> | null;

export interface SelectedSourceResources {
  readonly source: SourceState;
  readonly setSource: Dispatch<SetStateAction<SourceState>>;
  readonly annotations: AnnotationState;
  readonly setAnnotations: Dispatch<SetStateAction<AnnotationState>>;
}

export function useSelectedSourceResources(
  gateway: ReaderWorkspaceGateway,
  sourceId: SourceId | null,
): SelectedSourceResources {
  const [source, setSource] = useState<SourceState>(null);
  const resource = sourceId ? sharedAnnotationResource(gateway, sourceId) : null;
  const annotations = useSyncExternalStore(
    resource?.subscribe ?? noSubscription,
    resource?.getSnapshot ?? noAnnotations,
  );
  const setAnnotations = resource?.set ?? ignoreAnnotations;
  useEffect(() => {
    resource?.load();
  }, [resource]);
  useEffect(() => {
    if (!sourceId) {
      return;
    }
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
    return () => controller.abort();
  }, [gateway, sourceId]);
  return { source, setSource, annotations, setAnnotations };
}
