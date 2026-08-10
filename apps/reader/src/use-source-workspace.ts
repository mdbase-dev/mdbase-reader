import { useCallback, useRef, useState } from "react";

import {
  createSourceWorkspaceLayout,
  focusedPane,
  sourceIdsInWorkspace,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";
import { closeSource } from "./source-workspace-tab-closing.js";
import { activateSource, openSource } from "./source-workspace-tabs.js";

import type { SourceId } from "@mdbase-reader/core";

export interface SourceWorkspaceController {
  readonly layout: SourceWorkspaceLayout;
  readonly activeSourceId: SourceId | null;
  readonly openSourceIds: readonly SourceId[];
  readonly open: (sourceId: SourceId) => void;
  readonly activate: (sourceId: SourceId) => void;
  readonly close: (sourceId: SourceId) => void;
}

export function useSourceWorkspace(
  selectedSourceId: SourceId | null,
  selectSource: (sourceId: SourceId | null) => void,
): SourceWorkspaceController {
  const [layout, setLayout] = useState(() => createSourceWorkspaceLayout(selectedSourceId));
  const layoutRef = useRef(layout);

  const commit = useCallback(
    (next: SourceWorkspaceLayout): void => {
      layoutRef.current = next;
      setLayout(next);
      selectSource(
        focusedPane(next).tabs.find(({ id }) => id === focusedPane(next).activeTabId)?.sourceId ??
          null,
      );
    },
    [selectSource],
  );
  const open = useCallback(
    (sourceId: SourceId): void => commit(openSource(layoutRef.current, sourceId)),
    [commit],
  );
  const activate = useCallback(
    (sourceId: SourceId): void => commit(activateSource(layoutRef.current, sourceId)),
    [commit],
  );
  const close = useCallback(
    (sourceId: SourceId): void => commit(closeSource(layoutRef.current, sourceId)),
    [commit],
  );
  const current = focusedPane(layout);
  return {
    layout,
    activeSourceId: current.tabs.find(({ id }) => id === current.activeTabId)?.sourceId ?? null,
    openSourceIds: sourceIdsInWorkspace(layout),
    open,
    activate,
    close,
  };
}
