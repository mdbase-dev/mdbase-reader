import {
  activeTab,
  createLibraryWorkspaceTab,
  createWorkspaceTab,
  paneById,
  tabLocation,
  updatePane,
  libraryWorkspaceTabId,
  workspaceTabId,
} from "./source-workspace-layout.js";

import type {
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  WorkspaceLocation,
  WorkspacePaneId,
} from "./source-workspace-layout.js";

const historyLimit = 60;

export function pushPaneHistory(
  pane: SourceWorkspacePane,
  location: WorkspaceLocation,
): SourceWorkspacePane {
  const current = pane.history.entries[pane.history.index];
  if (sameLocation(current, location)) {
    return pane;
  }
  const entries = [...pane.history.entries.slice(0, pane.history.index + 1), location].slice(
    -historyLimit,
  );
  return { ...pane, history: { entries, index: entries.length - 1 } };
}

export function navigateWorkspaceHistory(
  layout: SourceWorkspaceLayout,
  delta: -1 | 1,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  if (!pane) {
    return layout;
  }
  const index = pane.history.index + delta;
  const location = pane.history.entries[index];
  if (!location) {
    return layout;
  }
  return updatePane(layout, paneId, (current) => activateHistoryLocation(current, location, index));
}

export function canNavigateHistory(pane: SourceWorkspacePane, delta: -1 | 1): boolean {
  return pane.history.entries[pane.history.index + delta] !== undefined;
}

function activateHistoryLocation(
  pane: SourceWorkspacePane,
  location: WorkspaceLocation,
  index: number,
): SourceWorkspacePane {
  const id =
    location.kind === "source"
      ? workspaceTabId(location.sourceId, location.view)
      : libraryWorkspaceTabId(location.libraryViewId);
  const exists = pane.tabs.some((tab) => tab.id === id);
  return {
    ...pane,
    tabs: exists
      ? pane.tabs
      : [
          ...pane.tabs,
          location.kind === "source"
            ? createWorkspaceTab(location.sourceId, location.view)
            : createLibraryWorkspaceTab(location.libraryViewId, location.title),
        ],
    activeTabId: id,
    history: { ...pane.history, index },
  };
}

function sameLocation(left: WorkspaceLocation | undefined, right: WorkspaceLocation): boolean {
  if (left?.kind !== right.kind) {
    return false;
  }
  return left.kind === "source" && right.kind === "source"
    ? left.sourceId === right.sourceId && left.view === right.view
    : left.kind === "library" &&
        right.kind === "library" &&
        left.libraryViewId === right.libraryViewId;
}

export function currentPaneLocation(pane: SourceWorkspacePane): WorkspaceLocation | null {
  const tab = activeTab(pane);
  return tab ? tabLocation(tab) : null;
}
