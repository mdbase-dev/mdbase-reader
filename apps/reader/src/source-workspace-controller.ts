import { navigateWorkspaceHistory } from "./source-workspace-history.js";
import { focusedPane, paneById } from "./source-workspace-layout.js";
import {
  closeSecondaryPane,
  focusPane,
  moveWorkspaceTabToPane,
  openLibraryBeside,
  openBeside,
  resizeWorkspaceSplit,
  setWorkspaceSplitDirection,
  splitWorkspaceTab,
} from "./source-workspace-panes.js";
import {
  closeOtherWorkspaceTabs,
  closeSource,
  closeWorkspaceTab,
  closeWorkspaceTabsToRight,
  reopenClosedWorkspaceTab,
} from "./source-workspace-tab-closing.js";
import {
  activateWorkspaceTab,
  openLibraryTab,
  openSource,
  openWorkspaceTab,
  previewSource,
  promoteWorkspaceTab,
  reorderWorkspaceTab,
  setWorkspaceTabDirty,
  setWorkspaceTabPinned,
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

export interface SourceWorkspaceActions {
  readonly preview: (sourceId: SourceId, paneId?: WorkspacePaneId) => void;
  readonly open: (sourceId: SourceId, paneId?: WorkspacePaneId) => void;
  readonly openView: (
    sourceId: SourceId,
    view: SourceWorkspaceView,
    paneId?: WorkspacePaneId,
  ) => void;
  readonly openLibrary: (libraryViewId?: string, title?: string, paneId?: WorkspacePaneId) => void;
  readonly openLibraryBeside: (
    libraryViewId: string,
    title: string,
    direction?: WorkspaceSplitDirection,
  ) => void;
  readonly activateTab: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void;
  readonly activate: (sourceId: SourceId) => void;
  readonly promote: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void;
  readonly pin: (tabId: WorkspaceTabId, paneId: WorkspacePaneId, pinned: boolean) => void;
  readonly markDirty: (tabId: WorkspaceTabId, paneId: WorkspacePaneId, dirty: boolean) => void;
  readonly close: (sourceId: SourceId) => void;
  readonly closeTab: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void;
  readonly closeOthers: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void;
  readonly closeToRight: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void;
  readonly reopenClosed: () => void;
  readonly reorder: (paneId: WorkspacePaneId, fromIndex: number, toIndex: number) => void;
  readonly navigate: (direction: -1 | 1, paneId?: WorkspacePaneId) => void;
  readonly switchRelative: (direction: -1 | 1) => void;
  readonly focus: (paneId: WorkspacePaneId) => void;
  readonly openBeside: (
    sourceId: SourceId,
    view?: SourceWorkspaceView,
    direction?: WorkspaceSplitDirection,
  ) => void;
  readonly splitTab: (
    tabId: WorkspaceTabId,
    paneId: WorkspacePaneId,
    direction: WorkspaceSplitDirection,
  ) => void;
  readonly moveTab: (
    tabId: WorkspaceTabId,
    fromPaneId: WorkspacePaneId,
    toPaneId: WorkspacePaneId,
  ) => void;
  readonly resizeSplit: (ratio: number) => void;
  readonly setSplitDirection: (direction: WorkspaceSplitDirection) => void;
  readonly closeSplit: () => void;
}

export interface WorkspaceActionContext {
  readonly current: () => SourceWorkspaceLayout;
  readonly commit: (update: (layout: SourceWorkspaceLayout) => SourceWorkspaceLayout) => void;
  readonly canClose: (tab: WorkspaceTab | undefined) => boolean;
}

export function createSourceWorkspaceActions({
  current,
  commit,
  canClose,
}: WorkspaceActionContext): SourceWorkspaceActions {
  const activateTab = (tabId: WorkspaceTabId, paneId: WorkspacePaneId): void => {
    commit((layout) => activateWorkspaceTab(layout, tabId, paneId));
  };
  return {
    preview: (sourceId, paneId) => commit((layout) => previewSource(layout, sourceId, paneId)),
    open: (sourceId, paneId) => commit((layout) => openSource(layout, sourceId, paneId)),
    openView: (sourceId, view, paneId) =>
      commit((layout) => openWorkspaceTab(layout, sourceId, paneId ? { paneId, view } : { view })),
    openLibrary: (libraryViewId = "all-sources", title = "Library", paneId) =>
      commit((layout) =>
        openLibraryTab(layout, libraryViewId, paneId ? { paneId, title } : { title }),
      ),
    openLibraryBeside: (libraryViewId, title, direction = "horizontal") =>
      commit((layout) => openLibraryBeside(layout, libraryViewId, title, direction)),
    activateTab,
    activate: (sourceId) => activateSourceTab(current(), sourceId, activateTab),
    promote: (tabId, paneId) => commit((layout) => promoteWorkspaceTab(layout, tabId, paneId)),
    pin: (tabId, paneId, pinned) =>
      commit((layout) => setWorkspaceTabPinned(layout, tabId, pinned, paneId)),
    markDirty: (tabId, paneId, dirty) =>
      commit((layout) => setWorkspaceTabDirty(layout, tabId, dirty, paneId)),
    close: (sourceId) => closeActiveSource(current(), sourceId, canClose, commit),
    closeTab: (tabId, paneId) => closeTab(current(), tabId, paneId, canClose, commit),
    closeOthers: (tabId, paneId) =>
      closeMany(
        current(),
        paneId,
        (tab) => tab.id !== tabId && !tab.pinned,
        canClose,
        () => commit((layout) => closeOtherWorkspaceTabs(layout, tabId, paneId)),
      ),
    closeToRight: (tabId, paneId) => closeTabsToRight(current(), tabId, paneId, canClose, commit),
    reopenClosed: () => commit(reopenClosedWorkspaceTab),
    reorder: (paneId, fromIndex, toIndex) =>
      commit((layout) => reorderWorkspaceTab(layout, paneId, fromIndex, toIndex)),
    navigate: (direction, paneId) =>
      commit((layout) => navigateWorkspaceHistory(layout, direction, paneId)),
    switchRelative: (direction) => commit((layout) => switchRelativeTab(layout, direction)),
    focus: (paneId) => commit((layout) => focusPane(layout, paneId)),
    openBeside: (sourceId, view = "document", direction = "horizontal") =>
      commit((layout) => openBeside(layout, sourceId, view, direction)),
    splitTab: (tabId, paneId, direction) =>
      commit((layout) => splitWorkspaceTab(layout, tabId, paneId, direction)),
    moveTab: (tabId, fromPaneId, toPaneId) =>
      commit((layout) => moveWorkspaceTabToPane(layout, tabId, fromPaneId, toPaneId)),
    resizeSplit: (ratio) => commit((layout) => resizeWorkspaceSplit(layout, ratio)),
    setSplitDirection: (direction) =>
      commit((layout) => setWorkspaceSplitDirection(layout, direction)),
    closeSplit: () => commit(closeSecondaryPane),
  };
}

function activateSourceTab(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  activate: (tabId: WorkspaceTabId, paneId: WorkspacePaneId) => void,
): void {
  const location = layout.panes
    .flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })))
    .find(({ tab }) => tab.kind === "source" && tab.sourceId === sourceId);
  if (location) {
    activate(location.tab.id, location.pane.id);
  }
}

