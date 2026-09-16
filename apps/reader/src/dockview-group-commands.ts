import { panelTab } from "./dockview-workspace-state.js";

import type { WorkspaceSplitDirection } from "./source-workspace-layout.js";
import type { DockviewApi, DockviewGroupPanel } from "dockview-react";

export function moveDockPanel(
  api: DockviewApi | null,
  id: string,
  target: string,
  index?: number,
): void {
  const group = api?.groups.find((group) => group.id === target);
  if (group) {
    api
      ?.getPanel(id)
      ?.api.moveTo({ group, position: "center", ...(index === undefined ? {} : { index }) });
  }
}
export function splitDockPanel(
  api: DockviewApi | null,
  id: string,
  direction: WorkspaceSplitDirection,
): void {
  const panel = api?.getPanel(id);
  if (panel) {
    panel.api.moveTo({
      group: panel.group,
      position: direction === "horizontal" ? "right" : "bottom",
    });
  }
}
export function mergeDockGroup(api: DockviewApi | null, groupId: string): void {
  const group = api?.groups.find((group) => group.id === groupId);
  const target = api?.panels.find((panel) => panelTab(panel) && panel.group.id !== groupId)?.group;
  if (group && target) {
    for (const panel of [...group.panels]) {
      moveDockPanel(api, panel.id, target.id);
    }
  }
}
export function focusNextDockGroup(api: DockviewApi | null): void {
  if (!api) {
    return;
  }
  const index = api.groups.findIndex(({ id }) => id === api.activeGroup?.id);
  const next = api.groups[(index + 1) % api.groups.length]?.activePanel;
  next?.api.setActive();
  next?.focus();
}
export function switchDockTab(group: DockviewGroupPanel | undefined, direction: -1 | 1): void {
  if (!group?.panels.length) {
    return;
  }
  const index = group.panels.findIndex(({ id }) => id === group.activePanel?.id);
  group.panels[(index + direction + group.panels.length) % group.panels.length]?.api.setActive();
}
