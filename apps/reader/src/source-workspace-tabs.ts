import { pushPaneHistory } from "./source-workspace-history.js";
import {
  activeTab,
  createWorkspaceTab,
  focusedPane,
  paneById,
  tabLocation,
  updatePane,
  workspaceTabId,
} from "./source-workspace-layout.js";

import type {
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  WorkspacePaneId,
  WorkspaceTab,
  WorkspaceTabId,
  WorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

const recentSourceLimit = 80;

export interface OpenWorkspaceTabOptions {
  readonly paneId?: WorkspacePaneId;
  readonly view?: WorkspaceView;
  readonly preview?: boolean;
  readonly pinned?: boolean;
}

export function openSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return openWorkspaceTab(layout, sourceId, { paneId, preview: false });
}

export function previewSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return openWorkspaceTab(layout, sourceId, { paneId, preview: true });
}

export function openWorkspaceTab(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  options: OpenWorkspaceTabOptions = {},
): SourceWorkspaceLayout {
  const paneId = options.paneId ?? layout.focusedPaneId;
  const view = options.view ?? "document";
  const id = workspaceTabId(sourceId, view);
  let next = updatePane(layout, paneId, (pane) => {
    const existing = pane.tabs.find((tab) => tab.id === id);
    if (existing) {
      const promoted = options.preview === false || options.pinned;
      const tabs = promoted
        ? pane.tabs.map((tab) =>
            tab.id === id ? { ...tab, preview: false, pinned: options.pinned ?? tab.pinned } : tab,
          )
        : pane.tabs;
      return activatePaneTab({ ...pane, tabs }, id);
    }
    const preview = options.preview ?? false;
    const replacementIndex = preview ? reusablePreviewIndex(pane) : -1;
    const tab = {
      ...createWorkspaceTab(sourceId, view, preview),
      pinned: options.pinned ?? false,
    };
    const tabs = [...pane.tabs];
    if (replacementIndex >= 0) {
      tabs[replacementIndex] = tab;
    } else {
      tabs.push(tab);
    }
    return activatePaneTab({ ...pane, tabs }, tab.id);
  });
  next = rememberWorkspaceSource(next, sourceId);
  return next;
}

export function activateSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  const tab = pane?.tabs.find((candidate) => candidate.sourceId === sourceId);
  return tab ? activateWorkspaceTab(layout, tab.id, paneId) : layout;
}

export function activateWorkspaceTab(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const tab = paneById(layout, paneId)?.tabs.find(({ id }) => id === tabId);
  if (!tab) {
    return layout;
  }
  return rememberWorkspaceSource(
    updatePane(layout, paneId, (pane) => activatePaneTab(pane, tabId)),
    tab.sourceId,
  );
}

export function promoteWorkspaceTab(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) => (tab.id === tabId ? { ...tab, preview: false } : tab)),
  }));
}

export function setWorkspaceTabPinned(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  pinned: boolean,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, pinned, preview: pinned ? false : tab.preview } : tab,
    ),
  }));
}

export function setWorkspaceTabDirty(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  dirty: boolean,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (pane) => ({
    ...pane,
    tabs: pane.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, dirty, preview: dirty ? false : tab.preview } : tab,
    ),
  }));
}

export function reorderWorkspaceTab(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  fromIndex: number,
  toIndex: number,
): SourceWorkspaceLayout {
  return updatePane(layout, paneId, (pane) => {
    const tab = pane.tabs[fromIndex];
    if (!tab || toIndex < 0 || toIndex >= pane.tabs.length || fromIndex === toIndex) {
      return pane;
    }
    const tabs = [...pane.tabs];
    tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, tab);
    return { ...pane, tabs };
  });
}

export function matchingWorkspaceTabs(
  layout: SourceWorkspaceLayout,
  query: string,
  title: (sourceId: SourceId) => string,
): readonly WorkspaceTab[] {
  const normalized = query.trim().toLocaleLowerCase();
  return layout.panes
    .flatMap(({ tabs }) => tabs)
    .filter(
      (tab) =>
        !normalized ||
        title(tab.sourceId).toLocaleLowerCase().includes(normalized) ||
        tab.view.includes(normalized),
    );
}

export function activatePaneTab(
  pane: SourceWorkspacePane,
  tabId: WorkspaceTabId,
): SourceWorkspacePane {
  const tab = pane.tabs.find(({ id }) => id === tabId);
  return tab ? pushPaneHistory({ ...pane, activeTabId: tabId }, tabLocation(tab)) : pane;
}

function reusablePreviewIndex(pane: SourceWorkspacePane): number {
  return pane.tabs.findIndex(({ preview, pinned, dirty }) => preview && !pinned && !dirty);
}

export function rememberWorkspaceSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
): SourceWorkspaceLayout {
  return {
    ...layout,
    recentSourceIds: [sourceId, ...layout.recentSourceIds.filter((id) => id !== sourceId)].slice(
      0,
      recentSourceLimit,
    ),
  };
}

export function activeSourceId(layout: SourceWorkspaceLayout): SourceId | null {
  return activeTab(focusedPane(layout))?.sourceId ?? null;
}
