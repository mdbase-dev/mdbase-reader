import { panelTab } from "./dockview-workspace-state.js";
import { DocumentContextualToolbar } from "./DocumentContextualToolbar.js";
import { CloseIcon } from "./icons.js";
import {
  WorkspaceTabSwitcher,
  backToLibrary,
  closeActiveTab,
  mobileSourceActive,
} from "./MobileWorkspaceNavigation.js";

import type { ReaderHeaderSourceBar } from "./ReaderHeader.js";
import type { ReaderWorkspaceViewModel } from "./ReaderWorkspaceView.js";

/**
 * The phone header's contents while a source is showing: its tabs, and for a document the
 * actions that sit in a desktop pane's tab strip. Undefined elsewhere, for the full header.
 */
export function mobileSourceBar(
  model: ReaderWorkspaceViewModel,
): ReaderHeaderSourceBar | undefined {
  const { sourceWorkspace: workspace, composer } = model;
  const dock = workspace.dock;
  const tab = mobileSourceActive(dock) ? panelTab(dock.api?.activePanel) : null;
  if (tab?.kind !== "source") {
    return undefined;
  }
  const source = model.library.sources.find(({ id }) => id === tab.sourceId);
  const pane =
    workspace.layout.panes.find((candidate) => candidate.tabs.some(({ id }) => id === tab.id)) ??
    workspace.activePane;
  return {
    onBack: () => backToLibrary(dock),
    switcher: <WorkspaceTabSwitcher dock={dock} />,
    actions: (
      <>
        {tab.view === "document" && source?.documents.length ? (
          <DocumentContextualToolbar
            source={source}
            pane={pane}
            workspace={workspace}
            focusMode={model.focusMode}
            readingResume={model.readingResume}
            decorationProblem={model.decorationProblem}
            canSelectArea={composer.canSelectArea}
            selectingArea={composer.selectingArea}
            onToggleAreaSelection={composer.toggleAreaSelection}
            canBookmark={composer.canBookmark}
            bookmarking={composer.bookmarking}
            onBookmark={composer.bookmark}
            sourceExport={model.sourceExport}
            onToggleFocus={() => model.setFocusMode((value) => !value)}
            surfaces={model.surfaces}
            sessionId={tab.id}
            compact
          />
        ) : null}
        <button
          type="button"
          className="icon-button"
          aria-label="Close current tab"
          title="Close tab"
          onClick={() => closeActiveTab(dock)}
        >
          <CloseIcon />
        </button>
      </>
    ),
  };
}