function closeActiveSource(
  layout: SourceWorkspaceLayout,
  sourceId: SourceId,
  canClose: WorkspaceActionContext["canClose"],
  commit: WorkspaceActionContext["commit"],
): void {
  const pane = focusedPane(layout);
  const tab = pane.tabs.find(
    (candidate) => candidate.kind === "source" && candidate.sourceId === sourceId,
  );
  if (canClose(tab)) {
    commit((current) => closeSource(current, sourceId, pane.id));
  }
}

function closeTab(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId,
  canClose: WorkspaceActionContext["canClose"],
  commit: WorkspaceActionContext["commit"],
): void {
  const tab = paneById(layout, paneId)?.tabs.find(({ id }) => id === tabId);
  if (canClose(tab)) {
    commit((current) => closeWorkspaceTab(current, tabId, paneId));
  }
}

function switchRelativeTab(
  layout: SourceWorkspaceLayout,
  direction: -1 | 1,
): SourceWorkspaceLayout {
  const pane = focusedPane(layout);
  const index = pane.tabs.findIndex(({ id }) => id === pane.activeTabId);
  if (index < 0 || pane.tabs.length < 2) {
    return layout;
  }
  const destination = pane.tabs[(index + direction + pane.tabs.length) % pane.tabs.length];
  return destination ? activateWorkspaceTab(layout, destination.id, pane.id) : layout;
}

function closeTabsToRight(
  layout: SourceWorkspaceLayout,
  tabId: WorkspaceTabId,
  paneId: WorkspacePaneId,
  canClose: WorkspaceActionContext["canClose"],
  commit: WorkspaceActionContext["commit"],
): void {
  const tabs = paneById(layout, paneId)?.tabs ?? [];
  const index = tabs.findIndex(({ id }) => id === tabId);
  closeMany(
    layout,
    paneId,
    (tab, candidateIndex) => candidateIndex > index && !tab.pinned,
    canClose,
    () => commit((current) => closeWorkspaceTabsToRight(current, tabId, paneId)),
  );
}

function closeMany(
  layout: SourceWorkspaceLayout,
  paneId: WorkspacePaneId,
  predicate: (tab: WorkspaceTab, index: number) => boolean,
  canClose: WorkspaceActionContext["canClose"],
  close: () => void,
): void {
  const closing = (paneById(layout, paneId)?.tabs ?? []).filter(predicate);
  if (closing.every(canClose)) {
    close();
  }
}
