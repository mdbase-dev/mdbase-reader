import {
  createPane,
  createSourceWorkspaceLayout,
  sourceWorkspaceViews,
  type SourceWorkspaceLayout,
  type WorkspaceTab,
  type SourceWorkspaceView,
} from "./source-workspace-layout.js";

import type { SourceId } from "@mdbase-reader/core";
import type { DockviewApi, IDockviewPanel, SerializedDockview } from "dockview-react";

export const navigatorPanelId = "reader:navigator";
export const inspectorPanelId = "reader:inspector";
export const dockStorageKey = (collection: string): string =>
  `mdbase-reader:dockview:v1:${collection}`;
export function panelTab(panel: IDockviewPanel | undefined): WorkspaceTab | null {
  return (panel?.params?.["tab"] as WorkspaceTab | undefined) ?? null;
}

/** Read-only projection for Reader commands. Dockview alone owns placement. */
export function projectDockLayout(
  api: DockviewApi,
  focusedPanel: string | null,
  previous: SourceWorkspaceLayout,
): SourceWorkspaceLayout {
  const panes = api.groups.flatMap((group) => {
    const tabs = group.panels.flatMap((panel) => {
      const tab = panelTab(panel);
      return tab ? [tab] : [];
    });
    if (!tabs.length) {
      return [];
    }
    const remembered = previous.panes.find(({ id }) => id === group.id);
    const activeId =
      panelTab(group.activePanel)?.id ??
      tabs.find(({ id }) => id === focusedPanel)?.id ??
      tabs.find(({ id }) => id === remembered?.activeTabId)?.id ??
      tabs[0]?.id ??
      null;
    return [{ ...createPane(group.id), tabs, activeTabId: activeId }];
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
export function initialDockSnapshot(): SourceWorkspaceLayout {
  return createSourceWorkspaceLayout(null);
}

/** Validate descriptors before allowing Dockview to instantiate any components. */
export function parseDockState(
  serialized: string,
  knownSources: ReadonlySet<SourceId>,
): SerializedDockview {
  const envelope: unknown = JSON.parse(serialized);
  if (!isRecord(envelope) || envelope["version"] !== 1) {
    throw new Error("Invalid workspace version");
  }
  const layout = envelope["layout"];
  if (!isRecord(layout) || !isRecord(layout["grid"]) || !isRecord(layout["panels"])) {
    throw new Error("Invalid workspace");
  }
  if (layout["floatingGroups"] || layout["popoutGroups"] || layout["edgeGroups"]) {
    throw new Error("Unsupported workspace windows");
  }
  const state = layout as unknown as SerializedDockview;
  for (const [id, panel] of Object.entries(state.panels)) {
    if (id === navigatorPanelId || id === inspectorPanelId) {
      panel.contentComponent = id === navigatorPanelId ? "navigator" : "inspector";
      panel.params = {};
    } else {
      const tab = parseDockTab(panel.params?.["tab"], id);
      panel.contentComponent = "workspace";
      // Remove missing sources after deserialization, before publishing the layout.
      panel.params = { tab, missing: tab.kind === "source" && !knownSources.has(tab.sourceId) };
    }
    panel.id = id;
    panel.renderer = "always";
    delete panel.tabComponent;
  }
  return state;
}
export function parseDockTab(value: unknown, id: string): WorkspaceTab {
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
  return {
    ...base,
    kind: "source",
    sourceId: value["sourceId"] as SourceId,
    view: value["view"] as SourceWorkspaceView,
  };
}
export function serializeDockState(
  api: DockviewApi,
  navigation?: unknown,
  focusedPanel?: string | null,
): string {
  const layout = api.toJSON();
  for (const [id, panel] of Object.entries(layout.panels)) {
    const tab: unknown = panel.params?.["tab"];
    // Layouts contain descriptors, not editor content or persisted dirty flags.
    panel.params = tab ? { tab: parseDockTab(tab, id) } : {};
  }
  return JSON.stringify({ version: 1, layout, navigation, focusedPanel });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
