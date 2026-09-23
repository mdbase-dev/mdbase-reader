import {
  AreaIcon,
  CitationIcon,
  DownloadIcon,
  FocusIcon,
  HighlightIcon,
  MoreIcon,
  NoteIcon,
} from "./icons.js";
import { Menu } from "./Menu.js";
import { DocumentStatus } from "./WorkspacePaneSupport.js";

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
  onToggleFocus,
  onToggleAreaSelection,
}: DocumentContextualToolbarProps): JSX.Element {
  return (
    <div className="document-toolbar" aria-label="Document actions">
      {canSelectArea ? (
        <button
          type="button"
          className={selectingArea ? "document-area-action is-active" : "document-area-action"}
          aria-pressed={selectingArea}
          title={selectingArea ? "Cancel area selection" : "Select an area to annotate"}
          onClick={onToggleAreaSelection}
        >
          <AreaIcon />
          <span>{selectingArea ? "Cancel" : "Select area"}</span>
        </button>
      ) : null}
      <DocumentStatus reading={readingResume} decorationProblem={decorationProblem} />
      <Menu
        className="document-actions-menu"
        label="More document actions"
        title="More actions"
        trigger={<MoreIcon />}
      >
        <button type="button" onClick={() => workspace.openView(source.id, "annotations", pane.id)}>
          <HighlightIcon /> Annotations
        </button>
        <button type="button" onClick={() => workspace.openView(source.id, "note", pane.id)}>
          <NoteIcon /> Source note
        </button>
        <button type="button" onClick={() => workspace.openView(source.id, "citation", pane.id)}>
          <CitationIcon /> Citation
        </button>
        <hr />
        <button type="button" onClick={() => workspace.openBeside(source.id, "note")}>
          <NoteIcon /> Open note beside
        </button>
        <button
          type="button"
          className={focusMode ? "is-active" : undefined}
          onClick={onToggleFocus}
        >
          <FocusIcon /> {focusMode ? "Exit focus mode" : "Focus on document"}
        </button>
        <button
          type="button"
          disabled={!sourceExport.available || sourceExport.status === "exporting"}
          onClick={sourceExport.run}
        >
          <DownloadIcon />
          {sourceExport.status === "exporting" ? "Preparing export…" : "Export source"}
        </button>
        {sourceExport.message ? (
          <p className={`menu-note${sourceExport.status === "error" ? " is-error" : ""}`}>
            {sourceExport.message}
          </p>
        ) : null}
      </Menu>
    </div>
  );
}
