import type {
  WorkspacePaneId,
  WorkspaceSplitDirection,
  WorkspaceTabId,
  SourceWorkspaceView,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

/** Reader commands. Placement is implemented exclusively by the panel workspace. */
export interface SourceWorkspaceActions {
  readonly preview: (sourceId: SourceId, paneId?: WorkspacePaneId) => void;
  readonly open: (sourceId: SourceId, paneId?: WorkspacePaneId) => void;
  /**
   * Go to one of a source's views. Its note, annotations and citation are the Notes panels, so
   * those open the source and show the matching panel; a phone shows them in the source's tab.
   */
  readonly openView: (
    sourceId: SourceId,
    view: SourceWorkspaceView,
    paneId?: WorkspacePaneId,
  ) => void;
  readonly openLibrary: (libraryViewId?: string, title?: string, paneId?: WorkspacePaneId) => void;
  /** A library view in a tab of its own, whatever the library tab in use is showing. */
  readonly openLibraryTab: (libraryViewId: string, title: string) => void;
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
  readonly reopenClosed: () => void;
  readonly navigate: (direction: -1 | 1, paneId?: WorkspacePaneId) => void;
  readonly switchRelative: (direction: -1 | 1) => void;
  readonly focus: (paneId: WorkspacePaneId) => void;
  readonly focusNextPane: () => void;
  readonly openBeside: (sourceId: SourceId, direction?: WorkspaceSplitDirection) => void;
  readonly closePane: (paneId: WorkspacePaneId) => void;
}
