import type { SourceId } from "@mdbase-reader/core";

export const workspaceViews = ["document", "note", "annotations", "citation"] as const;
export type WorkspaceView = (typeof workspaceViews)[number];
export type WorkspacePaneId = "primary" | "secondary";
export type WorkspaceSplitDirection = "horizontal" | "vertical";
export type WorkspaceTabId = `${string}::${WorkspaceView}`;

export interface WorkspaceTab {
  readonly id: WorkspaceTabId;
  readonly sourceId: SourceId;
  readonly view: WorkspaceView;
  readonly preview: boolean;
  readonly pinned: boolean;
  readonly dirty: boolean;
}

export interface WorkspaceLocation {
  readonly sourceId: SourceId;
  readonly view: WorkspaceView;
}

export interface WorkspaceHistory {
  readonly entries: readonly WorkspaceLocation[];
  readonly index: number;
}

export interface SourceWorkspacePane {
  readonly id: WorkspacePaneId;
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: WorkspaceTabId | null;
  readonly history: WorkspaceHistory;
}

export interface ClosedWorkspaceTab {
  readonly paneId: WorkspacePaneId;
  readonly tab: WorkspaceTab;
  readonly index: number;
}

export interface SourceWorkspaceLayout {
  readonly version: 2;
  readonly panes: readonly SourceWorkspacePane[];
  readonly focusedPaneId: WorkspacePaneId;
  readonly splitDirection: WorkspaceSplitDirection | null;
  readonly splitRatio: number;
  readonly recentlyClosed: readonly ClosedWorkspaceTab[];
  readonly recentSourceIds: readonly SourceId[];
}

export function createSourceWorkspaceLayout(sourceId: SourceId | null): SourceWorkspaceLayout {
  const initialTab = sourceId ? createWorkspaceTab(sourceId, "document", true) : null;
  return {
    version: 2,
    panes: [createPane("primary", initialTab)],
    focusedPaneId: "primary",
    splitDirection: null,
    splitRatio: 0.5,
    recentlyClosed: [],
    recentSourceIds: sourceId ? [sourceId] : [],
  };
}

export function createPane(
  id: WorkspacePaneId,
  initialTab: WorkspaceTab | null = null,
): SourceWorkspacePane {
  return {
    id,
    tabs: initialTab ? [initialTab] : [],
    activeTabId: initialTab?.id ?? null,
    history: initialTab
      ? { entries: [tabLocation(initialTab)], index: 0 }
      : { entries: [], index: -1 },
  };
}

export function createWorkspaceTab(
  sourceId: SourceId,
  view: WorkspaceView = "document",
  preview = false,
): WorkspaceTab {
  return {
    id: workspaceTabId(sourceId, view),
    sourceId,
    view,
    preview,
    pinned: false,
    dirty: false,
  };
}

export function workspaceTabId(sourceId: SourceId, view: WorkspaceView): WorkspaceTabId {
  return `${sourceId}::${view}`;
}

export function focusedPane(layout: SourceWorkspaceLayout): SourceWorkspacePane {
  return paneById(layout, layout.focusedPaneId) ?? layout.panes[0] ?? createPane("primary");
}

export function paneById(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspacePane | null {
  return layout.panes.find(({ id }) => id === paneId) ?? null;
}

export function activeTab(pane: SourceWorkspacePane): WorkspaceTab | null {
  return pane.tabs.find(({ id }) => id === pane.activeTabId) ?? null;
}

export function activeWorkspaceTab(layout: SourceWorkspaceLayout): WorkspaceTab | null {
  return activeTab(focusedPane(layout));
}

export function tabLocation(tab: WorkspaceTab): WorkspaceLocation {
  return { sourceId: tab.sourceId, view: tab.view };
}

export function allWorkspaceTabs(layout: SourceWorkspaceLayout): readonly WorkspaceTab[] {
  return layout.panes.flatMap(({ tabs }) => tabs);
}

export function sourceIdsInWorkspace(layout: SourceWorkspaceLayout): readonly SourceId[] {
  return [...new Set(allWorkspaceTabs(layout).map(({ sourceId }) => sourceId))];
}

export function updatePane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  update: (pane: SourceWorkspacePane) => SourceWorkspacePane,
): SourceWorkspaceLayout {
  if (!layout.panes.some(({ id }) => id === paneId)) {
    return layout;
  }
  return {
    ...layout,
    panes: layout.panes.map((current) => (current.id === paneId ? update(current) : current)),
    focusedPaneId: paneId,
  };
}
