import {
  allStacks,
  findStack,
  stackOfPanel,
  type PanelDescriptor,
  type WorkspaceState,
  type PanelData,
} from "@mdbase-dev/panels";

import { inspectorPanelId, navigatorPanelId } from "./panel-ids.js";
import {
  createPane,
  createSourceWorkspaceLayout,
  sourceWorkspaceViews,
  type SourceWorkspaceLayout,
  type SourceWorkspaceTab,
  type SourceWorkspaceView,
  type WorkspaceTab,
} from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";

export { navigatorPanelId, inspectorPanelId } from "./panel-ids.js";

/**
 * Panel kinds: a `workspace` panel is a reader tab; the other two are the Sources and Notes
 * panels, which start at the sides and are otherwise ordinary tabs.
 */
export interface WorkspaceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const tabPanelKind = "workspace";
export const panelStorageKey = (collection: string): string =>
  `mdbase-reader:panels:v1:${collection}`;

export const sidePanelIds: ReadonlySet<string> = new Set([navigatorPanelId, inspectorPanelId]);
export const sideOf = (id: string): "left" | "right" =>
  id === navigatorPanelId ? "left" : "right";
export const sideWidth = (id: string): number => (id === navigatorPanelId ? 260 : 340);

export function sidePanel(id: string): PanelDescriptor {
  return {
    id,
    kind: id === navigatorPanelId ? "navigator" : "inspector",
    app: "reader",
    minWidth: 180,
    minHeight: 120,
    // Both are about other tabs, so using them does not change which tab they are about.
    leads: false,
  };
}

/** Views a tab can follow the active document with. A citation form is one per source. */
export function canFollow(tab: WorkspaceTab | null): tab is SourceWorkspaceTab {
  return tab?.kind === "source" && (tab.view === "note" || tab.view === "annotations");
}

/** Whether a tab is following the active document now: it is set to, and not pinned. */
export function follows(tab: WorkspaceTab | null): tab is SourceWorkspaceTab {
  return canFollow(tab) && tab.follow === true && !tab.pinned;
}

/** What a panel stores about its reader tab. Unsaved-changes state is never part of it. */
export function tabData(tab: WorkspaceTab): PanelData {
  const data =
    tab.kind === "library"
      ? { kind: tab.kind, view: tab.view, libraryViewId: tab.libraryViewId, title: tab.title }
      : {
          kind: tab.kind,
          view: tab.view,
          sourceId: tab.sourceId,
          ...(tab.follow ? { follow: true } : {}),
        };
  return { tab: { ...data, id: tab.id, preview: tab.preview, pinned: tab.pinned } };
}

export function tabPanel(tab: WorkspaceTab, title?: string): PanelDescriptor {
  return {
    id: tab.id,
    kind: tabPanelKind,
    app: "reader",
    ...(title === undefined ? {} : { title }),
    data: tabData(tab),
    minWidth: 180,
    minHeight: 120,
    // A tab that follows is about another tab, so it never becomes the one being followed.
    ...(follows(tab) ? { leads: false } : {}),
  };
}

/** The reader tab a panel holds, or null for a side panel. */
export function panelTab(
  panel: PanelDescriptor | null | undefined,
  dirty?: ReadonlySet<string>,
): WorkspaceTab | null {
  if (panel?.kind !== tabPanelKind) {
    return null;
  }
  const data = panel.data;
  const value = isRecord(data) ? data["tab"] : undefined;
  try {
    const tab = parseWorkspaceTab(value, panel.id);
    return dirty?.has(panel.id) ? { ...tab, dirty: true } : tab;
  } catch {
    return null;
  }
}

/** The pane-and-tab view of the workspace that Reader's commands read. */
export function projectLayout(
  state: WorkspaceState,
  focusedPanel: string | null,
  previous: SourceWorkspaceLayout,
  dirty: ReadonlySet<string>,
): SourceWorkspaceLayout {
  const panes = allStacks(state).flatMap((stack) => {
    const tabs = stack.panels.flatMap((id) => {
      const tab = panelTab(state.panels[id], dirty);
      return tab ? [tab] : [];
    });
    if (!tabs.length) {
      return [];
    }
    const remembered = previous.panes.find(({ id }) => id === stack.id);
    const activeTabId =
      tabs.find(({ id }) => id === stack.active)?.id ??
      tabs.find(({ id }) => id === focusedPanel)?.id ??
      tabs.find(({ id }) => id === remembered?.activeTabId)?.id ??
      tabs[0]?.id ??
      null;
    return [{ ...createPane(stack.id), tabs, activeTabId }];
  });
  const focusedPaneId =
    panes.find(({ tabs }) => tabs.some(({ id }) => id === focusedPanel))?.id ??
    panes[0]?.id ??
    "primary";
  return {
    ...previous,
    panes: panes.length ? panes : [createPane("primary")],
    focusedPaneId,
    splitDirection: null,
    splitRatio: 0.5,
  };
}

export function initialLayoutSnapshot(): SourceWorkspaceLayout {
  return createSourceWorkspaceLayout(null);
}

/** The active panel of the stack that has focus: a tab or a side panel. */
export function activePanel(state: WorkspaceState): PanelDescriptor | null {
  const active = findStack(state, state.focus)?.active;
  return active ? (state.panels[active] ?? null) : null;
}

/** Reader tabs in the order their stacks appear. */
export function tabPanels(state: WorkspaceState): PanelDescriptor[] {
  return allStacks(state).flatMap((stack) =>
    stack.panels.flatMap((id) => {
      const panel = state.panels[id];
      return panel?.kind === tabPanelKind ? [panel] : [];
    }),
  );
}

export function stackIdOf(state: WorkspaceState, panel: string): string | undefined {
  return stackOfPanel(state, panel)?.id;
}

/** Validate a stored tab before anything renders it. */
export function parseWorkspaceTab(value: unknown, id: string): WorkspaceTab {
  if (!isRecord(value) || value["id"] !== id || !id.startsWith("reader:session:")) {
    throw new Error("Invalid workspace tab identity");
  }
  const base = {
    id,
    dirty: false,
    preview: value["preview"] === true,
    pinned: value["pinned"] === true,
  };
  if (
    value["kind"] === "library" &&
    typeof value["libraryViewId"] === "string" &&
    typeof value["title"] === "string"
  ) {
    return {
      ...base,
      kind: "library",
      view: "library",
      libraryViewId: value["libraryViewId"],
      title: value["title"],
    };
  }
  if (
    value["kind"] !== "source" ||
    typeof value["sourceId"] !== "string" ||
    !sourceWorkspaceViews.includes(value["view"] as SourceWorkspaceView)
  ) {
    throw new Error("Invalid source tab");
  }
  const tab: SourceWorkspaceTab = {
    ...base,
    kind: "source",
    sourceId: value["sourceId"] as SourceId,
    view: value["view"] as SourceWorkspaceView,
  };
  return value["follow"] === true && canFollow(tab) ? { ...tab, follow: true } : tab;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
