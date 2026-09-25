import { useMemo } from "react";

import {
  AreaIcon,
  BookmarkIcon,
  CitationIcon,
  DownloadIcon,
  HighlightIcon,
  ListIcon,
  MoreIcon,
  NoteIcon,
  ReadingModeIcon,
} from "./icons.js";
import { Menu } from "./Menu.js";
import { DocumentStatus } from "./WorkspacePaneSupport.js";

import type { SourceWorkspacePane } from "./source-workspace-layout.js";
import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceWorkspaceController } from "./use-source-workspace.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { ContentsCapability, ReadingSurface } from "@mdbase-reader/reading-surface";
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
  readonly canBookmark: boolean;
  readonly bookmarking: boolean;
  readonly sourceExport: SourceExportController;
  readonly onToggleFocus: () => void;
  readonly onToggleAreaSelection: () => void;
  readonly onBookmark: () => void;
  readonly surfaces: ReadonlyMap<string, ReadingSurface>;
  readonly sessionId: string;
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
  canBookmark,
  bookmarking,
  sourceExport,
  onToggleFocus,
  onToggleAreaSelection,
  onBookmark,
  surfaces,
  sessionId,
}: DocumentContextualToolbarProps): JSX.Element {
  const contents = surfaces.get(sessionId)?.capabilities.contents;
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
      {canBookmark ? (
        <button
          type="button"
          className="icon-button document-bookmark-action"
          aria-label="Bookmark this position"
          title="Bookmark this position"
          disabled={bookmarking}
          onClick={onBookmark}
        >
          <BookmarkIcon />
        </button>
      ) : null}
      <DocumentStatus reading={readingResume} decorationProblem={decorationProblem} />
      {contents ? <ContentsMenu contents={contents} /> : null}
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
          <NoteIcon /> Literature note
        </button>
        <button type="button" onClick={() => workspace.openView(source.id, "citation", pane.id)}>
          <CitationIcon /> Citation
        </button>
        <hr />
        <button type="button" onClick={() => workspace.openBeside(source.id, "note")}>
          <NoteIcon /> Open literature note beside
        </button>
        <button
          type="button"
          className={focusMode ? "is-active" : undefined}
          onClick={onToggleFocus}
        >
          <ReadingModeIcon /> {focusMode ? "Leave reading mode" : "Reading mode"}
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

function ContentsMenu({ contents }: { readonly contents: ContentsCapability }): JSX.Element {
  const entries = useMemo(() => contents.entries(), [contents]);
  return (
    <Menu
      className="document-contents-menu"
      label="Contents"
      title="Contents"
      trigger={<ListIcon />}
    >
      <span className="menu-label">Contents</span>
      <div className="document-contents-list">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            style={{ paddingLeft: `${String(9 + Math.min(entry.level, 3) * 14)}px` }}
            onClick={() => void contents.goTo(entry.id)}
          >
            {entry.title}
          </button>
        ))}
      </div>
    </Menu>
  );
}
