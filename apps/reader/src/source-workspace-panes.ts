import { activeTab, createPane, paneById } from "./source-workspace-layout.js";
import { closeWorkspaceTab } from "./source-workspace-tab-closing.js";
import { activateWorkspaceTab, openWorkspaceTab } from "./source-workspace-tabs.js";

import type {
  SourceWorkspaceLayout,
  WorkspacePaneId,
  WorkspaceSplitDirection,
  WorkspaceTab,
  WorkspaceTabId,
  WorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

export function focusPane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  return paneById(layout, paneId) ? { ...layout, focusedPaneId: paneId } : layout;
}

export function splitPane(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId | null,
  direction: WorkspaceSplitDirection = "horizontal",
  view: WorkspaceView = "document",
): SourceWorkspaceLayout {
  if (layout.panes.length === 2) {
    return sourceId
      ? openWorkspaceTab(layout, sourceId, { paneId: otherPaneId(layout.focusedPaneId), view })
      : focusPane(layout, otherPaneId(layout.focusedPaneId));
  }
  const secondary = createPane("secondary");
  const split = {
    ...layout,
    panes: [...layout.panes, secondary],
    focusedPaneId: "secondary" as const,
    splitDirection: direction,
  };
  return sourceId ? openWorkspaceTab(split, sourceId, { paneId: "secondary", view }) : split;
}

export function openBeside(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  view: WorkspaceView = "document",
  direction: WorkspaceSplitDirection = "horizontal",
): SourceWorkspaceLayout {
  return splitPane(layout, sourceId, direction, view);
}

export function moveWorkspaceTabToPane(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  fromPaneId: WorkspacePaneId,
  toPaneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  if (fromPaneId === toPaneId) {
    return activateWorkspaceTab(layout, tabId, toPaneId);
  }
  const tab = paneById(layout, fromPaneId)?.tabs.find(({ id }) => id === tabId);
  if (!tab || !paneById(layout, toPaneId)) {
    return layout;
  }
  const opened = openWorkspaceTab(layout, tab.sourceId, {
    paneId: toPaneId,
    view: tab.view,
    pinned: tab.pinned,
  });
  return closeWorkspaceTab(opened, tab.id, fromPaneId);
}

export function splitWorkspaceTab(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId,
  direction: WorkspaceSplitDirection,
): SourceWorkspaceLayout {
  const tab = paneById(layout, paneId)?.tabs.find(({ id }) => id === tabId);
  if (!tab) {
    return layout;
  }
  const split = splitPane(focusPane(layout, paneId), tab.sourceId, direction, tab.view);
  return split.panes.length === 2 ? closeWorkspaceTab(split, tab.id, paneId) : split;
}

export function closeSecondaryPane(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  const secondary = paneById(layout, "secondary");
  const primary = paneById(layout, "primary");
  if (!secondary || !primary) {
    return layout;
  }
  let next: SourceWorkspaceLayout = {
    ...layout,
    panes: [primary],
    focusedPaneId: "primary",
    splitDirection: null,
  };
  for (const tab of secondary.tabs) {
    next = openWorkspaceTab(next, tab.sourceId, {
      paneId: "primary",
      view: tab.view,
      pinned: tab.pinned,
    });
  }
  return next;
}

export function resizeWorkspaceSplit(
  layout: SourceWorkspaceLayout,
  ratio: number,
): SourceWorkspaceLayout {
  return layout.panes.length === 2
    ? { ...layout, splitRatio: Math.min(0.72, Math.max(0.28, ratio)) }
    : layout;
}

export function setWorkspaceSplitDirection(
  layout: SourceWorkspaceLayout,
  direction: WorkspaceSplitDirection,
): SourceWorkspaceLayout {
  return layout.panes.length === 2 ? { ...layout, splitDirection: direction } : layout;
}

export function otherPaneId(paneId: WorkspacePaneId): WorkspacePaneId {
  return paneId === "primary" ? "secondary" : "primary";
}

export function focusedPaneActiveTab(layout: SourceWorkspaceLayout): WorkspaceTab | null {
  return activeTab(paneById(layout, layout.focusedPaneId) ?? createPane("primary"));
}
