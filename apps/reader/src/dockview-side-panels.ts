import { dockPanelVisible } from "./dockview-panel-visibility.js";
import { inspectorPanelId, navigatorPanelId } from "./dockview-workspace-state.js";

import type {
  DockviewApi,
  DockviewGroupPanel,
  IDockviewPanel,
  SerializedDockview,
} from "dockview-react";

const positions = ["left", "right"] as const;
function edgeGroup(api: DockviewApi, id: string, width: number): DockviewGroupPanel {
  const position = id === navigatorPanelId ? "left" : "right";
  const edge =
    api.getEdgeGroup(position) ??
    api.addEdgeGroup(position, {
      id: `reader:edge:${position}`,
      initialSize: width,
      minimumSize: 180,
    });
  edge.setHeaderPosition("top");
  edge.expand();
  api.setEdgeGroupVisible(position, true);
  const group = api.groups.find((candidate) => candidate.id === edge.id);
  if (!group) {
    throw new Error("Missing sidebar edge group");
  }
  return group;
}
/** Desktop shell edges; mobile uses a native single-group layout with the same panels. */
export class DockviewSidePanels {
  singlePane = false;
  private focusVisibility: Map<"left" | "right", boolean> | null = null;
  constructor(
    private readonly current: () => DockviewApi | null,
    private readonly mobile: () => boolean,
  ) {}
  detach(): void {
    this.focusVisibility = null;
  }
  visible = (id: string): boolean => dockPanelVisible(this.current(), id);
  setSinglePane(value: boolean, focused?: IDockviewPanel): void {
    const wasSinglePane = this.singlePane;
    this.singlePane = value;
    const api = this.current();
    if (this.mobile()) {
      return;
    }
    const target = focused?.group ?? api?.activeGroup;
    if (value && target?.api.location.type === "grid") {
      (focused ?? target.activePanel)?.api.setActive();
      target.api.maximize();
    } else if (!value && wasSinglePane) {
      api?.exitMaximizedGroup();
    }
  }
  syncFocus(): void {
    const api = this.current();
    if (!api || this.mobile()) {
      return;
    }
    if (api.hasMaximizedGroup() && !this.focusVisibility) {
      this.focusVisibility = new Map(
        positions.map((position) => [position, api.isEdgeGroupVisible(position)]),
      );
      for (const position of positions) {
        api.setEdgeGroupVisible(position, false);
      }
    } else if (!api.hasMaximizedGroup() && this.focusVisibility) {
      const previous = this.focusVisibility;
      this.focusVisibility = null;
      for (const [position, visible] of previous) {
        api.setEdgeGroupVisible(position, visible);
      }
    }
  }
  serialize(layout: SerializedDockview): SerializedDockview {
    for (const [position, visible] of this.focusVisibility ?? []) {
      const edge = layout.edgeGroups?.[position];
      if (edge) {
        edge.visible = visible;
      }
    }
    return layout;
  }
  hideEmpty(): void {
    const api = this.current();
    if (!api || this.mobile()) {
      return;
    }
    for (const position of positions) {
      const id = api.getEdgeGroup(position)?.id;
      if (
        id &&
        api.groups.find((group) => group.id === id)?.panels.length === 0 &&
        api.isEdgeGroupVisible(position)
      ) {
        api.setEdgeGroupVisible(position, false);
      }
    }
  }
  initialize(): void {
    const api = this.current();
    if (!api || this.mobile()) {
      return;
    }
    for (const position of positions) {
      api.getEdgeGroup(position)?.setHeaderPosition("top");
    }
  }
  hide(panel: IDockviewPanel): boolean {
    const location = panel.group.api.location;
    if (location.type !== "edge" || panel.group.panels.length !== 1) {
      return false;
    }
    this.current()?.setEdgeGroupVisible(location.position, false);
    return true;
  }
  show(id: string, activate: boolean): void {
    const api = this.current();
    if (!api) {
      return;
    }
    if (!this.mobile()) {
      api.exitMaximizedGroup();
    }
    const existing = api.getPanel(id);
    if (existing) {
      const location = existing.group.api.location;
      if (location.type === "edge") {
        api.setEdgeGroupVisible(location.position, true);
        existing.group.api.expand();
      }
      if (activate) {
        existing.api.setActive();
      }
      return;
    }
    const group = this.mobile()
      ? api.activeGroup
      : edgeGroup(api, id, id === navigatorPanelId ? 260 : 340);
    api.addPanel({
      id,
      component: id === navigatorPanelId ? "navigator" : "inspector",
      title: id === navigatorPanelId ? "Library navigator" : "Source tools",
      renderer: "always",
      inactive: !activate,
      minimumWidth: 180,
      minimumHeight: 120,
      ...(group ? { position: { referenceGroup: group, direction: "within" as const } } : {}),
    });
  }
  resetAround(): void {
    const api = this.current();
    if (!api || this.mobile()) {
      return;
    }
    for (const id of [navigatorPanelId, inspectorPanelId]) {
      const panel = api.getPanel(id);
      if (!panel) {
        continue;
      }
      const location = panel.group.api.location;
      if (location.type === "edge" && !api.isEdgeGroupVisible(location.position)) {
        continue;
      }
      const width = id === navigatorPanelId ? 260 : 340;
      const target = edgeGroup(api, id, width);
      if (panel.group !== target) {
        panel.api.moveTo({ group: target, position: "center", skipSetActive: true });
      }
      target.api.expand();
      target.api.setSize({ width });
    }
  }
}
