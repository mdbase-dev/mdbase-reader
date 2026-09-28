import { Select } from "@mdbase-dev/ui/select";

import { panelTab } from "./dockview-workspace-state.js";
import { BackIcon } from "./icons.js";

import type { ReaderDockWorkspace } from "./dockview-workspace.js";
import type { JSX } from "react";

/**
 * Whether a phone is showing a source's document or tools. The header then carries the source's
 * own navigation, so the workspace needs no row of its own.
 */
export function mobileSourceActive(dock: ReaderDockWorkspace): boolean {
  const active = dock.mobile ? dock.api?.activePanel : undefined;
  return panelTab(active)?.kind === "source";
}

/** Returns to the library tab already open, or opens one. */
export function backToLibrary(dock: ReaderDockWorkspace): void {
  const library = dock.contentPanels().find((panel) => panelTab(panel)?.kind === "library");
  if (library) {
    dock.activate(library.id);
  } else {
    dock.openLibrary();
  }
}

/** Closes the active tab, unless it is the library, which is home. */
export function closeActiveTab(dock: ReaderDockWorkspace): void {
  const current = dock.api?.activePanel;
  if (current && panelTab(current) && panelTab(current)?.kind !== "library") {
    dock.close(current.id);
  }
}

/** On a phone, open tabs share one screen; this names the current one and switches between them. */
export function WorkspaceTabSwitcher({
  dock,
}: {
  readonly dock: ReaderDockWorkspace;
}): JSX.Element {
  const active = dock.api?.activePanel;
  const tabs = dock.contentPanels();
  return (
    <div className="mobile-tab-switcher">
      <Select
        aria-label="Open workspace tab"
        className="is-quiet"
        disabled={!tabs.length}
        value={active?.id ?? ""}
        options={tabs.map((panel) => ({
          value: panel.id,
          label: `${panel.title ?? ""}${panelTab(panel)?.dirty ? " — unsaved changes" : ""}`,
        }))}
        onChange={(id) => dock.activate(id)}
      />
      {tabs.length > 1 ? (
        <span className="mobile-tab-count" title={`${String(tabs.length)} open tabs`}>
          {tabs.length}
          <span className="sr-only"> open tabs</span>
        </span>
      ) : null}
    </div>
  );
}

export function MobileWorkspaceNavigation({
  dock,
}: {
  readonly dock: ReaderDockWorkspace;
}): JSX.Element | null {
  if (!dock.mobile || mobileSourceActive(dock)) {
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
  // The library is home: alone, its own view title is the heading, and it is never closed.
  if (tabs.length === 1) {
    return null;
  }
  return (
    <nav className="mobile-workspace-navigation" aria-label="Mobile workspace navigation">
      <WorkspaceTabSwitcher dock={dock} />
    </nav>
  );
}
