import { useRef, useState, type JSX } from "react";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { DockviewGroupPanel } from "dockview-react";

export function DockPaneActions({
  group,
  dock,
}: {
  readonly group: DockviewGroupPanel;
  readonly dock: ReaderDockWorkspace;
}): JSX.Element {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const id = `reader-pane-menu-${group.id}`;
  const run = (action: () => void): void => {
    menu.current?.hidePopover();
    action();
  };
  return (
    <div className="dock-pane-menu">
      <button
        type="button"
        aria-label="Pane actions"
        title="Pane actions"
        popoverTarget={id}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(8, Math.min(bounds.bottom + 4, globalThis.innerHeight - 260)),
            left: Math.max(8, bounds.right - 245),
          });
        }}
      >
        ⋯
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="dock-pane-popover"
        style={position}
        role="group"
        aria-label="Pane actions"
      >
        <button
          type="button"
          disabled={group.api.location.type !== "grid"}
          onClick={() =>
            run(() => (group.api.isMaximized() ? group.api.exitMaximized() : group.api.maximize()))
          }
        >
          Maximize / restore pane
        </button>
        <button
          type="button"
          disabled={group.panels.length < 2}
          onClick={() =>
            run(() => {
              const panel = group.activePanel;
              if (panel) {
                dock.split(panel.id, "horizontal");
              }
            })
          }
        >
          Move tab to pane right
        </button>
        <button
          type="button"
          disabled={group.panels.length < 2}
          onClick={() =>
            run(() => {
              const panel = group.activePanel;
              if (panel) {
                dock.split(panel.id, "vertical");
              }
            })
          }
        >
          Move tab to pane below
        </button>
        <button type="button" onClick={() => run(() => dock.merge(group.id))}>
          Merge into another reading pane
        </button>
        <button
          type="button"
          onClick={() => run(() => dock.closeMany(group.panels.map(({ id }) => id)))}
        >
          Close pane and tabs…
        </button>
        <button type="button" onClick={() => run(() => dock.reset())}>
          Reset arrangement (keep tabs)
        </button>
      </div>
    </div>
  );
}
