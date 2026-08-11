import type { WorkspacePaneId, WorkspaceTab } from "./source-workspace-layout.js";
import type { DragEvent } from "react";

const tabDataType = "application/x-mdbase-reader-tab";

export interface DraggedWorkspaceTab {
  readonly paneId: WorkspacePaneId;
  readonly tabId: string;
  readonly index: number;
}

export function startTabDrag(
  event: DragEvent,
  paneId: WorkspacePaneId,
  tab: WorkspaceTab,
  index: number,
): void {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(tabDataType, JSON.stringify({ paneId, tabId: tab.id, index }));
}

export function dropTab(
  event: DragEvent,
  paneId: WorkspacePaneId,
  index: number,
  reorder: (fromIndex: number, toIndex: number) => void,
  moveFromPane: (tabId: WorkspaceTab["id"], fromPaneId: WorkspacePaneId) => void,
): void {
  event.preventDefault();
  const dragged = draggedWorkspaceTab(event.dataTransfer);
  if (!dragged) {
    return;
  }
  if (dragged.paneId === paneId) {
    reorder(dragged.index, index);
    return;
  }
  moveFromPane(dragged.tabId, dragged.paneId);
}

export function draggedWorkspaceTab(dataTransfer: DataTransfer): DraggedWorkspaceTab | null {
  try {
    const value = JSON.parse(dataTransfer.getData(tabDataType)) as unknown;
    return isDraggedTab(value) ? value : null;
  } catch {
    return null;
  }
}

function isDraggedTab(value: unknown): value is DraggedWorkspaceTab {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<DraggedWorkspaceTab>;
  return (
    (candidate.paneId === "primary" || candidate.paneId === "secondary") &&
    typeof candidate.tabId === "string" &&
    typeof candidate.index === "number"
  );
}
