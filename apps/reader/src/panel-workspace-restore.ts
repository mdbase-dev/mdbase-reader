import { apply, emptyWorkspace, fromSnapshot, type WorkspaceState } from "@mdbase-dev/panels";

import {
  inspectorPanelId,
  navigatorPanelId,
  panelStorageKey,
  panelTab,
  sideOf,
  sidePanel,
  sidePanelIds,
  sideWidth,
  tabPanel,
  tabPanelKind,
  type WorkspaceStorage,
} from "./panel-workspace-state.js";
import { createLibraryWorkspaceTab, type WorkspaceTab } from "./source-workspace-layout.js";
import { sourcesForWorkspaceRestore } from "./workspace-restore-sources.js";

import type { WorkspaceNavigation } from "./workspace-navigation.js";
import type { SourceId } from "@mdbase-reader/core";

export interface RestoredWorkspace {
  readonly state: WorkspaceState;
  readonly focusedPanel: string | null;
  /** Nothing usable was saved, so the side panels start where they belong. */
  readonly fresh?: boolean;
}

interface RestoreOptions {
  readonly storage: WorkspaceStorage | null;
  readonly collection: string;
  readonly knownSources: ReadonlySet<SourceId>;
  readonly sourceIndexComplete: boolean;
  readonly navigation: WorkspaceNavigation;
}

/** A session id the workspace has not used yet; a reopened tab keeps its own. */
export function sessionId(tab: WorkspaceTab, taken: (id: string) => boolean): string {
  return tab.id.startsWith("reader:session:") && !taken(tab.id)
    ? tab.id
    : `reader:session:${crypto.randomUUID()}`;
}

/**
 * The saved workspace, or a new one when nothing readable was saved. Layouts from before this
 * format (Dockview's, and the two-pane one before it) are not read: they are simply left alone.
 */
export function restoreWorkspace(options: RestoreOptions): RestoredWorkspace {
  const { storage, collection, navigation } = options;
  try {
    const saved = storage?.getItem(panelStorageKey(collection));
    if (saved) {
      const known = sourcesForWorkspaceRestore(
        options.knownSources,
        saved,
        options.sourceIndexComplete,
      );
      const envelope = JSON.parse(saved) as {
        version?: unknown;
        workspace?: unknown;
        navigation?: unknown;
        focusedPanel?: unknown;
      };
      if (envelope.version === 1) {
        const state = withoutMissing(fromSnapshot(envelope.workspace), known);
        navigation.restore(envelope.navigation, known);
        const focused = envelope.focusedPanel;
        return {
          state,
          focusedPanel:
            typeof focused === "string" && panelTab(state.panels[focused]) ? focused : null,
        };
      }
    }
  } catch {
    // Storage is optional and a layout that cannot be read is not worth failing over.
  }
  return newWorkspace();
}

/** Tabs whose source no longer exists are closed before anything is shown. */
function withoutMissing(state: WorkspaceState, known: ReadonlySet<SourceId>): WorkspaceState {
  let next = state;
  for (const panel of Object.values(state.panels)) {
    const tab = panelTab(panel);
    // Only Reader's own panels come back: a tab, or a side panel of the kind its id names.
    const invalid =
      panel.kind === tabPanelKind
        ? !tab
        : !sidePanelIds.has(panel.id) || panel.kind !== sidePanel(panel.id).kind;
    if (invalid || (tab?.kind === "source" && !known.has(tab.sourceId))) {
      next = apply(next, { type: "remove", panel: panel.id });
    }
  }
  return next;
}

/** A pinned library tab, with panes that scroll as columns once there are too many to fit. */
function newWorkspace(): RestoredWorkspace {
  const tab = { ...createLibraryWorkspaceTab(), pinned: true };
  const id = sessionId(tab, () => false);
  let state = apply(emptyWorkspace(), { type: "add", panel: tabPanel({ ...tab, id }) });
  state = apply(state, { type: "setView", view: "columns" });
  return { state, focusedPanel: id, fresh: true };
}

/** Both side panels exist: the sources beside the workspace, the notes ready but closed. */
export function withSidePanels(state: WorkspaceState, fresh: boolean): WorkspaceState {
  let next = state;
  for (const id of [navigatorPanelId, inspectorPanelId]) {
    const side = sideOf(id);
    if (
      !next.panels[id] &&
      (fresh || id === inspectorPanelId) &&
      !next.edges[side]?.stack.panels.length
    ) {
      next = apply(next, {
        type: "batch",
        operations: [
          { type: "add", panel: sidePanel(id), target: { at: "edge", side }, activate: false },
          {
            type: "configureEdge",
            side,
            options: { size: sideWidth(id), min: 180, visible: id === navigatorPanelId },
          },
        ],
      });
    }
  }
  for (const side of ["left", "right"] as const) {
    if (next.edges[side]) {
      // Notes give way before sources when the window is too narrow for both.
      next = apply(next, {
        type: "configureEdge",
        side,
        options: { min: 180, priority: side === "left" ? 1 : 0 },
      });
    }
  }
  return next;
}
