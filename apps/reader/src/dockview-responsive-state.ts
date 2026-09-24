import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";

import type { SerializedDockview } from "dockview-react";
type Node = SerializedDockview["grid"]["root"];
type Group = Exclude<Node["data"], Node[]>;
export const mobileGroupId = "reader:mobile-workspace";
export const edgePositions = ["left", "right", "top", "bottom"] as const;
function edgeViews(
  layout: SerializedDockview,
): NonNullable<NonNullable<SerializedDockview["edgeGroups"]>["left"]>[] {
  return edgePositions.flatMap((position) => {
    const edge = layout.edgeGroups?.[position];
    return edge ? [edge] : [];
  });
}
export function gridGroups(node: Node): Group[] {
  return Array.isArray(node.data) ? node.data.flatMap(gridGroups) : [node.data];
}
function allGroups(layout: SerializedDockview): Group[] {
  return [...gridGroups(layout.grid.root), ...edgeViews(layout).map((edge) => edge.group as Group)];
}
export function mobileLayout(
  desktop: SerializedDockview,
  active: string | null,
): SerializedDockview {
  const ids = Object.keys(desktop.panels);
  // A stale or missing focus (e.g. the focused tab was closed) must fall back to content: left
  // to itself, Dockview activates the last view, which is a side panel.
  const activeView =
    active && ids.includes(active)
      ? active
      : ids.find((id) => id !== navigatorPanelId && id !== inspectorPanelId);
  return {
    grid: {
      width: desktop.grid.width,
      height: desktop.grid.height,
      orientation: desktop.grid.orientation,
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            data: {
              id: mobileGroupId,
              views: ids,
              ...(activeView ? { activeView } : {}),
            },
          },
        ],
      },
    },
    panels: desktop.panels,
    activeGroup: mobileGroupId,
  };
}
function repairActive(group: Group): void {
  if (group.views.includes(group.activeView ?? "")) {
    return;
  }
  if (group.views[0]) {
    group.activeView = group.views[0];
  } else {
    delete group.activeView;
  }
}
function prune(node: Node, panels: SerializedDockview["panels"]): Node | null {
  if (Array.isArray(node.data)) {
    const data = node.data.flatMap((child) => {
      const next = prune(child, panels);
      return next ? [next] : [];
    });
    return data.length ? { ...node, data } : null;
  }
  node.data.views = node.data.views.filter((id) => panels[id]);
  repairActive(node.data);
  return node.data.views.length ? node : null;
}
function appendPanel(layout: SerializedDockview, id: string): void {
  if (id === navigatorPanelId || id === inspectorPanelId) {
    const position = id === navigatorPanelId ? "left" : "right";
    layout.edgeGroups ??= {};
    const edge = (layout.edgeGroups[position] ??= {
      size: position === "left" ? 260 : 340,
      visible: true,
      group: { id: `reader:edge:${position}`, views: [], headerPosition: "top" },
    });
    (edge.group as Group).views.push(id);
    (edge.group as Group).activeView = id;
  } else {
    let target =
      gridGroups(layout.grid.root).find((group) => group.id === layout.activeGroup) ??
      gridGroups(layout.grid.root)[0];
    if (!target) {
      target = { id: "reader:desktop-workspace", views: [] };
      layout.grid.root = { type: "branch", data: [{ type: "leaf", data: target }] };
    }
    target.views.push(id);
    target.activeView = id;
  }
}
function restoreFocus(layout: SerializedDockview, focused: string | null): void {
  const groups = allGroups(layout);
  const active =
    groups.find((group) => group.views.includes(focused ?? "")) ??
    groups.find((group) => group.views.length);
  if (!active) {
    delete layout.activeGroup;
    return;
  }
  layout.activeGroup = active.id;
  if (focused && active.views.includes(focused)) {
    active.activeView = focused;
  }
  for (const edge of edgeViews(layout)) {
    if (edge.group === active && focused && active.views.includes(focused)) {
      edge.visible = true;
      edge.collapsed = false;
    }
  }
}
/** Reconcile tab membership, not geometry: desktop splits stay native serialized Dockview data. */
export function desktopLayout(
  desktop: SerializedDockview,
  current: SerializedDockview,
  focused: string | null,
): SerializedDockview {
  const result = structuredClone(desktop);
  // A native maximize descriptor contains an index path into the old tree.
  // Presentation focus is restored by the controller, never with a stale path after pruning.
  Reflect.deleteProperty(result.grid, "maximizedNode");
  result.panels = current.panels;
  result.grid.root = prune(result.grid.root, current.panels) ?? { type: "branch", data: [] };
  for (const edge of edgeViews(result)) {
    const group = edge.group as Group;
    group.views = group.views.filter((id) => current.panels[id]);
    repairActive(group);
  }
  const placed = new Set(allGroups(result).flatMap((group) => group.views));
  for (const id of Object.keys(current.panels).filter((key) => !placed.has(key))) {
    appendPanel(result, id);
  }
  restoreFocus(result, focused);
  return result;
}
