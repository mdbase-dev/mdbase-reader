import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState, type JSX } from "react";

import { LayoutIcon } from "./icons.js";
import { arrangementItems } from "./panel-menus.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { StackInfo } from "@mdbase-dev/panels/react";

/** The menu at the end of a pane's tab strip. */
export function PaneActions({
  info,
  dock,
}: {
  readonly info: StackInfo;
  readonly dock: ReaderPanelWorkspace;
}): JSX.Element {
  const { t } = useLingui();
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const { stack } = info;
  const id = `reader-pane-menu-${stack.id}`;
  const run = (action: () => void): void => {
    menu.current?.hidePopover();
    action();
  };
  const active = stack.active;
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
            top: Math.max(8, Math.min(bounds.bottom + 4, globalThis.innerHeight - 420)),
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
          disabled={info.edge !== null}
          onClick={() =>
            run(() =>
              dock.store.dispatch({ type: "maximize", stack: info.maximized ? null : stack.id }),
            )
          }
        >
          <Trans>Maximize / restore pane</Trans>
        </button>
        <button
          type="button"
          disabled={stack.panels.length < 2 || !active}
          onClick={() => run(() => active && dock.split(active, "horizontal"))}
        >
          <Trans>Move tab to pane right</Trans>
        </button>
        <button
          type="button"
          disabled={stack.panels.length < 2 || !active}
          onClick={() => run(() => active && dock.split(active, "vertical"))}
        >
          <Trans>Move tab to pane below</Trans>
        </button>
        <button type="button" onClick={() => run(() => dock.merge(stack.id))}>
          <Trans>Merge into another reading pane</Trans>
        </button>
        <button type="button" onClick={() => run(() => dock.closeMany(stack.panels))}>
          <Trans>Close pane and tabs…</Trans>
        </button>
        {arrangementItems(dock).map((item) => (
          <button
            key={item.label}
            type="button"
            className={item.separated ? "is-separated" : undefined}
            disabled={item.disabled}
            onClick={() => run(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
