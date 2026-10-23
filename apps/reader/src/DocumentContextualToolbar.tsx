import { Trans, useLingui } from "@lingui/react/macro";
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
  TrashIcon,
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
  /** Asks to remove the source, which confirms first; null when the collection cannot. */
  readonly onRemoveSource?: ((source: SourceSummary) => void) | null;
  readonly onToggleFocus: () => void;
  readonly onToggleAreaSelection: () => void;
  readonly onBookmark: () => void;
  readonly surfaces: ReadonlyMap<string, ReadingSurface>;
  readonly sessionId: string;
  /** In a phone's header, where room is short, bookmarking moves into the overflow menu. */
  readonly compact?: boolean;
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
  onRemoveSource = null,
  onToggleFocus,
  onToggleAreaSelection,
  onBookmark,
  surfaces,
  sessionId,
  compact = false,
}: DocumentContextualToolbarProps): JSX.Element {
  const { t } = useLingui();
  const contents = surfaces.get(sessionId)?.capabilities.contents;
  return (
    <div
      className="document-toolbar"
      aria-label={t({
        message: "Document actions",
        context: "DocumentContextualToolbar interface",
      })}
    >
      {canSelectArea ? (
        <button
          type="button"
          className={selectingArea ? "document-area-action is-active" : "document-area-action"}
          aria-pressed={selectingArea}
          title={
            selectingArea
              ? t({ message: "Cancel area selection" })
              : t({ message: "Select an area to annotate" })
          }
          onClick={onToggleAreaSelection}
        >
          <AreaIcon />
          <span>
            {selectingArea
              ? t({ message: "Cancel", context: "DocumentContextualToolbar interface" })
              : t({ message: "Select area", context: "DocumentContextualToolbar interface" })}
          </span>
        </button>
      ) : null}
      {canBookmark && !compact ? (
        <button
          type="button"
          className="icon-button document-bookmark-action"
          aria-label={t({ message: "Bookmark this position" })}
          title={t({ message: "Bookmark this position" })}
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
        label={t({ message: "More document actions" })}
        title={t({ message: "More actions", context: "DocumentContextualToolbar interface" })}
        trigger={<MoreIcon />}
      >
        {canBookmark && compact ? (
          <BookmarkItem bookmarking={bookmarking} onBookmark={onBookmark} />
        ) : null}
        <button type="button" onClick={() => workspace.openView(source.id, "annotations", pane.id)}>
          <HighlightIcon />
          <Trans> Annotations</Trans>
        </button>
        <button type="button" onClick={() => workspace.openView(source.id, "note", pane.id)}>
          <NoteIcon />
          <Trans> Literature note</Trans>
        </button>
        <button type="button" onClick={() => workspace.openView(source.id, "citation", pane.id)}>
          <CitationIcon />
          <Trans> Citation</Trans>
        </button>
        <hr />
        <button type="button" onClick={() => workspace.openBeside(source.id, "note")}>
          <NoteIcon />
          <Trans> Open literature note beside</Trans>
        </button>
        <button
          type="button"
          className={focusMode ? "is-active" : undefined}
          onClick={onToggleFocus}
        >
          <ReadingModeIcon />{" "}
          {focusMode
            ? t({ message: "Leave reading mode" })
            : t({ message: "Reading mode", context: "DocumentContextualToolbar interface" })}
        </button>
        <ExportItem sourceExport={sourceExport} />
        <RemoveItem source={source} onRemoveSource={onRemoveSource} />
      </Menu>
    </div>
  );
}

function ExportItem({
  sourceExport,
}: {
  readonly sourceExport: SourceExportController;
}): JSX.Element {
  const { t } = useLingui();
  return (
    <>
      <button
        type="button"
        disabled={!sourceExport.available || sourceExport.status === "exporting"}
        onClick={sourceExport.run}
      >
        <DownloadIcon />
        {sourceExport.status === "exporting"
          ? t({ message: "Preparing export…", context: "DocumentContextualToolbar interface" })
          : t({ message: "Export source", context: "DocumentContextualToolbar interface" })}
      </button>
      {sourceExport.message ? (
        <p className={`menu-note${sourceExport.status === "error" ? " is-error" : ""}`}>
          {sourceExport.message}
        </p>
      ) : null}
    </>
  );
}

function RemoveItem({
  source,
  onRemoveSource,
}: {
  readonly source: SourceSummary;
  readonly onRemoveSource: ((source: SourceSummary) => void) | null;
}): JSX.Element | null {
  return onRemoveSource ? (
    <>
      <hr />
      <button type="button" className="is-danger" onClick={() => onRemoveSource(source)}>
        <TrashIcon />
        <Trans> Remove source…</Trans>
      </button>
    </>
  ) : null;
}

function BookmarkItem({
  bookmarking,
  onBookmark,
}: {
  readonly bookmarking: boolean;
  readonly onBookmark: () => void;
}): JSX.Element {
  return (
    <>
      <button type="button" disabled={bookmarking} onClick={onBookmark}>
        <BookmarkIcon />
        <Trans> Bookmark this position</Trans>
      </button>
      <hr />
    </>
  );
}

function ContentsMenu({ contents }: { readonly contents: ContentsCapability }): JSX.Element {
  const { t } = useLingui();
  const entries = useMemo(() => contents.entries(), [contents]);
  return (
    <Menu
      className="document-contents-menu"
      label={t({ message: "Contents", context: "DocumentContextualToolbar interface" })}
      title={t({ message: "Contents", context: "DocumentContextualToolbar interface" })}
      trigger={<ListIcon />}
    >
      <span className="menu-label">
        <Trans>Contents</Trans>
      </span>
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
