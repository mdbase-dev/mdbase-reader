import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readerErrorMessage } from "./errors.js";
import { publishSharedAnnotation } from "./shared-annotation-resource.js";

import type { AsyncResource } from "./use-reader-workspace.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { Annotation, AnnotationId } from "@mdbase-reader/core";

const noop = (): (() => void) => () => undefined;
const zero = (): number => 0;

interface Loaded {
  readonly gateway: ReaderWorkspaceGateway;
  readonly annotations: AsyncResource<readonly Annotation[]>;
}

/**
 * Every annotation in the collection. It loads again when annotations change elsewhere, such
 * as a highlight made in a document, and keeps showing what it has while it does.
 */
export function useCollectionAnnotations(gateway: ReaderWorkspaceGateway): {
  readonly annotations: AsyncResource<readonly Annotation[]>;
  /** Records an edit or a deletion made from this list, and tells the source's own panels. */
  readonly change: (before: Annotation, after: Annotation | null) => void;
  readonly retry: () => void;
} {
  const revision = useSyncExternalStore(
    gateway.subscribeAnnotationChanges ?? noop,
    gateway.annotationChangesRevision ?? zero,
    zero,
  );
  const [retries, setRetries] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Edits made here since the last load, so a card shows its change at once.
  const [changes, setChanges] = useState<ReadonlyMap<AnnotationId, Annotation | null>>(new Map());
  useEffect(() => {
    if (!gateway.allAnnotations) {
      return undefined;
    }
    const controller = new AbortController();
    const show = (annotations: readonly Annotation[]): void => {
      if (!controller.signal.aborted) {
        setLoaded({ gateway, annotations: { status: "ready", value: annotations } });
      }
    };
    void gateway
      .allAnnotations({ signal: controller.signal, refresh: retries > 0, onProgress: show })
      .then((annotations) => {
        show(annotations);
        if (!controller.signal.aborted) {
          setChanges(new Map());
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({
            gateway,
            annotations: {
              status: "error",
              message: readerErrorMessage(
                reason,
                t({ message: "Reader could not list annotations." }),
              ),
            },
          });
        }
      });
    return () => controller.abort();
  }, [gateway, retries, revision]);
  const current = loaded?.gateway === gateway ? loaded.annotations : null;
  const annotations = useMemo((): AsyncResource<readonly Annotation[]> => {
    if (!gateway.allAnnotations) {
      return { status: "error", message: t`This collection cannot list all annotations.` };
    }
    if (current?.status !== "ready" || changes.size === 0) {
      return current ?? { status: "loading" };
    }
    return {
      status: "ready",
      value: current.value.flatMap((annotation) => {
        const changed = changes.get(annotation.id);
        return changed === undefined ? [annotation] : changed ? [changed] : [];
      }),
    };
  }, [changes, current, gateway]);
  const change = useCallback(
    (before: Annotation, after: Annotation | null): void => {
      setChanges((previous) => new Map(previous).set(before.id, after));
      publishSharedAnnotation(gateway, before, after);
    },
    [gateway],
  );
  return { annotations, change, retry: () => setRetries((count) => count + 1) };
}
