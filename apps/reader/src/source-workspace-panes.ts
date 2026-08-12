import { activeTab, createPane, paneById } from "./source-workspace-layout.js";
import { closeWorkspaceTab } from "./source-workspace-tab-closing.js";
import {
  activatePaneTab,
  activateWorkspaceTab,
  openLibraryTab,
  openWorkspaceTab,
} from "./source-workspace-tabs.js";

import type {
  SourceWorkspaceLayout,
  WorkspacePaneId,
  WorkspaceSplitDirection,
  WorkspaceTab,
  WorkspaceTabId,
  SourceWorkspaceView,
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
  view: SourceWorkspaceView = "document",
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
  view: SourceWorkspaceView = "document",
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
  const opened = openTab(layout, tab, toPaneId);
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
  const focused = focusPane(layout, paneId);
  const split =
    tab.kind === "source"
      ? splitPane(focused, tab.sourceId, direction, tab.view)
      : openLibraryBeside(focused, tab.libraryViewId, tab.title, direction);
  return split.panes.length === 2 ? closeWorkspaceTab(split, tab.id, paneId) : split;
}

export function closeSecondaryPane(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  return mergeWorkspacePane(layout, "secondary");
}

/** Close one physical pane while preserving its tabs in the remaining pane. */
export function mergeWorkspacePane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  const closing = paneById(layout, paneId);
  const remaining = paneById(layout, otherPaneId(paneId));
  if (!closing || !remaining || layout.panes.length !== 2) {
    return layout;
  }
  const tabs = mergePaneTabs(remaining.tabs, closing.tabs);
  const desiredActive =
    layout.focusedPaneId === paneId ? closing.activeTabId : remaining.activeTabId;
  const primary = activateMergedPane({ ...remaining, id: "primary", tabs }, desiredActive);
  return {
    ...layout,
    panes: [primary],
    focusedPaneId: "primary",
    splitDirection: null,
    splitRatio: 0.5,
  };
}

/** Close a pane and its tabs. Callers own dirty-tab confirmation. */
export function discardWorkspacePane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  const pane = paneById(layout, paneId);
  if (!pane || layout.panes.length !== 2) {
    return layout;
  }
  const emptied = pane.tabs.reduceRight(
    (current, tab) => closeWorkspaceTab(current, tab.id, paneId),
    layout,
  );
  return mergeWorkspacePane(emptied, paneId);
}

/** Move a pane's complete working set without removing the empty workspace region. */
export function moveAllWorkspaceTabsToOtherPane(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  const source = paneById(layout, paneId);
  const destinationId = otherPaneId(paneId);
  const destination = paneById(layout, destinationId);
  if (!source || !destination || source.tabs.length === 0) {
    return layout;
  }
  const tabs = mergePaneTabs(destination.tabs, source.tabs);
  const nextDestination = activateMergedPane(
    { ...destination, tabs },
    source.activeTabId ?? destination.activeTabId,
  );
  return {
    ...layout,
    panes: layout.panes.map((pane) =>
      pane.id === paneId ? createPane(paneId) : pane.id === destinationId ? nextDestination : pane,
    ),
    focusedPaneId: destinationId,
  };
}

/** Exchange pane contents while keeping pane A and B in their physical positions. */
export function swapWorkspacePanes(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  const primary = paneById(layout, "primary");
  const secondary = paneById(layout, "secondary");
  if (!primary || !secondary) {
    return layout;
  }
  return {
    ...layout,
    panes: [
      { ...secondary, id: "primary" },
      { ...primary, id: "secondary" },
    ],
  };
}

export function focusNextWorkspacePane(layout: SourceWorkspaceLayout): SourceWorkspaceLayout {
  return layout.panes.length === 2 ? focusPane(layout, otherPaneId(layout.focusedPaneId)) : layout;
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

export function openLibraryBeside(
  layout: SourceWorkspaceLayout,
  libraryViewId: string,
  title: string,
  direction: WorkspaceSplitDirection = "horizontal",
): SourceWorkspaceLayout {
  const paneId = otherPaneId(layout.focusedPaneId);
  const split =
    layout.panes.length === 2
      ? focusPane(layout, paneId)
      : {
          ...layout,
          panes: [...layout.panes, createPane("secondary")],
          focusedPaneId: "secondary" as const,
          splitDirection: direction,
        };
  return openLibraryTab(split, libraryViewId, { paneId: split.focusedPaneId, title });
}

function openTab(
  layout: SourceWorkspaceLayout,
  tab: WorkspaceTab,
  paneId: WorkspacePaneId,
): SourceWorkspaceLayout {
  return tab.kind === "source"
    ? openWorkspaceTab(layout, tab.sourceId, {
        paneId,
        view: tab.view,
        pinned: tab.pinned,
      })
    : openLibraryTab(layout, tab.libraryViewId, {
        paneId,
        title: tab.title,
        pinned: tab.pinned,
      });
}

function mergePaneTabs(
  destination: readonly WorkspaceTab[],
  incoming: readonly WorkspaceTab[],
): readonly WorkspaceTab[] {
  const tabs = [...destination];
  for (const tab of incoming) {
    const index = tabs.findIndex(({ id }) => id === tab.id);
    if (index < 0) {
      tabs.push(tab);
      continue;
    }
    const existing = tabs[index];
    if (existing) {
      tabs[index] = {
        ...existing,
        pinned: existing.pinned || tab.pinned,
        dirty: existing.dirty || tab.dirty,
        preview: existing.preview && tab.preview && !existing.dirty && !tab.dirty,
      };
    }
  }
  return tabs;
}

function activateMergedPane(
  pane: ReturnType<typeof createPane>,
  desiredActive: WorkspaceTabId | null,
): ReturnType<typeof createPane> {
  const fallback = pane.tabs.find(({ id }) => id === desiredActive)?.id ?? pane.activeTabId;
  const active = pane.tabs.find(({ id }) => id === fallback)?.id ?? pane.tabs.at(-1)?.id ?? null;
  return active ? activatePaneTab(pane, active) : { ...pane, activeTabId: null };
}
