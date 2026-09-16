import type {
  SourceWorkspaceLayout,
  WorkspacePaneId,
  WorkspaceTabId,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

export interface AnnotationDocumentTarget {
  readonly paneId: WorkspacePaneId;
  readonly tabId: WorkspaceTabId | null;
}

export function annotationDocumentTarget(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  preferredPaneId: WorkspacePaneId,
): AnnotationDocumentTarget {
  const panes = [
    ...layout.panes.filter(({ id }) => id === preferredPaneId),
    ...layout.panes.filter(({ id }) => id !== preferredPaneId),
  ];
  for (const pane of panes) {
    const tab = pane.tabs.find(
      (candidate) =>
        candidate.kind === "source" &&
        candidate.sourceId === sourceId &&
        candidate.view === "document",
    );
    if (tab) {
      return { paneId: pane.id, tabId: tab.id };
    }
  }
  return { paneId: preferredPaneId, tabId: null };
}
