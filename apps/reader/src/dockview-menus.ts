import { panelTab } from "./dockview-workspace-state.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { IDockviewPanel, ReactContextMenuItemConfig } from "dockview-react";

/** Never use built-in close shortcuts: every close must pass Reader's dirty-tab guard. */
export function dockTabMenu(
  dock: ReaderDockWorkspace,
  panel: IDockviewPanel,
): ReactContextMenuItemConfig[] {
  const tab = panelTab(panel);
  const items: ReactContextMenuItemConfig[] = [
    { label: "Close", action: () => dock.close(panel.id) },
    {
      label: "Move to new pane right",
      disabled: panel.group.panels.length < 2,
      action: () => dock.split(panel.id, "horizontal"),
    },
    {
      label: "Move to new pane below",
      disabled: panel.group.panels.length < 2,
      action: () => dock.split(panel.id, "vertical"),
    },
    {
      label: "Maximize / restore pane",
      action: () => (panel.api.isMaximized() ? panel.api.exitMaximized() : panel.api.maximize()),
    },
  ];
  for (const group of dock.api?.groups ?? []) {
    if (group.id !== panel.group.id) {
      items.push({
        label: `Move to ${group.activePanel?.title ?? "pane"}`,
        action: () => dock.move(panel.id, group.id),
      });
    }
  }
  if (tab?.view === "document") {
    items.push({
      label: "Duplicate document in pane right",
      action: () => {
        dock.activate(panel.id);
        dock.beside(tab, "horizontal");
      },
    });
  }
  if (tab) {
    items.push(
      {
        label: tab.pinned ? "Unpin tab" : "Pin tab",
        action: () => dock.patch(panel.id, { pinned: !tab.pinned }),
      },
      {
        label: "Close unpinned tabs to the right",
        action: () =>
          dock.closeMany(
            panel.group.panels
              .slice(panel.group.panels.indexOf(panel) + 1)
              .filter((other) => !panelTab(other)?.pinned)
              .map(({ id }) => id),
          ),
      },
      {
        label: "Close other unpinned tabs",
        action: () =>
          dock.closeMany(
            panel.group.panels
              .filter((other) => other.id !== panel.id && !panelTab(other)?.pinned)
              .map(({ id }) => id),
          ),
      },
    );
  }
  items.push({ label: "Reset pane arrangement (keep tabs)", action: () => dock.reset() });
  return items;
}
