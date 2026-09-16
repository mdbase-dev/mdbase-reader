import { Orientation, type SerializedDockview } from "dockview-react";

import { inspectorPanelId, navigatorPanelId } from "./dockview-panel-ids.js";

type Node = SerializedDockview["grid"]["root"];
type Group = Exclude<Node["data"], Node[]>;

/** Migrate only standalone shell panels. Mixed workbench groups keep their placement. */
export function migrateEdgeSidebars(layout: SerializedDockview): void {
  if (layout.edgeGroups) {
    return;
  }
  const edges: NonNullable<SerializedDockview["edgeGroups"]> = {};
  const visit = (node: Node, horizontal: boolean): Node | null => {
    if (Array.isArray(node.data)) {
      const data = node.data.flatMap((child) => {
        const next = visit(child, child.type === "branch" ? !horizontal : horizontal);
        return next ? [next] : [];
      });
      return data.length ? { ...node, data } : null;
    }
    const id = node.data.views.length === 1 ? node.data.views[0] : null;
    if (id !== navigatorPanelId && id !== inspectorPanelId) {
      return node;
    }
    const position = id === navigatorPanelId ? "left" : "right";
    edges[position] = {
      size: horizontal && node.size ? node.size : position === "left" ? 260 : 340,
      visible: true,
      minimumSize: 180,
      group: { ...node.data, headerPosition: "top" },
    };
    return null;
  };
  layout.grid.root = visit(
    layout.grid.root,
    layout.grid.orientation === Orientation.HORIZONTAL,
  ) ?? { type: "branch", data: [] };
  if (Object.keys(edges).length) {
    layout.edgeGroups = edges;
    layout.grid.width = Math.max(
      0,
      layout.grid.width - (edges.left?.size ?? 0) - (edges.right?.size ?? 0),
    );
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function geometry(value: unknown): {
  size: number;
  visible: boolean;
  collapsed: boolean;
  group: unknown;
} {
  if (
    !record(value) ||
    typeof value["size"] !== "number" ||
    !Number.isFinite(value["size"]) ||
    value["size"] < 0 ||
    value["size"] > 100000 ||
    typeof value["visible"] !== "boolean"
  ) {
    throw new Error("Invalid edge geometry");
  }
  return {
    size: value["size"],
    visible: value["visible"],
    collapsed: value["collapsed"] === true,
    group: value["group"],
  };
}
function edgeGroup(
  value: unknown,
  groups: Set<string>,
  seen: Set<string>,
  panels: SerializedDockview["panels"],
): Group {
  if (
    !record(value) ||
    typeof value["id"] !== "string" ||
    !value["id"] ||
    groups.has(value["id"]) ||
    !Array.isArray(value["views"])
  ) {
    throw new Error("Invalid edge group");
  }
  groups.add(value["id"]);
  const views = value["views"].map((id: unknown) => {
    if (typeof id !== "string" || !Object.hasOwn(panels, id) || seen.has(id)) {
      throw new Error("Invalid edge panel reference");
    }
    seen.add(id);
    return id;
  });
  const active = value["activeView"];
  if (active !== undefined && (typeof active !== "string" || !views.includes(active))) {
    throw new Error("Invalid edge active panel");
  }
  return {
    id: value["id"],
    views,
    ...(active ? { activeView: active } : {}),
    headerPosition: "top",
  };
}
/** Edge payloads are opaque to Dockview's public TS shape, so validate them explicitly. */
export function validateEdgeState(layout: SerializedDockview): void {
  if (layout.edgeGroups === undefined) {
    return;
  }
  if (!record(layout.edgeGroups)) {
    throw new Error("Invalid edge groups");
  }
  const seen = new Set<string>(),
    groups = new Set<string>();
  const collect = (node: Node): void => {
    if (Array.isArray(node.data)) {
      node.data.forEach(collect);
    } else {
      node.data.views.forEach((id) => seen.add(id));
      groups.add(node.data.id);
    }
  };
  collect(layout.grid.root);
  for (const [position, value] of Object.entries(layout.edgeGroups)) {
    if (position !== "left" && position !== "right") {
      throw new Error("Unsupported edge position");
    }
    const edge = geometry(value);
    layout.edgeGroups[position] = {
      ...edge,
      minimumSize: 180,
      group: edgeGroup(edge.group, groups, seen, layout.panels),
    };
  }
}
