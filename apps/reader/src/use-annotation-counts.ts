import { useEffect, useState } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

const empty: ReadonlyMap<SourceId, number> = new Map();

/** Annotation counts for the library; `revision` refetches after annotations change. */
export function useAnnotationCounts(
  gateway: ReaderWorkspaceGateway,
  revision: unknown,
): ReadonlyMap<SourceId, number> {
  const [counts, setCounts] = useState(empty);
  useEffect(() => {
    if (!gateway.annotationCounts) {
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
  }, [gateway, revision]);
  return counts;
}
