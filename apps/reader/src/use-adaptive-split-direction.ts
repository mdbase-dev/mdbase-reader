import { useEffect } from "react";

import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { RefObject } from "react";

export function useAdaptiveSplitDirection(
  workspaceRef: RefObject<HTMLElement | null>,
  workspace: SourceWorkspaceController,
): void {
  useEffect(() => {
    const element = workspaceRef.current;
    if (!element || workspace.layout.panes.length !== 2) {
      return undefined;
    }
    const preferReadableSplit = (): void => {
      if (workspace.layout.splitDirection === "horizontal" && element.clientWidth < 840) {
        workspace.setSplitDirection("vertical");
      }
    };
    const observer = new ResizeObserver(preferReadableSplit);
    observer.observe(element);
    preferReadableSplit();
    return () => observer.disconnect();
  }, [workspace, workspace.layout.panes.length, workspace.layout.splitDirection, workspaceRef]);
}
