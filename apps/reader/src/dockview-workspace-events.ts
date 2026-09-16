import type { DockviewSidePanels } from "./dockview-side-panels.js";
import type { DockviewWorkspaceSnapshot } from "./dockview-workspace-snapshot.js";
import type { DockviewApi } from "dockview-react";

/** Native event bridge: reconstruction must never masquerade as user navigation. */
export function watchDockEvents(
  api: DockviewApi,
  sides: DockviewSidePanels,
  state: DockviewWorkspaceSnapshot,
  changingMode: () => boolean,
  mobile: () => boolean,
): { dispose(): void }[] {
  return [
    api.onDidLayoutChange(state.schedule),
    api.onDidActivePanelChange(({ panel }) => {
      if (changingMode()) {
        return;
      }
      state.visit(panel);
      state.schedule();
    }),
    api.onDidMovePanel(state.schedule),
    api.onDidActiveGroupChange((group) => {
      if (
        !changingMode() &&
        !mobile() &&
        (sides.singlePane || api.hasMaximizedGroup()) &&
        group?.api.location.type === "grid" &&
        !group.api.isMaximized()
      ) {
        group.api.maximize();
      }
      state.schedule();
    }),
    api.onDidMaximizedGroupChange(() => {
      if (!changingMode()) {
        sides.syncFocus();
      }
      state.schedule();
    }),
  ];
}
