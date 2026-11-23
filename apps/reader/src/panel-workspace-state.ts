import {
  allStacks,
  findStack,
  stackOfPanel,
  subjectOf,
  type PanelDescriptor,
  type WorkspaceState,
  type PanelData,
} from "@mdbase-dev/panels";

import { navigatorPanelId } from "./panel-ids.js";
import {
  createPane,
  createSourceWorkspaceLayout,
  notesViews,
  sourceWorkspaceViews,
  type NotesView,
  type SourceWorkspaceLayout,
  type SourceWorkspaceTab,
  type SourceWorkspaceView,
  type WorkspaceTab,
} from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";

export { navigatorPanelId } from "./panel-ids.js";

export interface WorkspaceStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

/**
 * Panel kinds. A `workspace` panel is a reader tab: a library view, or one view of one source.
 * The `navigator` panel is Sources. A `notes` panel shows the annotations, note or citation of
 * whichever source the reader is working on. Sources starts at the left and the Notes panels at
 * the right; apart from that they are ordinary tabs.
 */
export const tabPanelKind = "workspace";
export const navigatorPanelKind = "navigator";
export const notesPanelKind = "notes";
/**
 * Where a collection's workspace is kept, in two halves. The arrangement (what is open and
 * where) is shared by every window on the collection. The window state (focus, the tab in
 * front, open sides, history) is each window's own, under `windowStorageKey`.
 */
export const panelStorageKey = (collection: string): string =>
  `mdbase-reader:workspace:v2:${collection}`;
export const windowStorageKey = (collection: string): string =>
  `${panelStorageKey(collection)}:window`;
/** The single blob both halves were kept in before; read once, never written. */
export const legacyPanelStorageKey = (collection: string): string =>
  `mdbase-reader:panels:v1:${collection}`;

export const navigatorWidth = 260;
export const notesWidth = 340;
const side = { app: "reader", minWidth: 180, minHeight: 120 } as const;

export function navigatorPanel(): PanelDescriptor {
  // Sources is about other tabs, so using it does not change which tab the Notes panels show.
  return { id: navigatorPanelId, kind: navigatorPanelKind, ...side, leads: false };
}

/** A new Notes panel. Its id is a tab's, so pinning it to a source keeps it the same panel. */
export function notesPanel(view: NotesView): PanelDescriptor {
  return notesPanelFor(`reader:session:${crypto.randomUUID()}`, view);
}

/** A Notes panel follows: it is about the tab the reader last used, or the one leading a pane. */
export function notesPanelFor(id: string, view: NotesView): PanelDescriptor {
  return { id, kind: notesPanelKind, data: { view }, ...side, follows: "leader" };
}

/** The pane a Notes panel follows, or null when it follows the tab the reader last used. */
export function followedPane(panel: PanelDescriptor | null | undefined): string | null {
  const follows = panel?.follows;
  return follows !== undefined && follows !== "leader" ? follows.pane : null;
}

/** The tab a Notes panel is about right now. */
export function subjectTab(state: WorkspaceState, panel: string): WorkspaceTab | null {
  const subject = subjectOf(state, panel);
  return subject ? panelTab(state.panels[subject]) : null;
}

/** Which of a source's tools a Notes panel shows, or null for any other panel. */
export function notesView(panel: PanelDescriptor | null | undefined): NotesView | null {
  const view = panel?.kind === notesPanelKind && isRecord(panel.data) ? panel.data["view"] : null;
  return notesViews.find((candidate) => candidate === view) ?? null;
}

/** Whether a panel is Sources or a Notes panel, rather than a tab. */
export function isSidePanel(panel: PanelDescriptor | null | undefined): boolean {
  return panel?.kind === navigatorPanelKind || notesView(panel) !== null;
}

/** The side a panel starts at, and goes back to when the arrangement is reset. */
export function homeOf(panel: PanelDescriptor): { side: "left" | "right"; width: number } {
  return panel.kind === navigatorPanelKind
    ? { side: "left", width: navigatorWidth }
    : { side: "right", width: notesWidth };
}

/** Tabs that can become a Notes panel: a note, annotations or citation tab of one source. */
export function canFollow(tab: WorkspaceTab | null): tab is SourceWorkspaceTab {
  return tab?.kind === "source" && tab.view !== "document";
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
    leads: true,
  };
}

/** The reader tab a panel holds, or null for Sources and the Notes panels. */
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

/** The Notes panels, in the order their stacks appear. */
export function notesPanels(state: WorkspaceState): PanelDescriptor[] {
  return allStacks(state).flatMap((stack) =>
    stack.panels.flatMap((id) => {
      const panel = state.panels[id];
      return panel && notesView(panel) ? [panel] : [];
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
  // Only a pinned tab remembers having been a Notes panel; unpinned, it would be one.
  return value["follow"] === true && tab.pinned && canFollow(tab) ? { ...tab, follow: true } : tab;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
