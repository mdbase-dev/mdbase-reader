import { useCallback, useEffect, useMemo, useState } from "react";

import { createSourceWorkspaceActions } from "./source-workspace-controller.js";
import { activeTab, focusedPane, sourceIdsInWorkspace } from "./source-workspace-layout.js";
import { persistSourceWorkspace, restoreSourceWorkspace } from "./source-workspace-persistence.js";

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
  readonly layout: SourceWorkspaceLayout;
  readonly activePane: SourceWorkspacePane;
  readonly activeTab: WorkspaceTab | null;
  readonly activeSourceId: SourceId | null;
  readonly openSourceIds: readonly SourceId[];
}

export function useSourceWorkspace(options: SourceWorkspaceOptions): SourceWorkspaceController {
  const { collectionKey, confirmDiscard, selectSource, selectedSourceId, sourceIds } = options;
  const knownSourceIds = useMemo(() => new Set(sourceIds), [sourceIds]);
  const [layout, setLayout] = useState(() =>
    restoreSourceWorkspace(browserStorage(), collectionKey, knownSourceIds, selectedSourceId),
  );
  useEffect(() => {
    persistSourceWorkspace(browserStorage(), collectionKey, layout);
  }, [collectionKey, layout]);

  useEffect(() => {
    selectSource(activeTab(focusedPane(layout))?.sourceId ?? null);
  }, [layout, selectSource]);

  const commit = useCallback(
    (update: (current: SourceWorkspaceLayout) => SourceWorkspaceLayout): void => {
      setLayout(update);
    },
    [],
  );
  const canClose = useCallback(
    (tab: WorkspaceTab | undefined): boolean => !tab?.dirty || confirmDiscard?.(tab) === true,
    [confirmDiscard],
  );
  const actions = useMemo(
    () => createSourceWorkspaceActions({ current: () => layout, commit, canClose }),
    [canClose, commit, layout],
  );
  const activePane = focusedPane(layout);
  const currentTab = activeTab(activePane);
  return {
    layout,
    activePane,
    activeTab: currentTab,
    activeSourceId: currentTab?.sourceId ?? null,
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
