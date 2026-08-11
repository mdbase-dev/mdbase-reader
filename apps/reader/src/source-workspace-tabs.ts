import { pushPaneHistory } from "./source-workspace-history.js";
import {
  activeTab,
  createLibraryWorkspaceTab,
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
  SourceWorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

const recentSourceLimit = 80;

export interface OpenWorkspaceTabOptions {
  readonly paneId?: WorkspacePaneId;
  readonly view?: SourceWorkspaceView;
  readonly preview?: boolean;
  readonly pinned?: boolean;
}

export interface OpenLibraryTabOptions {
  readonly paneId?: WorkspacePaneId;
  readonly preview?: boolean;
  readonly pinned?: boolean;
  readonly title?: string;
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

export function openLibraryTab(
  layout: SourceWorkspaceLayout,
  libraryViewId = "all-sources",
  options: OpenLibraryTabOptions = {},
): SourceWorkspaceLayout {
  const paneId = options.paneId ?? layout.focusedPaneId;
  const tab = {
    ...createLibraryWorkspaceTab(
      libraryViewId,
      options.title ?? "Library",
      options.preview ?? false,
    ),
    pinned: options.pinned ?? false,
  };
  return updatePane(layout, paneId, (pane) => openTabInPane(pane, tab));
}

export function activateSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  paneId: WorkspacePaneId = layout.focusedPaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  const tab = pane?.tabs.find(
    (candidate) => candidate.kind === "source" && candidate.sourceId === sourceId,
  );
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
  const next = updatePane(layout, paneId, (pane) => activatePaneTab(pane, tabId));
  return tab.kind === "source" ? rememberWorkspaceSource(next, tab.sourceId) : next;
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
  return updatePane(layout, paneId, (pane) => {
    const tab = pane.tabs.find(({ id }) => id === tabId);
    if (!tab || tab.dirty === dirty) {
      return pane;
    }
    return {
      ...pane,
      tabs: pane.tabs.map((candidate) =>
        candidate.id === tabId
          ? { ...candidate, dirty, preview: dirty ? false : candidate.preview }
          : candidate,
      ),
    };
  });
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
        (tab.kind === "source"
          ? title(tab.sourceId).toLocaleLowerCase()
          : tab.title.toLocaleLowerCase()
        ).includes(normalized) ||
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
  const tab = activeTab(focusedPane(layout));
  return tab?.kind === "source" ? tab.sourceId : null;
}

function openTabInPane(pane: SourceWorkspacePane, tab: WorkspaceTab): SourceWorkspacePane {
  const existing = pane.tabs.find((candidate) => candidate.id === tab.id);
  if (existing) {
    const promoted = !tab.preview || tab.pinned;
    const tabs = promoted
      ? pane.tabs.map((candidate) =>
          candidate.id === tab.id
            ? candidate.kind === "library" && tab.kind === "library"
              ? {
                  ...candidate,
                  title: tab.title,
                  preview: false,
                  pinned: tab.pinned || candidate.pinned,
                }
              : { ...candidate, preview: false, pinned: tab.pinned || candidate.pinned }
            : candidate,
        )
      : pane.tabs;
    return activatePaneTab({ ...pane, tabs }, tab.id);
  }
  const replacementIndex = tab.preview ? reusablePreviewIndex(pane) : -1;
  const tabs = [...pane.tabs];
  if (replacementIndex >= 0) {
    tabs[replacementIndex] = tab;
  } else {
    tabs.push(tab);
  }
  return activatePaneTab({ ...pane, tabs }, tab.id);
}
