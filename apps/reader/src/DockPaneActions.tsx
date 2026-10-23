import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState, type JSX } from "react";

import { LayoutIcon } from "./icons.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { DockviewGroupPanel } from "dockview-react";

export function DockPaneActions({
  group,
  dock,
}: {
  readonly group: DockviewGroupPanel;
  readonly dock: ReaderDockWorkspace;
}): JSX.Element {
  const { t } = useLingui();
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
        aria-label={t({ message: "Pane actions", context: "DockPaneActions interface" })}
        title={t({ message: "Pane actions", context: "DockPaneActions interface" })}
        popoverTarget={id}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            top: Math.max(8, Math.min(bounds.bottom + 4, globalThis.innerHeight - 260)),
            left: Math.max(8, bounds.right - 245),
          });
        }}
      >
        <LayoutIcon />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        className="dock-pane-popover"
        style={position}
        role="group"
        aria-label={t({ message: "Pane actions", context: "DockPaneActions interface" })}
      >
        <button
          type="button"
          disabled={group.api.location.type !== "grid"}
          onClick={() =>
            run(() => (group.api.isMaximized() ? group.api.exitMaximized() : group.api.maximize()))
          }
        >
          <Trans>Maximize / restore pane</Trans>
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
          <Trans>Move tab to pane right</Trans>
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
          <Trans>Move tab to pane below</Trans>
        </button>
        <button type="button" onClick={() => run(() => dock.merge(group.id))}>
          <Trans>Merge into another reading pane</Trans>
        </button>
        <button
          type="button"
          onClick={() => run(() => dock.closeMany(group.panels.map(({ id }) => id)))}
        >
          <Trans>Close pane and tabs…</Trans>
        </button>
        <button type="button" onClick={() => run(() => dock.reset())}>
          <Trans>Reset arrangement (keep tabs)</Trans>
        </button>
      </div>
    </div>
  );
}
