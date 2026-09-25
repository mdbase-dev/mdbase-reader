import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { prepareCitation, type CitationPreview } from "./capture-citation.js";
import { problemMessage, sourceForUrl } from "./capture-model.js";
import { annotationQuotes } from "./page-annotations.js";
import { fetchPdf, renderAnnotations } from "./page-capture.js";
import { CaptureWriter } from "./save-capture.js";
import { useActionLock } from "./use-action-lock.js";
import { useConnect } from "./use-connect.js";
import { usePageCapture } from "./use-page-capture.js";
import { useStoredDraft } from "./use-stored-draft.js";

import type { CaptureStatus, ExtensionCaptureController } from "./capture-controller.js";
import type { SourceChangedMessage } from "./messages.js";
import type { ProjectionReport } from "./page-annotations.js";
import type { Annotation, SourceImportProgress, SourceSummary } from "@mdbase-reader/core";

export type { ExtensionCaptureController } from "./capture-controller.js";

// The controller coordinates one panel's explicit actions; I/O lives in the composed hooks
// and CaptureWriter.
// eslint-disable-next-line max-lines-per-function
export function useExtensionCapture(tabId: number): ExtensionCaptureController {
  const [progress, setProgress] = useState<SourceImportProgress | null>(null);
  const lock = useActionLock(useCallback(() => setProgress(null), []));
  const { setProblem } = lock;
  const page = usePageCapture(
    tabId,
    useCallback((problem: string) => setProblem(problem, "page"), [setProblem]),
  );
  const connection = useConnect(lock);
  const { capture } = page;
  const stored = useStoredDraft(tabId, capture, page.setSelection);
  const [status, setStatus] = useState<CaptureStatus>("opening");
  const [source, setSource] = useState<SourceSummary | null>(null);
  const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
  const [projection, setProjection] = useState<ProjectionReport | null>(null);
  const [saveAttempted, setSaveAttempted] = useState(false);
  // The citation belongs to one page; it is pending until a lookup for this page settles.
  const [citationFor, setCitationFor] = useState<{
    readonly page: string;
    readonly preview: CitationPreview | null;
  } | null>(null);
  const discovery = useRef(0);
  const extension = connection.extension;
  const writer = useMemo(
    () => (extension ? new CaptureWriter(extension.journalStorage) : null),
    [extension],
  );
  const { readPage } = page;
  const { open } = connection;
  const { release, setNotice } = lock;

  useEffect(() => {
    // Connect starts even when the page cannot be read, so the panel can still recover.
    void readPage()
      .then(
        () => setStatus("ready"),
        (reason: unknown) => setProblem(problemMessage(reason), "page"),
      )
      .then(open)
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(release);
  }, [open, readPage, release, setProblem]);

  const collectionId =
    connection.snapshot.status === "ready" ? connection.snapshot.collectionId : null;
  const pageUrl = capture?.canonicalUrl;
  const submittedUrl = capture?.submittedUrl;
  useEffect(() => {
    const epoch = ++discovery.current;
    const collection = extension?.session.connectedCollection();
    if (!collection || !pageUrl) {
      return;
    }
    void (async () => {
      const existing = await sourceForUrl(collection, pageUrl, submittedUrl ? [submittedUrl] : []);
      if (epoch !== discovery.current) {
        return;
      }
      setSource(existing);
      setAnnotations([]);
      setProjection(null);
      setStatus(existing ? "existing" : "ready");
      if (existing) {
        const values = await collection.annotations.listForSource(
          collection.collectionId,
          existing.id,
        );
        if (epoch === discovery.current) {
          setAnnotations(values);
        }
      }
    })().catch((reason: unknown) => {
      if (epoch === discovery.current) {
        setNotice(`Could not check existing sources: ${problemMessage(reason)}`);
      }
    });
  }, [collectionId, extension, pageUrl, setNotice, submittedUrl]);

  const { setDraft } = stored;
  useEffect(() => {
    if (!capture) {
      return;
    }
    const controller = new AbortController();
    const page = capture.canonicalUrl;
    void prepareCitation(capture, controller.signal)
      .catch(() => null)
      .then((preview) => {
        if (controller.signal.aborted) {
          return;
        }
        setCitationFor({ page, preview });
        const title = preview?.citation["title"];
        if (typeof title === "string") {
          // Replace only the untouched page title; never an edited one.
          setDraft((draft) =>
            draft.title === capture.pageTitle || !draft.title ? { ...draft, title } : draft,
          );
        }
      });
    return () => controller.abort();
    // Only a new page (not a new selection) changes its citation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrl, capture?.kind]);

  const citation = citationFor && citationFor.page === pageUrl ? citationFor.preview : null;
  const citationPending = Boolean(pageUrl) && citationFor?.page !== pageUrl;

  const save = (): Promise<void> =>
    lock.run(async () => {
      const collection = extension?.session.connectedCollection();
      if (!capture || !collection || !writer || !extension) {
        throw new Error("Connect a collection before saving.");
      }
      discovery.current++;
      setSaveAttempted(true);
      setStatus("saving");
      try {
        const result = await writer.save({
          session: extension.session,
          collection,
          capture,
          draft: stored.draft,
          known: source,
          citation,
          pdfBytes: () => fetchPdf(tabId, capture.canonicalUrl),
          onProgress: setProgress,
          onSource: (saved, existing) => {
            setSource(saved);
            setStatus(existing ? "existing" : "saved");
          },
        });
        if (result.annotation) {
          stored.setDraft((value) => ({ ...value, comment: "" }));
          page.setSelection(null);
        }
        setNotice(
          [result.annotation ? "Highlight saved." : null, ...result.notices]
            .filter(Boolean)
            .join(" ") || null,
        );
        await refreshAnnotations(result.source, Boolean(result.annotation));
      } finally {
        setStatus((current) => (current === "saving" ? "ready" : current));
      }
    }, "save");

  async function refreshAnnotations(saved: SourceSummary, render: boolean): Promise<void> {
    const collection = extension?.session.connectedCollection();
    if (!collection || !capture) {
      return;
    }
    try {
      const values = await collection.annotations.listForSource(collection.collectionId, saved.id);
      setAnnotations(values);
      void chrome.runtime
        .sendMessage({ type: "mdbase-reader/source-changed", tabId } satisfies SourceChangedMessage)
        .catch(() => undefined);
      if (render && capture.kind === "html") {
        setProjection(
          await renderAnnotations(tabId, annotationQuotes(values), capture.submittedUrl),
        );
      }
    } catch (reason) {
      setNotice(
        `Saved safely. Could not refresh highlights on this page: ${problemMessage(reason)}`,
      );
    }
  }

  const showAnnotations = (): Promise<void> =>
    lock.run(async () => {
      if (capture?.kind === "html") {
        setProjection(
          await renderAnnotations(tabId, annotationQuotes(annotations), capture.submittedUrl),
        );
      }
    }, "page");

  return {
    snapshot: connection.snapshot,
    capture,
    draft: stored.draft,
    setDraft: stored.setDraft,
    draftRestored: stored.restored,
    status,
    problem: lock.problem,
    problemKind: lock.problemKind,
    notice: lock.notice,
    source,
    annotations,
    citation,
    citationPending,
    deviceCode: connection.deviceCode,
    projection,
    progress,
    busy: lock.busy,
    saveAttempted,
    navigated: page.navigated,
    invocation: page.invocation,
    connect: connection.connect,
    retry: connection.retry,
    applySetup: connection.applySetup,
    select: connection.select,
    save,
    showAnnotations,
    clearSelection: () => page.setSelection(null),
  };
}
