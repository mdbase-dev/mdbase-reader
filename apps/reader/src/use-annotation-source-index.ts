import { useEffect, useState } from "react";

import type { ReaderWorkspaceGateway } from "./workspace-model.js";
import type { SourceId } from "@mdbase-reader/core";

export function useAnnotationSourceIndex(gateway: ReaderWorkspaceGateway): ReadonlySet<SourceId> {
  const [sourceIds, setSourceIds] = useState<readonly SourceId[]>([]);
  useEffect(() => {
    if (!gateway.annotationSourceIds) {
      return undefined;
    }
    const controller = new AbortController();
    void gateway
      .annotationSourceIds({ signal: controller.signal })
      .then((ids) => {
        if (!controller.signal.aborted) {
          setSourceIds(ids);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [gateway]);
  return new Set(sourceIds);
}
