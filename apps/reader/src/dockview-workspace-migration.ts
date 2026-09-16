import { addDockTab } from "./dockview-tab-commands.js";
import {
  navigatorPanelId,
  dockStorageKey,
  parseDockState,
  panelTab,
} from "./dockview-workspace-state.js";
import {
  createLibraryWorkspaceTab,
  type SourceWorkspaceLayout,
} from "./source-workspace-layout.js";
import { restoreSourceWorkspace, type WorkspaceStorage } from "./source-workspace-persistence.js";

import type { DockviewNavigation } from "./dockview-navigation.js";
import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { SourceId } from "@mdbase-reader/core";
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from "dockview-react";

export function restoreDockWorkspace(
  dock: ReaderDockWorkspace,
  navigation: DockviewNavigation,
  storage: WorkspaceStorage | null,
  collection: string,
  knownSources: ReadonlySet<SourceId>,
): { readonly recentSourceIds: readonly SourceId[]; readonly focusedPanel: string | null } | null {
  const api = dock.api;
  if (!api) {
    return null;
  }
  let saved: string | null = null;
  try {
    saved = storage?.getItem(dockStorageKey(collection)) ?? null;
    if (saved) {
      const parsed = parseDockState(saved, knownSources);
      preservePreEdgeLayout(storage, collection, saved);
      dock.seedDesktop(parsed);
      api.fromJSON(parsed);
      for (const panel of [...api.panels]) {
        if (panel.params?.["missing"]) {
          api.removePanel(panel);
        }
      }
      const metadata = JSON.parse(saved) as { navigation?: unknown; focusedPanel?: unknown };
      navigation.restore(metadata.navigation, knownSources);
      return {
        recentSourceIds: navigation.recentSourceIds,
        focusedPanel: restoredFocus(api, metadata.focusedPanel),
      };
    }
  } catch {
    // Keep one recovery copy rather than silently destroying a malformed layout.
    try {
      if (saved) {
        storage?.setItem(`${dockStorageKey(collection)}:recovery`, saved);
      }
    } catch {
      /* Storage is optional. */
    }
    api.clear();
  }
  const legacy = restoreSourceWorkspace(storage, collection, knownSources, null);
  migrateDockWorkspace(dock, legacy);
  navigation.restoreLegacy(legacy);
  return {
    recentSourceIds: navigation.recentSourceIds,
    focusedPanel: panelTab(api.activePanel)?.id ?? null,
  };
}

function preservePreEdgeLayout(
  storage: WorkspaceStorage | null,
  collection: string,
  saved: string,
): void {
  const envelope = JSON.parse(saved) as { version?: number };
  if (envelope.version !== 1) {
    return;
  }
  try {
    const key = `${dockStorageKey(collection)}:before-edges`;
    if (!storage?.getItem(key)) {
      storage?.setItem(key, saved);
    }
  } catch {
    /* Migration must work even if optional backup storage is full. */
  }
}

function restoredFocus(api: DockviewApi, id: unknown): string | null {
  return typeof id === "string" ? (panelTab(api.getPanel(id))?.id ?? null) : null;
}

/** Import v2 once. Keep the legacy storage entry intact for rollback. */
export function migrateDockWorkspace(
  dock: ReaderDockWorkspace,
  legacy: SourceWorkspaceLayout,
): void {
  const api = dock.api;
  if (!api) {
    return;
  }
  let first: DockviewGroupPanel | undefined;
  let focused: IDockviewPanel | undefined;
  const activePanels: IDockviewPanel[] = [];
  for (const pane of legacy.panes) {
    let group: DockviewGroupPanel | undefined;
    for (const tab of pane.tabs) {
      const panel = addDockTab(
        api,
        tab,
        group ?? first,
        !group && first ? (legacy.splitDirection ?? "horizontal") : undefined,
      );
      group = panel.group;
      first ??= group;
      if (tab.id === pane.activeTabId) {
        activePanels.push(panel);
        if (pane.id === legacy.focusedPaneId) {
          focused = panel;
        }
      }
    }
  }
  if (!dock.contentPanels().length) {
    addDockTab(api, { ...createLibraryWorkspaceTab(), pinned: true });
  }
  dock.setSideVisible(navigatorPanelId, true, false);
  for (const panel of activePanels) {
    panel.api.setActive();
  }
  focused?.api.setActive();
}
