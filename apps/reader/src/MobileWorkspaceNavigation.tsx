import { panelTab } from "./dockview-workspace-state.js";
import { BackIcon, ChevronDownIcon, CloseIcon } from "./icons.js";

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
  if (side) {
    return (
      <nav className="mobile-workspace-navigation" aria-label="Mobile workspace navigation">
        <button
          className="mobile-back"
          type="button"
          aria-label="Back to workspace"
          disabled={!tabs.length}
          onClick={dock.backToContent}
        >
          <BackIcon />
          <span>Back</span>
        </button>
        <strong>{active.title}</strong>
      </nav>
    );
  }
  const activeTab = active ? panelTab(active) : undefined;
  // The library is home: alone, its own view title is the heading, and it is never closed.
  if (activeTab?.kind === "library" && tabs.length === 1) {
    return null;
  }
  return (
    <nav className="mobile-workspace-navigation" aria-label="Mobile workspace navigation">
      <label className="mobile-tab-switcher">
        <select
          aria-label="Open workspace tab"
          disabled={!tabs.length}
          value={active?.id ?? ""}
          onChange={(event) => dock.activate(event.currentTarget.value)}
        >
          {tabs.map((panel) => (
            <option key={panel.id} value={panel.id}>
              {panel.title}
              {panelTab(panel)?.dirty ? " — unsaved changes" : ""}
            </option>
          ))}
        </select>
        {tabs.length > 1 ? <span className="mobile-tab-count">{tabs.length}</span> : null}
        <ChevronDownIcon aria-hidden="true" />
      </label>
      {active && activeTab?.kind !== "library" ? (
        <button
          className="icon-button"
          type="button"
          aria-label="Close current tab"
          onClick={() => {
            const current = dock.api?.activePanel;
            if (current && panelTab(current)) {
              dock.close(current.id);
            }
          }}
        >
          <CloseIcon />
        </button>
      ) : null}
    </nav>
  );
}
