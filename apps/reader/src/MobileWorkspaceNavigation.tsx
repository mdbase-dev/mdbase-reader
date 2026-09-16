import { panelTab } from "./dockview-workspace-state.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { JSX } from "react";

export function MobileWorkspaceNavigation({
  dock,
}: {
  readonly dock: ReaderDockWorkspace;
}): JSX.Element | null {
  if (!dock.mobile) {
    return null;
  }
  const active = dock.api?.activePanel;
  const side = active && !panelTab(active);
  const tabs = dock.contentPanels();
  return (
    <nav className="mobile-workspace-navigation" aria-label="Mobile workspace navigation">
      {side ? (
        <button type="button" disabled={!tabs.length} onClick={dock.backToContent}>
          Back to workspace
        </button>
      ) : (
        <span>Open tab</span>
      )}
      <select
        aria-label="Open workspace tab"
        disabled={!tabs.length}
        value={side ? "" : (active?.id ?? "")}
        onChange={(event) => dock.activate(event.currentTarget.value)}
      >
        {side ? (
          <option value="" disabled>
            {active.title}
          </option>
        ) : null}
        {tabs.map((panel) => (
          <option key={panel.id} value={panel.id}>
            {panel.title}
            {panelTab(panel)?.dirty ? " — unsaved changes" : ""}
          </option>
        ))}
      </select>
      {!side && active ? (
        <button
          type="button"
          aria-label="Close current tab"
          onClick={() => {
            const current = dock.api?.activePanel;
            if (current && panelTab(current)) {
              dock.close(current.id);
            }
          }}
        >
          Close
        </button>
      ) : null}
    </nav>
  );
}
