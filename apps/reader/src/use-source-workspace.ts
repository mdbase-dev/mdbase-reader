import { useCallback, useEffect, useMemo, useState } from "react";

import { createSourceWorkspaceActions } from "./source-workspace-controller.js";
import {
  activeTab,
  focusedPane,
  sourceIdsInWorkspace,
  workspaceTabSourceId,
} from "./source-workspace-layout.js";
import { persistSourceWorkspace, restoreSourceWorkspace } from "./source-workspace-persistence.js";
import { openLibraryTab } from "./source-workspace-tabs.js";

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
  const { collectionKey, confirmDiscard, selectSource, sourceIds } = options;
  const knownSourceIds = useMemo(() => new Set(sourceIds), [sourceIds]);
  const [layout, setLayout] = useState(() => initialWorkspace(collectionKey, knownSourceIds));
  useEffect(() => {
    persistSourceWorkspace(browserStorage(), collectionKey, layout);
  }, [collectionKey, layout]);

  useEffect(() => {
    const sourceId = workspaceTabSourceId(activeTab(focusedPane(layout)));
    // A collection-level library tab must not discard the source that a preview
    // or an adjacent research tool is still using.
    if (sourceId) {
      selectSource(sourceId);
    }
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
    activeSourceId: workspaceTabSourceId(currentTab),
    openSourceIds: sourceIdsInWorkspace(layout),
    ...actions,
  };
}

function initialWorkspace(
  collectionKey: string,
  knownSourceIds: ReadonlySet<SourceId>,
): SourceWorkspaceLayout {
  const restored = restoreSourceWorkspace(browserStorage(), collectionKey, knownSourceIds, null);
  return restored.panes.some(({ tabs }) => tabs.length > 0)
    ? restored
    : openLibraryTab(restored, "all-sources", { title: "Library", pinned: true });
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
