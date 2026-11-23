import { createLibraryWorkspaceTab, createWorkspaceTab } from "./source-workspace-layout.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { SourceWorkspaceActions } from "./source-workspace-controller.js";

/** Reader's command names, carried out on the panel workspace. */
export function panelWorkspaceActions(dock: ReaderPanelWorkspace): SourceWorkspaceActions {
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
    reopenClosed: () => dock.reopen(),
    navigate: (direction) => dock.navigate(direction),
    switchRelative: (direction) => dock.switchRelative(direction),
    focus: (pane) => dock.focusPane(pane),
    focusNextPane: () => dock.focusNext(),
    openBeside: (id, direction) => dock.beside(createWorkspaceTab(id, "document"), direction),
    closePane: (id) => dock.merge(id),
  };
}
