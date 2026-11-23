import { mainStacks } from "@mdbase-dev/panels";

import { createLibraryWorkspaceTab, createWorkspaceTab } from "./source-workspace-layout.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { SourceWorkspaceActions } from "./source-workspace-controller.js";

/** Reader's command names, carried out on the panel workspace. */
export function panelWorkspaceActions(dock: ReaderPanelWorkspace): SourceWorkspaceActions {
  const other = (id: string): string | undefined =>
    dock.getSnapshot().panes.find((pane) => pane.id !== id)?.id;
  const closeExcept = (id: string, pane: string, rightOnly = false): void => {
    const tabs = dock.pane(pane)?.panels ?? [];
    const index = tabs.indexOf(id);
    dock.closeMany(
      tabs.filter(
        (panel, i) => panel !== id && !dock.tab(panel)?.pinned && (!rightOnly || i > index),
      ),
    );
  };
  const ofSource = (id: string): string[] =>
    dock
      .contentPanels()
      .filter((panel) => dock.tab(panel.id)?.sourceId === id)
      .map((panel) => panel.id);
  return {
    preview: (id, pane) => dock.open(id, "document", pane, true),
    open: (id, pane) => dock.open(id, "document", pane),
    openView: (id, view, pane) => {
      // A phone shows a source's note, annotations and citation as screens of its tab.
      if (view === "document" || dock.mobile) {
        dock.open(id, view, pane);
        return;
      }
      // Elsewhere they are the Notes panels, which show the source in front.
      dock.open(id, "document", pane);
      dock.showNotes(view);
    },
    openLibrary: (view, title, pane) => dock.openLibrary(view, title, pane),
    openLibraryTab: (view, title) => dock.openLibraryTab(view, title),
    openLibraryBeside: (view, title, direction) =>
      dock.beside(createLibraryWorkspaceTab(view, title), direction),
    activateTab: (id) => dock.activate(id),
    activate: (id) => {
      const panel = ofSource(id)[0];
      if (panel) {
        dock.activate(panel);
      }
    },
    promote: (id) => dock.patch(id, { preview: false }),
    pin: (id, _pane, pinned) => dock.patch(id, { pinned }),
    markDirty: (id, _pane, dirty) => dock.patch(id, { dirty }),
    close: (id) => dock.closeMany(ofSource(id)),
    closeTab: (id) => dock.close(id),
    closeOthers: (id, pane) => closeExcept(id, pane),
    closeToRight: (id, pane) => closeExcept(id, pane, true),
    reopenClosed: () => dock.reopen(),
    reorder: (pane, from, to) => {
      const panel = dock.pane(pane)?.panels[from];
      if (panel) {
        dock.move(panel, pane, to);
      }
    },
    navigate: (direction) => dock.navigate(direction),
    switchRelative: (direction) => dock.switchRelative(direction),
    focus: (pane) => dock.focusPane(pane),
    focusNextPane: () => dock.focusNext(),
    openBeside: (id, direction) => dock.beside(createWorkspaceTab(id, "document"), direction),
    splitTab: (id, _pane, direction) => dock.split(id, direction),
    moveTab: (id, _from, to, index) => dock.move(id, to, index),
    resizeSplit: (ratio) => {
      const root = dock.store.state.root;
      if (root?.type === "split" && root.children.length === 2) {
        dock.store.dispatch({ type: "resize", split: root.id, sizes: [ratio, 1 - ratio] });
      }
    },
    setSplitDirection: (direction) => {
      const [first, ...rest] = mainStacks(dock.store.state);
      if (first) {
        dock.store.dispatch({
          type: "batch",
          operations: rest.map((stack) => ({
            type: "moveStack" as const,
            stack: stack.id,
            target: {
              at: "root" as const,
              side: direction === "horizontal" ? ("right" as const) : ("bottom" as const),
            },
          })),
        });
      }
    },
    closeSplit: () => {
      const id = other(dock.getSnapshot().focusedPaneId);
      if (id) {
        dock.merge(id);
      }
    },
    closePane: (id) => dock.merge(id),
    closePaneAndTabs: (id) => dock.closeMany(dock.pane(id)?.panels ?? []),
    moveAllTabs: (id) => dock.merge(id),
    swapPanes: () => {
      const current = dock.pane();
      const next = current ? other(current.id) : undefined;
      if (current && next) {
        dock.store.dispatch({
          type: "moveStack",
          stack: current.id,
          target: { at: "split", stack: next, side: "right" },
        });
      }
    },
  };
}
