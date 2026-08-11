import { AreaIcon, BackIcon, CitationIcon, FocusIcon, HighlightIcon, NoteIcon } from "./icons.js";
import { canNavigateHistory } from "./source-workspace-history.js";
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
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly sourceExport: SourceExportController;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
  readonly onToggleAreaSelection: () => void;
}

export function DocumentContextualToolbar({
  source,
  pane,
  workspace,
  focusMode,
  readingResume,
  decorationProblem,
  canSelectArea,
  selectingArea,
  sourceExport,
  onBackToLibrary,
  onToggleFocus,
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
        <button
          type="button"
          aria-label="Back"
          title="Back · Alt+Left"
          disabled={!canNavigateHistory(pane, -1)}
          onClick={() => workspace.navigate(-1, pane.id)}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward · Alt+Right"
          disabled={!canNavigateHistory(pane, 1)}
          onClick={() => workspace.navigate(1, pane.id)}
        >
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
        <details className="toolbar-menu source-tool-menu">
          <summary>Tools</summary>
          <div>
            <button
              type="button"
              onClick={() => workspace.openView(source.id, "annotations", pane.id)}
            >
              <HighlightIcon /> Annotations
            </button>
            <button type="button" onClick={() => workspace.openView(source.id, "note", pane.id)}>
              <NoteIcon /> Source note
            </button>
            <button
              type="button"
              onClick={() => workspace.openView(source.id, "citation", pane.id)}
            >
              <CitationIcon /> Citation
            </button>
            <i />
            <button type="button" onClick={() => workspace.openBeside(source.id, "note")}>
              Open note beside
            </button>
          </div>
        </details>
        <button
          type="button"
          className={focusMode ? "tool-button is-active" : "tool-button"}
          aria-label="Toggle focus mode"
          title={`${focusMode ? "Exit" : "Enter"} focus mode · Esc to exit`}
          onClick={onToggleFocus}
        >
          <FocusIcon />
          <span className="tool-label">Focus</span>
        </button>
        <SourceActions sourceExport={sourceExport} />
      </div>
    </div>
  );
}
