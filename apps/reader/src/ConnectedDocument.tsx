import { lazy, Suspense, useEffect, useState, type JSX } from "react";

import type {
  DocumentDescriptor,
  DocumentHandle,
  DocumentRepository,
  SourceSummary,
} from "@mdbase-reader/core";
import type { SurfaceDocument } from "@mdbase-reader/reading-surface";

const PdfViewerSurface = lazy(async () => {
  const module = await import("@mdbase-reader/renderer-pdf");
  return { default: module.PdfViewerSurface };
});

export interface ConnectedDocumentProps {
  readonly repository: DocumentRepository;
  readonly source: SourceSummary;
}

type OpenDocumentState =
  | { readonly status: "opening" }
  | { readonly status: "open"; readonly handle: DocumentHandle }
  | { readonly status: "error"; readonly message: string };

export function ConnectedDocument({ repository, source }: ConnectedDocumentProps): JSX.Element {
  const descriptor = source.documents[0];
  if (!descriptor) {
    return <DocumentMessage label="This source has no readable representation." />;
  }
  return (
    <OpenConnectedDocument
      key={`${descriptor.fileId}:${descriptor.revision}`}
      descriptor={descriptor}
      repository={repository}
      source={source}
    />
  );
}

function OpenConnectedDocument({
  descriptor,
  repository,
  source,
}: ConnectedDocumentProps & { readonly descriptor: DocumentDescriptor }): JSX.Element {
  const [state, setState] = useState<OpenDocumentState>({ status: "opening" });
  const [rendererState, setRendererState] = useState<
    | { readonly status: "opening" | "ready" }
    | { readonly status: "error"; readonly message: string }
  >({ status: "opening" });

  useEffect(() => {
    let active = true;
    let opened: DocumentHandle | null = null;
    const controller = new AbortController();
    void repository
      .open(source.collectionId, descriptor, { signal: controller.signal })
      .then((handle) => {
        opened = handle;
        if (active) {
          setState({ status: "open", handle });
        } else {
          void handle.close();
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setState({ status: "error", message: message(reason) });
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (opened) {
        void opened.close();
      }
    };
  }, [descriptor, repository, source.collectionId]);

  if (state.status === "opening") {
    return <DocumentMessage label="Opening exact file revision…" />;
  }
  if (state.status === "error") {
    return <DocumentMessage label={state.message} tone="error" />;
  }
  const document: SurfaceDocument = {
    document: descriptor,
    mediaType: state.handle.mediaType,
    url: state.handle.url,
  };
  if (isPdf(document.mediaType, descriptor.file)) {
    return (
      <div className="pdf-stage">
        <Suspense fallback={<DocumentMessage label="Loading the PDF renderer…" />}>
          <PdfViewerSurface
            className="pdf-viewer"
            document={document}
            onDocumentError={(rendererMessage) =>
              setRendererState({ status: "error", message: rendererMessage })
            }
            onDocumentReady={() => setRendererState({ status: "ready" })}
            onSurfaceReady={() => undefined}
          />
        </Suspense>
        {rendererState.status === "opening" ? (
          <div className="pdf-stage-status">
            <DocumentMessage label="Preparing PDF pages…" />
          </div>
        ) : null}
        {rendererState.status === "error" ? (
          <div className="pdf-stage-status">
            <DocumentMessage
              label={`EmbedPDF could not render this file: ${rendererState.message}`}
              tone="error"
            />
          </div>
        ) : null}
      </div>
    );
  }
  if (isEpub(document.mediaType, descriptor.file)) {
    return (
      <div className="document-empty">
        <div>
          <span className="mono">EPUB connected</span>
          <h2>The publication is available from this collection.</h2>
          <p>
            Reader has verified and downloaded the exact EPUB revision. Publication unpacking is not
            yet available in this web build.
          </p>
          <a className="mdbase-button" href={state.handle.url} download>
            Download EPUB
          </a>
        </div>
      </div>
    );
  }
  return <DocumentMessage label={`No renderer is registered for ${document.mediaType}.`} />;
}

function DocumentMessage({
  label,
  tone = "neutral",
}: {
  readonly label: string;
  readonly tone?: "neutral" | "error";
}): JSX.Element {
  return (
    <div
      className={`connected-document-message is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {label}
    </div>
  );
}

function isPdf(mediaType: string, file: string): boolean {
  return mediaType === "application/pdf" || /\.pdf(?:\]\])?$/iu.test(file);
}

function isEpub(mediaType: string, file: string): boolean {
  return mediaType === "application/epub+zip" || /\.epub(?:\]\])?$/iu.test(file);
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
