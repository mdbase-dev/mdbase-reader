import { inspectorPanelId, navigatorPanelId } from "./dockview-workspace-state.js";

import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from "dockview-react";

/** Sidebar commands use the same Dockview instance and native groups as documents. */
export class DockviewSidePanels {
  singlePane = false;
  private positions = new Map<string, { group: string; width: number }>();
  constructor(private readonly current: () => DockviewApi | null) {}

  visible(id: string): boolean {
    const api = this.current();
    const panel = api?.getPanel(id);
    return Boolean(
      panel?.api.isVisible && (!api?.hasMaximizedGroup() || panel.group.api.isMaximized()),
    );
  }
  setSinglePane(value: boolean): void {
    if (value && !this.singlePane) {
      for (const id of [navigatorPanelId, inspectorPanelId]) {
        const panel = this.current()?.getPanel(id);
        if (panel) {
          this.remember(panel);
        }
      }
    }
    this.singlePane = value;
    if (value) {
      this.current()?.activeGroup?.api.maximize();
    } else {
      this.current()?.exitMaximizedGroup();
    }
  }
  remember(panel: IDockviewPanel): void {
    if (panel.group.api.isMaximized() && this.positions.has(panel.id)) {
      return;
    }
    this.positions.set(panel.id, { group: panel.group.id, width: panel.group.api.width });
  }
  show(id: string, activate: boolean): void {
    const api = this.current();
    if (!api) {
      return;
    }
    const existing = api.getPanel(id);
    if (existing) {
      if (activate) {
        existing.api.setActive();
      }
      return;
    }
    const previous = this.positions.get(id);
    const group = previous ? api.groups.find((group) => group.id === previous.group) : undefined;
    const width = previous?.width ?? (id === navigatorPanelId ? 260 : 340);
    const added = api.addPanel({
      id,
      component: id === navigatorPanelId ? "navigator" : "inspector",
      title: id === navigatorPanelId ? "Library navigator" : "Source tools",
      renderer: "always",
      inactive: !activate,
      minimumWidth: 180,
      minimumHeight: 120,
      initialWidth: width,
      position: group
        ? { referenceGroup: group, direction: "within" }
        : { direction: id === navigatorPanelId ? "left" : "right" },
    });
    if (!group) {
      requestAnimationFrame(() => {
        // onReady can run before Dockview's first measured layout.
        if (this.current() === api && api.getPanel(id) === added && !this.singlePane) {
          added.group.api.setSize({ width });
        }
      });
    }
  }
  resetAround(target: DockviewGroupPanel): void {
    const api = this.current();
    if (!api) {
      return;
    }
    for (const id of [navigatorPanelId, inspectorPanelId]) {
      const panel = api.getPanel(id);
      if (!panel) {
        continue;
      }
      panel.api.moveTo({
        group: target,
        position: id === navigatorPanelId ? "left" : "right",
        skipSetActive: true,
      });
      panel.group.api.setSize({ width: id === navigatorPanelId ? 260 : 340 });
    }
  }
}
