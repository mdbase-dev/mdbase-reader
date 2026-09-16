import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { dockWorkspaceActions } from "./dockview-workspace-actions.js";
import { ReaderDockWorkspace } from "./dockview-workspace.js";
import {
  activeTab,
  focusedPane,
  sourceIdsInWorkspace,
  workspaceTabSourceId,
} from "./source-workspace-layout.js";

import type { SourceWorkspaceActions } from "./source-workspace-controller.js";
import type {
  SourceWorkspaceLayout,
  SourceWorkspacePane,
  WorkspaceTab,
} from "./source-workspace-layout.js";
import type { SourceId } from "@mdbase-reader/core";

export interface SourceWorkspaceOptions {
  readonly selectedSourceId: SourceId | null;
  readonly sourceIds: readonly SourceId[];
  readonly collectionKey: string;
  readonly selectSource: (sourceId: SourceId | null) => void;
  readonly confirmDiscard?: (tab: WorkspaceTab) => boolean;
}
export interface SourceWorkspaceController extends SourceWorkspaceActions {
  readonly dock: ReaderDockWorkspace;
  readonly layout: SourceWorkspaceLayout;
  readonly activePane: SourceWorkspacePane;
  readonly activeTab: WorkspaceTab | null;
  readonly activeSourceId: SourceId | null;
  readonly openSourceIds: readonly SourceId[];
}
export function useSourceWorkspace(options: SourceWorkspaceOptions): SourceWorkspaceController {
  const [dock] = useState(
    () =>
      new ReaderDockWorkspace(options.collectionKey, browserStorage(), new Set(options.sourceIds)),
  );
  const { confirmDiscard, selectSource } = options;
  useEffect(() => {
    dock.setCloseGuard(confirmDiscard ?? (() => false));
  }, [dock, confirmDiscard]);
  const layout = useSyncExternalStore(dock.subscribe, dock.getSnapshot, dock.getSnapshot);
  const pane = focusedPane(layout);
  const tab = activeTab(pane);
  const sourceId = workspaceTabSourceId(tab);
  useEffect(() => {
    if (sourceId) {
      selectSource(sourceId);
    }
  }, [sourceId, selectSource]);
  const actions = useMemo(() => dockWorkspaceActions(dock), [dock]);
  return {
    dock,
    layout,
    activePane: pane,
    activeTab: tab,
    activeSourceId: sourceId,
    openSourceIds: sourceIdsInWorkspace(layout),
    ...actions,
  };
}
function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
