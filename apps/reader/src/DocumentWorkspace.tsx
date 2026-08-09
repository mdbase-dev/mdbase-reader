import { ReaderButton } from "@mdbase-reader/ui";

import { BackIcon, FocusIcon, MoreIcon, PanelIcon } from "./icons.js";

import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, ReactNode } from "react";

export interface DocumentWorkspaceProps {
  readonly source: SourceSummary | null;
  readonly document: ReactNode;
  readonly focusMode: boolean;
  readonly inspectorOpen: boolean;
  readonly onBackToLibrary: () => void;
  readonly onToggleFocus: () => void;
  readonly onToggleInspector: () => void;
}

export function DocumentWorkspace({
  source,
  document,
  focusMode,
  inspectorOpen,
  onBackToLibrary,
  onToggleFocus,
  onToggleInspector,
}: DocumentWorkspaceProps): JSX.Element {
  return (
    <section className="document-workspace" aria-label="Document reader">
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
                {source.documents[0] ? ` · ${documentLabel(source)}` : " · Source note"}
              </span>
            </div>
            <div className="document-tools">
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
              <button className="icon-button" type="button" aria-label="Document actions">
                <MoreIcon />
              </button>
            </div>
          </div>
          <div className="document-canvas">{document ?? <DocumentEmpty />}</div>
        </>
      ) : (
        <EmptyCollection />
      )}
    </section>
  );
}

function documentLabel(source: SourceSummary): string {
  const mediaType = source.documents[0]?.mediaType ?? "";
  if (mediaType.includes("pdf")) {
    return "PDF";
  }
  if (mediaType.includes("epub")) {
    return "EPUB";
  }
  return source.documents[0]?.title ?? "Web archive";
}

function DocumentEmpty(): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">No readable representation</span>
        <h2>Add a PDF, EPUB, or saved web page.</h2>
        <p>
          The literature note is available now. Document controls appear when a supported
          representation is attached.
        </p>
        <ReaderButton>Add a representation</ReaderButton>
      </div>
    </div>
  );
}

function EmptyCollection(): JSX.Element {
  return (
    <div className="document-empty">
      <div>
        <span className="mono">Your library is empty</span>
        <h2>Begin with something worth returning to.</h2>
        <p>Save a web page, upload a PDF or EPUB, or import an existing library.</p>
        <ReaderButton>Upload PDF or EPUB</ReaderButton>
      </div>
    </div>
  );
}
