import { paneById, updatePane } from "./source-workspace-layout.js";
import { activatePaneTab, rememberWorkspaceSource } from "./source-workspace-tabs.js";

import type {
  ClosedWorkspaceTab,
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  WorkspacePaneId,
  WorkspaceTab,
  WorkspaceTabId,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

const closedTabLimit = 20;

export function closeSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  const tab = pane?.tabs.find((candidate) => candidate.sourceId === sourceId);
  return tab ? closeWorkspaceTab(layout, tab.id, paneId) : layout;
}

export function closeWorkspaceTab(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  const closingIndex = pane?.tabs.findIndex(({ id }) => id === tabId) ?? -1;
  const tab = pane?.tabs[closingIndex];
  if (!pane || !tab || closingIndex < 0) {
    return layout;
  }
  const closed: ClosedWorkspaceTab = { paneId, tab: { ...tab, dirty: false }, index: closingIndex };
  const next = updatePane(layout, paneId, (current) => closePaneTab(current, tabId, closingIndex));
  return { ...next, recentlyClosed: [closed, ...next.recentlyClosed].slice(0, closedTabLimit) };
}

export function closeOtherWorkspaceTabs(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return closeMatchingTabs(layout, paneId, (tab) => tab.id !== tabId && !tab.pinned);
}

export function closeWorkspaceTabsToRight(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  const index = pane?.tabs.findIndex(({ id }) => id === tabId) ?? -1;
  return index < 0
    ? layout
    : closeMatchingTabs(
        layout,
        paneId,
        (tab, candidateIndex) => candidateIndex > index && !tab.pinned,
      );
}

export function reopenClosedWorkspaceTab(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  const [closed, ...recentlyClosed] = layout.recentlyClosed;
  if (!closed) {
    return layout;
  }
  const paneId = paneById(layout, closed.paneId) ? closed.paneId : layout.focusedPaneId;
  const next = updatePane(layout, paneId, (pane) => {
    const tabs = [...pane.tabs];
    tabs.splice(Math.min(closed.index, tabs.length), 0, closed.tab);
    return activatePaneTab({ ...pane, tabs }, closed.tab.id);
  });
  return rememberWorkspaceSource({ ...next, recentlyClosed }, closed.tab.sourceId);
}

function closePaneTab(
  pane: SourceWorkspacePane,
  tabId: WorkspaceTabId,
  closingIndex: number,
): SourceWorkspacePane {
  const tabs = pane.tabs.filter(({ id }) => id !== tabId);
  if (pane.activeTabId !== tabId) {
    return { ...pane, tabs };
  }
  const active = tabs[Math.min(closingIndex, tabs.length - 1)] ?? tabs.at(-1) ?? null;
  return active
    ? activatePaneTab({ ...pane, tabs }, active.id)
    : { ...pane, tabs, activeTabId: null };
}

function closeMatchingTabs(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  predicate: (tab: WorkspaceTab, index: number) => boolean,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  if (!pane) {
    return layout;
  }
  return pane.tabs.reduceRight(
    (current, tab, index) =>
      predicate(tab, index) ? closeWorkspaceTab(current, tab.id, paneId) : current,
    layout,
  );
}
