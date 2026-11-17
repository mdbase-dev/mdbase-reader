import { t as translate } from "@lingui/core/macro";
import { allStacks, edgeOfStack, mainStacks, type PanelDescriptor } from "@mdbase-dev/panels";

import { canFollow } from "./panel-workspace-state.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { WorkspaceTab } from "./source-workspace-layout.js";
import type { MenuItem } from "@mdbase-dev/panels/react";

/** Every close goes through Reader's own guard for unsaved changes. */
export function tabMenu(dock: ReaderPanelWorkspace, panel: PanelDescriptor): MenuItem[] {
  const tab = dock.tab(panel.id);
  const state = dock.store.state;
  const stack = dock.paneOf(panel.id);
  const siblings = stack?.panels ?? [];
  const main = Boolean(stack && mainStacks(state).some(({ id }) => id === stack.id));
  const items: MenuItem[] = [
    {
      label: translate({ message: "Close", context: "Close workspace tab" }),
      action: () => dock.close(panel.id),
    },
    {
      label: translate({ message: "Move to new pane right" }),
      disabled: siblings.length < 2,
      action: () => dock.split(panel.id, "horizontal"),
    },
    {
      label: translate({ message: "Move to new pane below" }),
      disabled: siblings.length < 2,
      action: () => dock.split(panel.id, "vertical"),
    },
    {
      label: translate({ message: "Maximize / restore pane" }),
      disabled: !main,
      action: () =>
        dock.store.dispatch({
          type: "maximize",
          stack: state.maximized === stack?.id ? null : (stack?.id ?? null),
        }),
    },
  ];
  for (const other of allStacks(state)) {
    if (other.id !== stack?.id && other.panels.length) {
      const active = other.active ? state.panels[other.active] : undefined;
      items.push({
        label: active?.title
          ? translate`Move to ${active.title}`
          : moveToSideLabel(edgeOfStack(state, other.id)),
        action: () => dock.move(panel.id, other.id),
      });
    }
  }
  if (tab) {
    items.push(...ownItems(dock, panel.id, tab, siblings));
  }
  items.push(...arrangementItems(dock));
  return items;
}

/** What a tab can do about itself: open beside, pin, follow, and close its neighbours. */
function ownItems(
  dock: ReaderPanelWorkspace,
  id: string,
  tab: WorkspaceTab,
  siblings: readonly string[],
): MenuItem[] {
  const items: MenuItem[] = [];
  if (["document", "note", "annotations"].includes(tab.view)) {
    items.push({
      label: translate({ message: "Open beside" }),
      action: () => {
        dock.activate(id);
        dock.beside(tab, "horizontal");
      },
    });
  }
  const index = siblings.indexOf(id);
  const unpinned = (ids: readonly string[]): string[] =>
    ids.filter((other) => other !== id && !dock.tab(other)?.pinned);
  items.push(
    {
      label: tab.pinned
        ? translate({ message: "Unpin tab", context: "dockview menus" })
        : translate({ message: "Pin tab", context: "dockview menus" }),
      action: () => dock.patch(id, { pinned: !tab.pinned }),
      separated: true,
    },
    ...(canFollow(tab)
      ? [
          {
            label: tab.follow
              ? translate({ message: "Stop following the active document" })
              : translate({ message: "Follow the active document" }),
            action: () => dock.setFollow(id, !tab.follow),
          },
        ]
      : []),
    {
      label: translate({ message: "Close unpinned tabs to the right" }),
      action: () => dock.closeMany(unpinned(siblings.slice(index + 1))),
    },
    {
      label: translate({ message: "Close other unpinned tabs" }),
      action: () => dock.closeMany(unpinned(siblings)),
    },
  );
  return items;
}

/** Ways of looking at the whole workspace: the same items end every tab and pane menu. */
export function arrangementItems(dock: ReaderPanelWorkspace): MenuItem[] {
  const views: MenuItem[] = [
    {
      label: translate({ message: "Fit panes to the window" }),
      action: () => dock.setView("tiling"),
      disabled: dock.view === "tiling",
      separated: true,
    },
    {
      label: translate({ message: "Scroll panes as columns" }),
      action: () => dock.setView("columns"),
      disabled: dock.view === "columns",
    },
    {
      label: translate({ message: "Arrange panes on a canvas" }),
      action: () => dock.setView("canvas"),
      disabled: dock.view === "canvas",
    },
  ];
  return [
    ...views,
    {
      label: translate({ message: "Show all tabs at once" }),
      action: () => dock.setOverview(true),
    },
    {
      label: translate({ message: "Undo arrangement change" }),
      disabled: !dock.canUndo,
      action: dock.undo,
    },
    {
      label: translate({ message: "Redo arrangement change" }),
      disabled: !dock.canRedo,
      action: dock.redo,
    },
    {
      label: translate({ message: "Reset pane arrangement (keep tabs)" }),
      action: () => dock.reset(),
    },
  ];
}

function moveToSideLabel(side: ReturnType<typeof edgeOfStack>): string {
  switch (side) {
    case "left":
      return translate({ message: "Move to left sidebar", context: "Workspace tab destination" });
    case "right":
      return translate({ message: "Move to right sidebar", context: "Workspace tab destination" });
    case "top":
      return translate({ message: "Move to top sidebar", context: "Workspace tab destination" });
    case "bottom":
      return translate({ message: "Move to bottom sidebar", context: "Workspace tab destination" });
    case null:
      return translate({ message: "Move to pane", context: "Workspace tab destination" });
  }
}
