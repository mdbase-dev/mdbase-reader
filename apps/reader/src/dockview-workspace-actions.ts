import { panelTab } from "./dockview-workspace-state.js";
import { createLibraryWorkspaceTab, createWorkspaceTab } from "./source-workspace-layout.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { SourceWorkspaceActions } from "./source-workspace-controller.js";

/** Compatibility command names; all structural mutations are performed by Dockview. */
export function dockWorkspaceActions(dock: ReaderDockWorkspace): SourceWorkspaceActions {
  const other = (id: string): string | undefined =>
    dock.getSnapshot().panes.find((pane) => pane.id !== id)?.id;
  const closeExcept = (id: string, pane: string, rightOnly = false): void => {
    const tabs = dock.group(pane)?.panels ?? [];
    const index = tabs.findIndex((panel) => panel.id === id);
    dock.closeMany(
      tabs
        .filter(
          (panel, i) => panel.id !== id && !panelTab(panel)?.pinned && (!rightOnly || i > index),
        )
        .map((panel) => panel.id),
    );
  };
  return {
    preview: (id, pane) => dock.open(id, "document", pane, true),
    open: (id, pane) => dock.open(id, "document", pane),
    openView: (id, view, pane) => dock.open(id, view, pane),
    openLibrary: (view, title, pane) => dock.openLibrary(view, title, pane),
    openLibraryBeside: (view, title, direction) =>
      dock.beside(createLibraryWorkspaceTab(view, title), direction),
    activateTab: (id) => dock.activate(id),
    activate: (id) => {
      const panel = dock.contentPanels().find((panel) => panelTab(panel)?.sourceId === id);
      if (panel) {
        dock.activate(panel.id);
      }
    },
    promote: (id) => dock.patch(id, { preview: false }),
    pin: (id, _pane, pinned) => dock.patch(id, { pinned }),
    markDirty: (id, _pane, dirty) => dock.patch(id, { dirty }),
    close: (id) =>
      dock.closeMany(
        dock
          .contentPanels()
          .filter((panel) => panelTab(panel)?.sourceId === id)
          .map((panel) => panel.id),
      ),
    closeTab: (id) => dock.close(id),
    closeOthers: (id, pane) => closeExcept(id, pane),
    closeToRight: (id, pane) => closeExcept(id, pane, true),
    reopenClosed: () => dock.reopen(),
    reorder: (pane, from, to) => {
      const panel = dock.group(pane)?.panels[from];
      if (panel) {
        dock.move(panel.id, pane, to);
      }
    },
    navigate: (direction) => dock.navigate(direction),
    switchRelative: (direction) => dock.switchRelative(direction),
    focus: (pane) => dock.group(pane)?.api.setActive(),
    focusNextPane: () => dock.focusNext(),
    openBeside: (id, view = "document", direction) =>
      dock.beside(createWorkspaceTab(id, view), direction),
    splitTab: (id, _pane, direction) => dock.split(id, direction),
    moveTab: (id, _from, to, index) => dock.move(id, to, index),
    resizeSplit: (ratio) => {
      const group = dock.group();
      if (group && dock.api) {
        group.api.setSize({ width: dock.api.width * ratio });
      }
    },
    setSplitDirection: (direction) => {
      const groups = dock.getSnapshot().panes;
      const first = groups[0] ? dock.group(groups[0].id) : undefined;
      if (first) {
        for (const pane of groups.slice(1)) {
          dock.group(pane.id)?.api.moveTo({
            group: first,
            position: direction === "horizontal" ? "right" : "bottom",
          });
        }
      }
    },
    closeSplit: () => {
      const id = other(dock.getSnapshot().focusedPaneId);
      if (id) {
        dock.merge(id);
      }
    },
    closePane: (id) => dock.merge(id),
    closePaneAndTabs: (id) => dock.closeMany(dock.group(id)?.panels.map((panel) => panel.id) ?? []),
    moveAllTabs: (id) => dock.merge(id),
    swapPanes: () => {
      const current = dock.group();
      const next = current ? other(current.id) : undefined;
      const destination = next ? dock.group(next) : undefined;
      if (current && destination) {
        current.api.moveTo({ group: destination, position: "right" });
      }
    },
  };
}
