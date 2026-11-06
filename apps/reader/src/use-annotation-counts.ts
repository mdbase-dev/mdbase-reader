import { useEffect, useState, useSyncExternalStore } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

const noSubscription = (): (() => void) => () => undefined;
const zeroRevision = (): number => 0;

/** Refresh only after membership changes, not source navigation or annotation loading. */
export function useAnnotationCounts(
  gateway: ReaderWorkspaceGateway,
  enabled = true,
): ReadonlyMap<SourceId, number> | null {
  const revision = useSyncExternalStore(
    gateway.subscribeAnnotationCounts ?? noSubscription,
    gateway.annotationCountsRevision ?? zeroRevision,
    zeroRevision,
  );
  const [result, setResult] = useState<{
    gateway: ReaderWorkspaceGateway;
    revision: number;
    counts: ReadonlyMap<SourceId, number>;
  } | null>(null);
  const counts = result?.gateway === gateway && result.revision === revision ? result.counts : null;
  useEffect(() => {
    if (!enabled || !gateway.annotationCounts || counts !== null) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .annotationCounts({ signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setResult({ gateway, revision, counts: next });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [counts, enabled, gateway, revision]);
  return counts;
}
