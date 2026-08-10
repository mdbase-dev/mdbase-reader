import { ReaderButton } from "@mdbase-reader/ui";

import { AreaIcon, BackIcon, FocusIcon, MoreIcon, PanelIcon } from "./icons.js";
import { SourceTabStrip, sourceFormat } from "./SourceTabStrip.js";

import type { ReadingResumeState } from "./use-reading-resume.js";
import type { SourceExportController } from "./use-source-export.js";
import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, ReactNode } from "react";

export interface DocumentWorkspaceProps {
  readonly source: SourceSummary | null;
  readonly openDocuments: readonly OpenSourceDocument[];
  readonly focusMode: boolean;
  readonly inspectorOpen: boolean;
  readonly readingResume: ReadingResumeState;
  readonly decorationProblem: string | null;
  readonly canSelectArea: boolean;
  readonly selectingArea: boolean;
  readonly sourceExport: SourceExportController;
  readonly onAddSource: () => void;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
  readonly onToggleInspector: () => void;
  readonly onToggleAreaSelection: () => void;
  readonly onActivateSource: (sourceId: SourceSummary["id"]) => void;
  readonly onCloseSource: (sourceId: SourceSummary["id"]) => void;
}

export interface OpenSourceDocument {
  readonly source: SourceSummary;
  readonly document: ReactNode;
}

export function DocumentWorkspace({
  source,
  openDocuments,
  focusMode,
  inspectorOpen,
  readingResume,
  decorationProblem,
  canSelectArea,
  selectingArea,
  sourceExport,
  onAddSource,
  onBackToLibrary,
  onToggleFocus,
  onToggleInspector,
  onToggleAreaSelection,
  onActivateSource,
  onCloseSource,
}: DocumentWorkspaceProps): JSX.Element {
  return (
    <section className="document-workspace" aria-label="Document reader">
      <SourceTabStrip
        sources={openDocuments.map(({ source: openSource }) => openSource)}
        activeSourceId={source?.id ?? null}
        onActivate={onActivateSource}
        onClose={onCloseSource}
      />
      {source ? (
        <>
          <div className="document-toolbar">
            <button
              className="mobile-back icon-button"
              type="button"
              aria-label="Back to library"
              onClick={onBackToLibrary}
            >
              <BackIcon />
            </button>
            <div className="document-identity">
              <strong>{source.title}</strong>
              <span>
                {source.creators.join(", ") || "Unknown creator"}
                {source.documents[0] ? ` · ${sourceFormat(source)}` : " · Source note"}
              </span>
            </div>
            <DocumentStatus reading={readingResume} decorationProblem={decorationProblem} />
            <div className="document-tools">
              {canSelectArea ? (
                <button
                  type="button"
                  className={selectingArea ? "tool-button is-active" : "tool-button"}
                  aria-pressed={selectingArea}
                  aria-label={selectingArea ? "Cancel area selection" : "Select an area"}
                  onClick={onToggleAreaSelection}
                >
                  <AreaIcon /> <span className="tool-label">Area</span>
                </button>
              ) : null}
              <button
                type="button"
                className={inspectorOpen ? "tool-button is-active" : "tool-button"}
                aria-pressed={inspectorOpen}
                aria-label={inspectorOpen ? "Hide source workspace" : "Show source workspace"}
                onClick={onToggleInspector}
              >
                <PanelIcon /> <span className="tool-label">Workspace</span>
              </button>
              <button
                type="button"
                className={focusMode ? "tool-button is-active" : "tool-button"}
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                onClick={onToggleFocus}
              >
                <FocusIcon /> <span className="tool-label">Focus</span>
              </button>
              <SourceActions sourceExport={sourceExport} />
            </div>
          </div>
          <div className="document-canvas">
            <DocumentSessions
              documents={openDocuments}
              activeSourceId={source.id}
              onAddSource={onAddSource}
            />
          </div>
        </>
      ) : (
        <EmptyWorkspace hasSources={openDocuments.length > 0} onAddSource={onAddSource} />
      )}
    </section>
  );
}

function DocumentSessions({
  documents,
  activeSourceId,
  onAddSource,
}: {
  readonly documents: readonly OpenSourceDocument[];
  readonly activeSourceId: SourceSummary["id"];
  readonly onAddSource: () => void;
}): JSX.Element {
  return (
    <div className="document-session-deck">
      {documents.map(({ source, document }) => {
        const active = source.id === activeSourceId;
        return (
          <div
            className={active ? "document-session is-active" : "document-session"}
            key={source.id}
            aria-hidden={!active}
          >
            {document ?? <DocumentEmpty onAddSource={onAddSource} />}
          </div>
        );
      })}
    </div>
  );
}

function SourceActions({
  sourceExport,
}: {
  readonly sourceExport: SourceExportController;
}): JSX.Element {
  return (
    <details className="source-actions">
      <summary className="icon-button" aria-label="Source actions" title="Source actions">
        <MoreIcon />
      </summary>
      <div className="source-actions-menu">
        <button
          type="button"
          disabled={!sourceExport.available || sourceExport.status === "exporting"}
          onClick={sourceExport.run}
        >
          <span>{sourceExport.status === "exporting" ? "Preparing export…" : "Export source"}</span>
          <small>Records, materialized note, citations, and originals</small>
        </button>
        {sourceExport.message ? (
          <p
            className={`source-export-message is-${sourceExport.status}`}
            role={sourceExport.status === "error" ? "alert" : "status"}
          >
            {sourceExport.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function DocumentStatus({
  reading,
  decorationProblem,
}: {
  readonly reading: ReadingResumeState;
  readonly decorationProblem: string | null;
}): JSX.Element {
  if (decorationProblem) {
    return (
      <span className="reading-position-status is-error" role="alert" title={decorationProblem}>
        Highlights unavailable
      </span>
    );
  }
  if (reading.status === "idle") {
    return <span className="reading-position-status" />;
  }
  const label =
    reading.status === "saving"
      ? "Saving position…"
      : reading.status === "saved"
        ? "Position saved"
        : (reading.message ?? "Position not saved");
  return (
    <span
      className={`reading-position-status is-${reading.status}`}
      role={reading.status === "error" ? "alert" : "status"}
      title={label}
    >
      {reading.status === "error" ? "Position not saved" : label}
    </span>
  );
}

function DocumentEmpty({ onAddSource }: { readonly onAddSource: () => void }): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">No readable representation</span>
        <h2>Add a PDF, EPUB, or saved web page.</h2>
        <p>
          The literature note is available now. Document controls appear when a supported
          representation is attached.
        </p>
        <ReaderButton onClick={onAddSource}>Add another source</ReaderButton>
      </div>
    </div>
  );
}

function EmptyWorkspace({
  hasSources,
  onAddSource,
}: {
  readonly hasSources: boolean;
  readonly onAddSource: () => void;
}): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">{hasSources ? "No source selected" : "Working set is empty"}</span>
        <h2>{hasSources ? "Choose an open source." : "Open something worth returning to."}</h2>
        <p>Select a source in the library, or add a PDF, EPUB, or saved web page.</p>
        <ReaderButton onClick={onAddSource}>Add a source</ReaderButton>
      </div>
    </div>
  );
}
