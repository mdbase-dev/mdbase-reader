import type {
  WorkspacePaneId,
  WorkspaceSplitDirection,
  WorkspaceTabId,
  SourceWorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

/** Reader commands. Placement is implemented exclusively by the Dockview adapter. */
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
  readonly focusNextPane: () => void;
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
    toIndex?: number,
  ) => void;
  readonly resizeSplit: (ratio: number) => void;
  readonly setSplitDirection: (direction: WorkspaceSplitDirection) => void;
  readonly closeSplit: () => void;
  readonly closePane: (paneId: WorkspacePaneId) => void;
  readonly closePaneAndTabs: (paneId: WorkspacePaneId) => void;
  readonly moveAllTabs: (paneId: WorkspacePaneId) => void;
  readonly swapPanes: () => void;
}
