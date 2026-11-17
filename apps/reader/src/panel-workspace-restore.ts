import { apply, emptyWorkspace, fromSnapshot, type WorkspaceState } from "@mdbase-dev/panels";

import {
  isSidePanel,
  navigatorPanel,
  navigatorPanelId,
  navigatorPanelKind,
  navigatorWidth,
  notesPanel,
  notesPanels,
  notesWidth,
  panelStorageKey,
  panelTab,
  tabPanel,
  tabPanelKind,
  type WorkspaceStorage,
} from "./panel-workspace-state.js";
import {
  createLibraryWorkspaceTab,
  notesViews,
  type WorkspaceTab,
} from "./source-workspace-layout.js";
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
    // Only Reader's own panels come back: a tab, Sources under its own id, or a Notes panel.
    const invalid =
      panel.kind === tabPanelKind
        ? !tab
        : !isSidePanel(panel) ||
          (panel.kind === navigatorPanelKind) !== (panel.id === navigatorPanelId);
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

/** Sources beside a new workspace, and the Notes panels ready at the right but closed. */
export function withSidePanels(state: WorkspaceState, fresh: boolean): WorkspaceState {
  let next = state;
  if (fresh && !next.panels[navigatorPanelId] && !next.edges.left?.stack.panels.length) {
    next = apply(next, {
      type: "batch",
      operations: [
        {
          type: "add",
          panel: navigatorPanel(),
          target: { at: "edge", side: "left" },
          activate: false,
        },
        { type: "configureEdge", side: "left", options: { size: navigatorWidth, visible: true } },
      ],
    });
  }
  // A workspace with no Notes panel at all predates them, or is new: closing the last one in
  // the right region only closes the region.
  if (!notesPanels(next).length && !next.edges.right?.stack.panels.length) {
    next = apply(next, {
      type: "batch",
      operations: [
        ...notesViews.map((view) => ({
          type: "add" as const,
          panel: notesPanel(view),
          target: { at: "edge" as const, side: "right" as const },
          activate: false,
        })),
        { type: "configureEdge", side: "right", options: { size: notesWidth, visible: false } },
      ],
    });
  }
  for (const panel of Object.values(next.panels)) {
    // Workspaces saved before panels could follow have side panels that would lead.
    if (isSidePanel(panel) && panel.leads !== false) {
      next = apply(next, { type: "update", panel: panel.id, changes: { leads: false } });
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
