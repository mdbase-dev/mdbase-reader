import { AreaIcon, BackIcon, FocusIcon, PanelIcon } from "./icons.js";
import { sourceFormat } from "./SourceTabStrip.js";
import { DocumentStatus, SourceActions } from "./WorkspacePaneSupport.js";

import type { SourceWorkspacePane } from "./source-workspace-layout.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX } from "react";

export interface DocumentContextualToolbarProps {
  readonly source: SourceSummary;
  readonly pane: SourceWorkspacePane;
  readonly workspace: SourceWorkspaceController;
  readonly focusMode: boolean;
  readonly inspectorOpen: boolean;
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly sourceExport: SourceExportController;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
  readonly onToggleInspector: () => void;
  readonly onToggleAreaSelection: () => void;
}

export function DocumentContextualToolbar({
  source,
  pane,
  workspace,
  focusMode,
  inspectorOpen,
  readingResume,
  decorationProblem,
  canSelectArea,
  selectingArea,
  sourceExport,
  onBackToLibrary,
  onToggleFocus,
  onToggleInspector,
  onToggleAreaSelection,
}: DocumentContextualToolbarProps): JSX.Element {
  return (
    <div className="document-toolbar">
      <button
        className="mobile-back icon-button"
        type="button"
        aria-label="Back to library"
        onClick={onBackToLibrary}
      >
        <BackIcon />
      </button>
      <div className="document-history">
        <button type="button" title="Back" onClick={() => workspace.navigate(-1, pane.id)}>
          ‹
        </button>
        <button type="button" title="Forward" onClick={() => workspace.navigate(1, pane.id)}>
          ›
        </button>
      </div>
      <div className="document-identity">
        <strong>{source.title}</strong>
        <span>
          {source.creators.join(", ") || "Unknown creator"} · {sourceFormat(source)}
        </span>
      </div>
      <DocumentStatus reading={readingResume} decorationProblem={decorationProblem} />
      <div className="document-tools">
        <details className="toolbar-menu">
          <summary>View</summary>
          <div>
            <button type="button" onClick={onToggleFocus}>
              {focusMode ? "Exit focus mode" : "Focus mode"}
            </button>
            <button type="button" onClick={onToggleInspector}>
              {inspectorOpen ? "Hide workspace" : "Show workspace"}
            </button>
          </div>
        </details>
        {canSelectArea ? (
          <details className="toolbar-menu">
            <summary>Annotate</summary>
            <div>
              <button
                type="button"
                className={selectingArea ? "is-active" : undefined}
                onClick={onToggleAreaSelection}
              >
                <AreaIcon /> {selectingArea ? "Cancel area selection" : "Select area"}
              </button>
            </div>
          </details>
        ) : null}
        <button
          type="button"
          className={inspectorOpen ? "tool-button is-active" : "tool-button"}
          aria-label="Toggle source workspace"
          onClick={onToggleInspector}
        >
          <PanelIcon />
        </button>
        <button
          type="button"
          className={focusMode ? "tool-button is-active" : "tool-button"}
          aria-label="Toggle focus mode"
          onClick={onToggleFocus}
        >
          <FocusIcon />
        </button>
        <SourceActions sourceExport={sourceExport} />
      </div>
    </div>
  );
}
