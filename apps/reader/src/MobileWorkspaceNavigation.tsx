import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Select } from "@mdbase-dev/ui/select";

import { BackIcon } from "./icons.js";

import type { ReaderPanelWorkspace } from "./panel-workspace.js";
import type { JSX } from "react";

/**
 * Whether a phone is showing a source's document or tools. The header then carries the source's
 * own navigation, so the workspace needs no row of its own.
 */
export function mobileSourceActive(dock: ReaderPanelWorkspace): boolean {
  return dock.mobile && dock.activeTab()?.kind === "source";
}

/** Returns to the library tab already open, or opens one. */
export function backToLibrary(dock: ReaderPanelWorkspace): void {
  const library = dock.contentPanels().find((panel) => dock.tab(panel.id)?.kind === "library");
  if (library) {
    dock.activate(library.id);
  } else {
    dock.openLibrary();
  }
}

/** Closes the active tab, unless it is the library, which is home. */
export function closeActiveTab(dock: ReaderPanelWorkspace): void {
  const current = dock.activeTab();
  if (current && current.kind !== "library") {
    dock.close(current.id);
  }
}

/** On a phone, open tabs share one screen; this names the current one and switches between them. */
export function WorkspaceTabSwitcher({
  dock,
}: {
  readonly dock: ReaderPanelWorkspace;
}): JSX.Element {
  const { t } = useLingui();
  const active = dock.activePanel();
  const tabs = dock.contentPanels();
  return (
    <div className="mobile-tab-switcher">
      <Select
        aria-label={t({ message: "Open workspace tab" })}
        className="is-quiet"
        disabled={!tabs.length}
        value={active?.id ?? ""}
        options={tabs.map((panel) => ({
          value: panel.id,
          label: `${panel.title ?? ""}${dock.tab(panel.id)?.dirty ? translate({ message: " — unsaved changes" }) : ""}`,
        }))}
        onChange={(id) => dock.activate(id)}
      />
      {tabs.length > 1 ? (
        <span className="mobile-tab-count" title={t`${String(tabs.length)} open tabs`}>
          {tabs.length}
          <span className="sr-only">
            <Trans> open tabs</Trans>
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function MobileWorkspaceNavigation({
  dock,
}: {
  readonly dock: ReaderPanelWorkspace;
}): JSX.Element | null {
  const { t } = useLingui();
  if (!dock.mobile || mobileSourceActive(dock)) {
    return null;
  }
  const active = dock.activePanel();
  const side = active && !dock.tab(active.id);
  const tabs = dock.contentPanels();
  if (side) {
    return (
      <nav
        className="mobile-workspace-navigation"
        aria-label={t({ message: "Mobile workspace navigation" })}
      >
        <button
          className="mobile-back"
          type="button"
          aria-label={t({ message: "Back to workspace" })}
          disabled={!tabs.length}
          onClick={dock.backToContent}
        >
          <BackIcon />
          <span>
            <Trans context="MobileWorkspaceNavigation interface">Back</Trans>
          </span>
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
    <nav
      className="mobile-workspace-navigation"
      aria-label={t({ message: "Mobile workspace navigation" })}
    >
      <WorkspaceTabSwitcher dock={dock} />
    </nav>
  );
}
