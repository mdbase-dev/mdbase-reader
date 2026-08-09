import { ReaderButton } from "@mdbase-reader/ui";

import { BackIcon, HighlightIcon, MoreIcon, NoteIcon } from "./icons.js";

import type { SourceSummary } from "@mdbase-reader/core";
import type { JSX, ReactNode } from "react";

export interface DocumentWorkspaceProps {
  readonly source: SourceSummary | null;
  readonly document: ReactNode;
  readonly onBackToLibrary: () => void;
  readonly onOpenInspector: () => void;
}

export function DocumentWorkspace({
  source,
  document,
  onBackToLibrary,
  onOpenInspector,
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
                {source.documents[0]?.title ?? source.documents[0]?.mediaType ?? "Source note"}
              </span>
            </div>
            <div className="document-tools">
              <button
                type="button"
                className="mobile-inspector-toggle tool-button"
                onClick={onOpenInspector}
              >
                <NoteIcon /> Annotations
              </button>
              <button type="button" className="tool-button">
                <HighlightIcon /> Highlight
              </button>
              <span className="page-position">42 / 218</span>
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
