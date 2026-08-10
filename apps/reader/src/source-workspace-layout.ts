import type { SourceId } from "@mdbase-reader/core";

export const sourceWorkspaceViews = ["document", "note", "annotations", "citation"] as const;
export type SourceWorkspaceView = (typeof sourceWorkspaceViews)[number];
export const workspaceViews = ["library", ...sourceWorkspaceViews] as const;
export type WorkspaceView = (typeof workspaceViews)[number];
export type WorkspacePaneId = "primary" | "secondary";
export type WorkspaceSplitDirection = "horizontal" | "vertical";
export type WorkspaceTabId = string;

interface WorkspaceTabBase {
  readonly id: WorkspaceTabId;
  readonly preview: boolean;
  readonly pinned: boolean;
  readonly dirty: boolean;
}

export interface SourceWorkspaceTab extends WorkspaceTabBase {
  readonly kind: "source";
  readonly sourceId: SourceId;
  readonly libraryViewId?: undefined;
  readonly title?: undefined;
  readonly view: SourceWorkspaceView;
}

export interface LibraryWorkspaceTab extends WorkspaceTabBase {
  readonly kind: "library";
  readonly sourceId?: undefined;
  readonly view: "library";
  /** `all-sources` is Reader's unsaved default; saved views use `path::viewId`. */
  readonly libraryViewId: string;
  readonly title: string;
}

export type WorkspaceTab = SourceWorkspaceTab | LibraryWorkspaceTab;

export interface SourceWorkspaceLocation {
  readonly kind: "source";
  readonly sourceId: SourceId;
  readonly view: SourceWorkspaceView;
}

export interface LibraryWorkspaceLocation {
  readonly kind: "library";
  readonly libraryViewId: string;
  readonly title: string;
}

export type WorkspaceLocation = SourceWorkspaceLocation | LibraryWorkspaceLocation;

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
  view: SourceWorkspaceView = "document",
  preview = false,
): SourceWorkspaceTab {
  return {
    kind: "source",
    id: workspaceTabId(sourceId, view),
    sourceId,
    view,
    preview,
    pinned: false,
    dirty: false,
  };
}

export function createLibraryWorkspaceTab(
  libraryViewId = "all-sources",
  title = "Library",
  preview = false,
): LibraryWorkspaceTab {
  return {
    kind: "library",
    id: libraryWorkspaceTabId(libraryViewId),
    libraryViewId,
    title,
    view: "library",
    preview,
    pinned: false,
    dirty: false,
  };
}

export function workspaceTabId(sourceId: SourceId, view: SourceWorkspaceView): WorkspaceTabId {
  return `${sourceId}::${view}`;
}

export function libraryWorkspaceTabId(libraryViewId: string): WorkspaceTabId {
  return `library::${libraryViewId}`;
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
  return tab.kind === "source"
    ? { kind: "source", sourceId: tab.sourceId, view: tab.view }
    : {
        kind: "library",
        libraryViewId: tab.libraryViewId,
        title: tab.title,
      };
}

export function allWorkspaceTabs(layout: SourceWorkspaceLayout): readonly WorkspaceTab[] {
  return layout.panes.flatMap(({ tabs }) => tabs);
}

export function sourceIdsInWorkspace(layout: SourceWorkspaceLayout): readonly SourceId[] {
  return [
    ...new Set(
      allWorkspaceTabs(layout).flatMap((tab) => (tab.kind === "source" ? [tab.sourceId] : [])),
    ),
  ];
}

export function workspaceTabSourceId(tab: WorkspaceTab | null | undefined): SourceId | null {
  return tab?.kind === "source" ? tab.sourceId : null;
}

export function updatePane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  update: (pane: SourceWorkspacePane) => SourceWorkspacePane,
): SourceWorkspaceLayout {
  const current = paneById(layout, paneId);
  if (!current) {
    return layout;
  }
  const next = update(current);
  if (next === current && layout.focusedPaneId === paneId) {
    return layout;
  }
  return {
    ...layout,
    panes: layout.panes.map((pane) => (pane.id === paneId ? next : pane)),
    focusedPaneId: paneId,
  };
}
