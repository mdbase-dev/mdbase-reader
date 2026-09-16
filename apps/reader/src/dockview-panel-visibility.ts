import type { DockviewApi } from "dockview-react";

/** Edge shell visibility is separate from Dockview's panel-visible flag. */
export function dockPanelVisible(api: DockviewApi | null, id: string): boolean {
  const panel = api?.getPanel(id);
  if (!api || !panel?.api.isVisible) {
    return false;
  }
  const location = panel.group.api.location;
  if (
    location.type === "edge" &&
    (!api.isEdgeGroupVisible(location.position) || panel.group.api.isCollapsed())
  ) {
    return false;
  }
  return !api.hasMaximizedGroup() || panel.group.api.isMaximized();
}
