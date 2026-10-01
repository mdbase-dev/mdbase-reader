import { useEffect, useState, useSyncExternalStore } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

const empty: ReadonlyMap<SourceId, number> = new Map();

const noSubscription = (): (() => void) => () => undefined;
const zeroRevision = (): number => 0;

/** Refresh only after membership changes, not source navigation or annotation loading. */
export function useAnnotationCounts(
  gateway: ReaderWorkspaceGateway,
  enabled = true,
): ReadonlyMap<SourceId, number> {
  const revision = useSyncExternalStore(
    gateway.subscribeAnnotationCounts ?? noSubscription,
    gateway.annotationCountsRevision ?? zeroRevision,
    zeroRevision,
  );
  const [counts, setCounts] = useState(empty);
  useEffect(() => {
    if (!enabled || !gateway.annotationCounts) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .annotationCounts({ signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setCounts(next);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, gateway, revision]);
  return counts;
}
