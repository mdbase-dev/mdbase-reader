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
  // Dockview panel IDs survive moves between groups; legacy IDs were pane-scoped.
  return tabId.startsWith("reader:session:")
    ? (tabId as WorkspaceSessionKey)
    : `${paneId}:${tabId}`;
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
        return retainedWorkspaceSessionKeys(layout, new Set(next ? [...retained, next] : retained));
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

/** Keep at most four visited document renderers, with active panes always protected. */
export function retainedWorkspaceSessionKeys(
  layout: SourceWorkspaceLayout,
  current: ReadonlySet<WorkspaceSessionKey>,
  budget = 4,
): ReadonlySet<WorkspaceSessionKey> {
  const active = new Set(activeSessionKeys(layout));
  const tabs = new Map(
    layout.panes.flatMap((pane) =>
      pane.tabs.map((tab) => [workspaceSessionKey(pane.id, tab.id), tab] as const),
    ),
  );
  const retained = new Set([...current].filter((key) => tabs.has(key)));
  // Set insertion order is the document LRU; focusing a pane makes it most recent.
  for (const key of active) {
    retained.delete(key);
    retained.add(key);
  }
  const documents = [...retained].filter((key) => {
    const tab = tabs.get(key);
    return tab?.kind === "source" && tab.view === "document";
  });
  const visibleDocuments = documents.filter((key) => active.has(key)).length;
  let excess = documents.length - Math.max(budget, visibleDocuments);
  for (const key of documents) {
    if (excess > 0 && !active.has(key)) {
      retained.delete(key);
      excess -= 1;
    }
  }
  return retained;
}

function activeSessionKeys(layout: SourceWorkspaceLayout): readonly WorkspaceSessionKey[] {
  return layout.panes.flatMap((pane) =>
    pane.activeTabId ? [workspaceSessionKey(pane.id, pane.activeTabId)] : [],
  );
}
