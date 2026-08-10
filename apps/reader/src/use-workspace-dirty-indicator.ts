import { useEffect } from "react";

import type { ReaderWorkspaceController } from "./use-reader-workspace.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";

export function useWorkspaceDirtyIndicator(
  workspace: ReaderWorkspaceController,
  sourceWorkspace: SourceWorkspaceController,
): void {
  const tab = sourceWorkspace.activeTab;
  const noteDirty =
    workspace.sourceRecord.status === "ready" &&
    workspace.draft !== workspace.sourceRecord.value.body;
  const dirty =
    tab?.view === "note" ? noteDirty : tab?.view === "citation" && workspace.citation.dirty;
  useEffect(() => {
    if (tab && tab.sourceId === workspace.selectedSource?.id) {
      sourceWorkspace.markDirty(tab.id, sourceWorkspace.activePane.id, dirty);
    }
  }, [dirty, sourceWorkspace, tab, workspace.selectedSource?.id]);
}
