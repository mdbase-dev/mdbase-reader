import { t } from "@lingui/core/macro";

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
      label: t({ message: "Move to new pane right" }),
      disabled: panel.group.panels.length < 2,
      action: () => dock.split(panel.id, "horizontal"),
    },
    {
      label: t({ message: "Move to new pane below" }),
      disabled: panel.group.panels.length < 2,
      action: () => dock.split(panel.id, "vertical"),
    },
    {
      label: t({ message: "Maximize / restore pane" }),
      disabled: panel.group.api.location.type !== "grid",
      action: () => (panel.api.isMaximized() ? panel.api.exitMaximized() : panel.api.maximize()),
    },
  ];
  for (const group of dock.api?.groups ?? []) {
    if (group.id !== panel.group.id) {
      items.push({
        label: t`Move to ${group.activePanel?.title ?? (group.api.location.type === "edge" ? `${group.api.location.position} sidebar` : "pane")}`,
        action: () => dock.move(panel.id, group.id),
      });
    }
  }
  if (tab && ["document", "note", "annotations"].includes(tab.view)) {
    items.push({
      label:
        tab.view === "document"
          ? t({ message: "Duplicate document in pane right" })
          : t({ message: "Open another editor in pane right" }),
      action: () => {
        dock.activate(panel.id);
        dock.beside(tab, "horizontal");
      },
    });
  }
  if (tab) {
    items.push(
      {
        label: tab.pinned
          ? t({ message: "Unpin tab", context: "dockview menus" })
          : t({ message: "Pin tab", context: "dockview menus" }),
        action: () => dock.patch(panel.id, { pinned: !tab.pinned }),
      },
      {
        label: t({ message: "Close unpinned tabs to the right" }),
        action: () =>
          dock.closeMany(
            panel.group.panels
              .slice(panel.group.panels.indexOf(panel) + 1)
              .filter((other) => !panelTab(other)?.pinned)
              .map(({ id }) => id),
          ),
      },
      {
        label: t({ message: "Close other unpinned tabs" }),
        action: () =>
          dock.closeMany(
            panel.group.panels
              .filter((other) => other.id !== panel.id && !panelTab(other)?.pinned)
              .map(({ id }) => id),
          ),
      },
    );
  }
  items.push({
    label: t({ message: "Reset pane arrangement (keep tabs)" }),
    action: () => dock.reset(),
  });
  return items;
}
