import {
  activeTab,
  createWorkspaceTab,
  paneById,
  tabLocation,
  updatePane,
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
  const id = workspaceTabId(location.sourceId, location.view);
  const exists = pane.tabs.some((tab) => tab.id === id);
  return {
    ...pane,
    tabs: exists ? pane.tabs : [...pane.tabs, createWorkspaceTab(location.sourceId, location.view)],
    activeTabId: id,
    history: { ...pane.history, index },
  };
}

function sameLocation(left: WorkspaceLocation | undefined, right: WorkspaceLocation): boolean {
  return left?.sourceId === right.sourceId && left.view === right.view;
}

export function currentPaneLocation(pane: SourceWorkspacePane): WorkspaceLocation | null {
  const tab = activeTab(pane);
  return tab ? tabLocation(tab) : null;
}
