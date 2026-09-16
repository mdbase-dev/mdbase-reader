import { panelTab, navigatorPanelId, inspectorPanelId } from "./dockview-workspace-state.js";

import type { WorkspaceTab, WorkspaceSplitDirection } from "./source-workspace-layout.js";
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from "dockview-react";

/** Confirm the complete batch before removing anything. */
export function panelsForClose(
  api: DockviewApi | null,
  ids: readonly string[],
  confirm: (tab: WorkspaceTab) => boolean,
): IDockviewPanel[] | null {
  const panels = ids.flatMap((id) => {
    const panel = api?.getPanel(id);
    return panel ? [panel] : [];
  });
  return panels.some((panel) => {
    const tab = panelTab(panel);
    return tab?.dirty && !confirm(tab);
  })
    ? null
    : panels;
}
function defaultDockPosition(
  api: DockviewApi,
): { referenceGroup: DockviewGroupPanel; direction: "left" | "right" } | undefined {
  const side = api.getPanel(navigatorPanelId) ?? api.getPanel(inspectorPanelId);
  return side?.group.api.location.type === "grid"
    ? { referenceGroup: side.group, direction: side.id === navigatorPanelId ? "right" : "left" }
    : undefined;
}
export function addDockTab(
  api: DockviewApi,
  tab: WorkspaceTab,
  reference?: DockviewGroupPanel,
  direction?: WorkspaceSplitDirection,
): IDockviewPanel {
  const existing = existingTool(api, tab);
  if (existing) {
    if (reference && direction) {
      existing.api.moveTo({
        group: reference,
        position: direction === "horizontal" ? "right" : "bottom",
      });
    }
    existing.api.setActive();
    return existing;
  }
  // Reopening a closed session can recover its in-memory reading position.
  const id =
    tab.id.startsWith("reader:session:") && !api.getPanel(tab.id)
      ? tab.id
      : `reader:session:${crypto.randomUUID()}`;
  const defaultPosition = defaultDockPosition(api);
  return api.addPanel({
    id,
    component: "workspace",
    renderer: "always",
    params: { tab: { ...tab, id } },
    title: tab.kind === "library" ? tab.title : tab.view,
    minimumWidth: 180,
    minimumHeight: 120,
    ...(reference
      ? {
          position: {
            referenceGroup: reference,
            direction: direction
              ? direction === "horizontal"
                ? ("right" as const)
                : ("below" as const)
              : ("within" as const),
          },
        }
      : defaultPosition
        ? { position: defaultPosition }
        : {}),
  });
}
export function patchDockTab(
  api: DockviewApi,
  id: string,
  changes: Partial<Pick<WorkspaceTab, "dirty" | "pinned" | "preview">>,
): boolean {
  const panel = api.getPanel(id);
  const tab = panelTab(panel);
  if (
    !panel ||
    !tab ||
    Object.entries(changes).every(([key, value]) => tab[key as keyof WorkspaceTab] === value)
  ) {
    return false;
  }
  panel.api.updateParameters({
    tab: { ...tab, ...changes, ...(changes.dirty || changes.pinned ? { preview: false } : {}) },
  });
  return true;
}
export function openDockTab(api: DockviewApi, tab: WorkspaceTab, group?: DockviewGroupPanel): void {
  const existing =
    existingTool(api, tab) ?? group?.panels.find((panel) => sameLocation(panelTab(panel), tab));
  if (existing) {
    if (!tab.preview) {
      patchDockTab(api, existing.id, { preview: false });
    }
    existing.api.setActive();
    return;
  }
  const oldPreview = group?.panels.find((panel) => {
    const candidate = panelTab(panel);
    return candidate?.preview && !candidate.dirty && !candidate.pinned;
  });
  // Add first so replacing the only preview cannot destroy the destination group.
  addDockTab(api, tab, group);
  if (tab.preview && oldPreview) {
    api.removePanel(oldPreview);
  }
}
function existingTool(api: DockviewApi, tab: WorkspaceTab): IDockviewPanel | undefined {
  return tab.kind === "source" && tab.view === "citation"
    ? api.panels.find((panel) => sameLocation(panelTab(panel), tab))
    : undefined;
}
function sameLocation(left: WorkspaceTab | null, right: WorkspaceTab): boolean {
  return (
    left?.kind === right.kind &&
    left.view === right.view &&
    (left.kind === "library"
      ? left.libraryViewId === right.libraryViewId
      : left.sourceId === right.sourceId)
  );
}
