import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type JSX } from "react";

import { isEpub, isHtml, isPdf } from "./document-media.js";
import { DocumentMessage, RendererStage, type RendererState } from "./DocumentRendererStage.js";
import { openDocumentWithOfflineCopy } from "./offline-documents.js";
import { OfflineDocumentControl } from "./OfflineDocumentControl.js";

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

const HtmlViewerSurface = lazy(async () => {
  const module = await import("@mdbase-reader/renderer-html");
  return { default: module.HtmlViewerSurface };
});

export interface ConnectedDocumentProps {
  readonly repository: DocumentRepository;
  readonly source: SourceSummary;
  readonly onSurfaceChange: (surface: ReadingSurface | null) => void;
}

type OpenDocumentState =
  | { readonly status: "opening" }
  | { readonly status: "open"; readonly handle: DocumentHandle; readonly cached: boolean }
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
  const [attempt, setAttempt] = useState(0);
  const stableDescriptor = useMemo(
    (): DocumentDescriptor => ({
      file: descriptor.file,
      fileId: descriptor.fileId,
      mediaType: descriptor.mediaType,
      revision: descriptor.revision,
      role: descriptor.role,
      ...(descriptor.title ? { title: descriptor.title } : {}),
    }),
    [
      descriptor.file,
      descriptor.fileId,
      descriptor.mediaType,
      descriptor.revision,
      descriptor.role,
      descriptor.title,
    ],
  );

  useEffect(() => {
    let active = true;
    let opened: DocumentHandle | null = null;
    const controller = new AbortController();
    void openDocumentWithOfflineCopy(source.collectionId, stableDescriptor, repository, {
      signal: controller.signal,
    })
      .then(({ handle, cached }) => {
        opened = handle;
        if (active) {
          setState({ status: "open", handle, cached });
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
  }, [attempt, repository, source.collectionId, stableDescriptor]);

  useEffect(() => () => onSurfaceChange(null), [onSurfaceChange]);
  const handle = state.status === "open" ? state.handle : null;
  // The renderer reloads whenever this identity changes, so it must change only with the file.
  const currentDescriptor = useMemo(
    (): DocumentDescriptor =>
      handle
        ? { ...stableDescriptor, fileId: handle.fileId, revision: handle.revision }
        : stableDescriptor,
    [handle, stableDescriptor],
  );

  if (state.status === "opening") {
    return <DocumentMessage label="Opening document…" />;
  }
  if (state.status === "error") {
    return (
      <DocumentMessage
        label={state.message}
        tone="error"
        action={{
          label: "Try this tab again",
          run: () => {
            setState({ status: "opening" });
            setAttempt((value) => value + 1);
          },
        }}
      />
    );
  }
  return (
    <div className="connected-document-frame">
      <OfflineDocumentControl
        collection={source.collectionId}
        target={currentDescriptor}
        handle={state.handle}
        initiallyCached={state.cached}
      />
      {state.handle.revision !== stableDescriptor.revision ? (
        <p className="document-change-notice" role="status">
          This file has changed. Some saved annotation positions may need checking.
        </p>
      ) : null}
      <div className="connected-document-content">
        <OpenedDocumentRenderer
          descriptor={currentDescriptor}
          handle={state.handle}
          onSurfaceChange={onSurfaceChange}
        />
      </div>
    </div>
  );
}

function OpenedDocumentRenderer({
  descriptor,
  handle,
  onSurfaceChange,
}: {
  readonly descriptor: DocumentDescriptor;
  readonly handle: DocumentHandle;
  readonly onSurfaceChange: ConnectedDocumentProps["onSurfaceChange"];
}): JSX.Element {
  const document = useMemo<SurfaceDocument>(
    () => ({ document: descriptor, mediaType: handle.mediaType, url: handle.url }),
    [descriptor, handle],
  );
  if (isPdf(document.mediaType, descriptor.file)) {
    return <PdfStage document={document} onSurfaceChange={onSurfaceChange} />;
  }
  if (isEpub(document.mediaType, descriptor.file)) {
    return <EpubStage document={document} onSurfaceChange={onSurfaceChange} />;
  }
  if (isHtml(document.mediaType, descriptor.file)) {
    return <HtmlStage document={document} onSurfaceChange={onSurfaceChange} />;
  }
  return <DocumentMessage label={`No renderer is registered for ${document.mediaType}.`} />;
}

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

function HtmlStage({
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
    <RendererStage state={state} openingLabel="Preparing saved page…" errorName="HTML reader">
      <Suspense fallback={<DocumentMessage label="Loading the HTML renderer…" />}>
        <HtmlViewerSurface
          className="html-viewer"
          document={document}
          onDocumentError={failed}
          onDocumentReady={ready}
          onSurfaceReady={onSurfaceChange}
        />
      </Suspense>
    </RendererStage>
  );
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
