import { useEffect, useState } from "react";

import type {
  SourceWorkspaceLayout,
  WorkspacePaneId,
  WorkspaceTabId,
} from "./source-workspace-layout.js";

export type WorkspaceSessionKey = `${WorkspacePaneId}:${WorkspaceTabId}`;

export function workspaceSessionKey(
  paneId: WorkspacePaneId,
  tabId: WorkspaceTabId,
): WorkspaceSessionKey {
  return `${paneId}:${tabId}`;
}

export function useProgressiveWorkspaceTabs(
  layout: SourceWorkspaceLayout,
): ReadonlySet<WorkspaceSessionKey> {
  const [hydrated, setHydrated] = useState<ReadonlySet<WorkspaceSessionKey>>(
    () => new Set(activeSessionKeys(layout)),
  );
  useEffect(() => {
    const available = new Set(
      layout.panes.flatMap((pane) => pane.tabs.map((tab) => workspaceSessionKey(pane.id, tab.id))),
    );
    const queue = [...progressiveWorkspaceSessionKeys(layout)];
    let cancelled = false;
    const hydrateNext = (): void => {
      if (cancelled) {
        return;
      }
      const next = queue.shift();
      setHydrated((current) => {
        const retained = [...current].filter((key) => available.has(key));
        return new Set(next ? [...retained, next] : retained);
      });
      if (queue.length > 0) {
        globalThis.setTimeout(hydrateNext, 45);
      }
    };
    const timer = globalThis.setTimeout(hydrateNext, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [layout]);
  return hydrated;
}

/**
 * Restore active documents and lightweight workspace tabs. Inactive documents
 * stay dormant until the user activates them so restoring a large workspace
 * does not start every file transfer at once.
 */
export function progressiveWorkspaceSessionKeys(
  layout: SourceWorkspaceLayout,
): readonly WorkspaceSessionKey[] {
  const active = activeSessionKeys(layout);
  const lightweight = layout.panes.flatMap((pane) =>
    pane.tabs.flatMap((tab) =>
      tab.kind === "library" || tab.view !== "document"
        ? [workspaceSessionKey(pane.id, tab.id)]
        : [],
    ),
  );
  return [...new Set([...active, ...lightweight])];
}

function activeSessionKeys(layout: SourceWorkspaceLayout): readonly WorkspaceSessionKey[] {
  return layout.panes.flatMap((pane) =>
    pane.activeTabId ? [workspaceSessionKey(pane.id, pane.activeTabId)] : [],
  );
}
