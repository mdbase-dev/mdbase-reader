import { lazy, Suspense, useCallback, useEffect, useState, type JSX, type ReactNode } from "react";

import type {
  DocumentDescriptor,
  DocumentHandle,
  DocumentRepository,
  SourceSummary,
} from "@mdbase-reader/core";
import type { ReadingSurface, SurfaceDocument } from "@mdbase-reader/reading-surface";

const PdfViewerSurface = lazy(async () => {
  const module = await import("@mdbase-reader/renderer-pdf");
  return { default: module.PdfViewerSurface };
});

const EpubViewerSurface = lazy(async () => {
  const module = await import("@mdbase-reader/renderer-epub");
  return { default: module.EpubViewerSurface };
});

export interface ConnectedDocumentProps {
  readonly repository: DocumentRepository;
  readonly source: SourceSummary;
  readonly onSurfaceChange: (surface: ReadingSurface | null) => void;
}

type OpenDocumentState =
  | { readonly status: "opening" }
  | { readonly status: "open"; readonly handle: DocumentHandle }
  | { readonly status: "error"; readonly message: string };

export function ConnectedDocument({
  repository,
  source,
  onSurfaceChange,
}: ConnectedDocumentProps): JSX.Element {
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
      onSurfaceChange={onSurfaceChange}
    />
  );
}

function OpenConnectedDocument({
  descriptor,
  repository,
  source,
  onSurfaceChange,
}: ConnectedDocumentProps & { readonly descriptor: DocumentDescriptor }): JSX.Element {
  const [state, setState] = useState<OpenDocumentState>({ status: "opening" });

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

  useEffect(() => () => onSurfaceChange(null), [onSurfaceChange]);

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
    return <PdfStage document={document} onSurfaceChange={onSurfaceChange} />;
  }
  if (isEpub(document.mediaType, descriptor.file)) {
    return <EpubStage document={document} onSurfaceChange={onSurfaceChange} />;
  }
  return <DocumentMessage label={`No renderer is registered for ${document.mediaType}.`} />;
}

type RendererState =
  { readonly status: "opening" | "ready" } | { readonly status: "error"; readonly message: string };

function PdfStage({
  document,
  onSurfaceChange,
}: {
  readonly document: SurfaceDocument;
  readonly onSurfaceChange: ConnectedDocumentProps["onSurfaceChange"];
}): JSX.Element {
  const [state, setState] = useState<RendererState>({ status: "opening" });
  const ready = useCallback(() => setState({ status: "ready" }), []);
  const failed = useCallback((message: string) => setState({ status: "error", message }), []);
  return (
    <RendererStage state={state} openingLabel="Preparing PDF pages…" errorName="EmbedPDF">
      <Suspense fallback={<DocumentMessage label="Loading the PDF renderer…" />}>
        <PdfViewerSurface
          className="pdf-viewer"
          document={document}
          onDocumentError={failed}
          onDocumentReady={ready}
          onSurfaceReady={onSurfaceChange}
        />
      </Suspense>
    </RendererStage>
  );
}

function EpubStage({
  document,
  onSurfaceChange,
}: {
  readonly document: SurfaceDocument;
  readonly onSurfaceChange: ConnectedDocumentProps["onSurfaceChange"];
}): JSX.Element {
  const [state, setState] = useState<RendererState>({ status: "opening" });
  const ready = useCallback(() => setState({ status: "ready" }), []);
  const failed = useCallback((message: string) => setState({ status: "error", message }), []);
  return (
    <RendererStage state={state} openingLabel="Preparing publication…" errorName="Readium">
      <Suspense fallback={<DocumentMessage label="Loading the EPUB renderer…" />}>
        <EpubViewerSurface
          className="epub-viewer"
          document={document}
          onDocumentError={failed}
          onDocumentReady={ready}
          onSurfaceReady={onSurfaceChange}
        />
      </Suspense>
    </RendererStage>
  );
}

function RendererStage({
  state,
  openingLabel,
  errorName,
  children,
}: {
  readonly state: RendererState;
  readonly openingLabel: string;
  readonly errorName: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="document-renderer-stage">
      {children}
      {state.status === "opening" ? (
        <div className="document-renderer-status">
          <DocumentMessage label={openingLabel} />
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className="document-renderer-status">
          <DocumentMessage
            label={`${errorName} could not render this file: ${state.message}`}
            tone="error"
          />
        </div>
      ) : null}
    </div>
  );
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
