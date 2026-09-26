import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { prepareCitation, type CitationPreview } from "./capture-citation.js";
import { problemMessage, sourceForUrl } from "./capture-model.js";
import { connectionUnavailableMessage } from "./connection-status.js";
import { rememberColor } from "./drafts.js";
import { annotationQuotes } from "./page-annotations.js";
import { markSavedPage } from "./page-badge.js";
import { fetchPdf, renderAnnotations, type PageCapture } from "./page-capture.js";
import { CaptureWriter, type CaptureDraft } from "./save-capture.js";
import { rememberTags, splitTags } from "./tag-suggestions.js";
import { useActionLock } from "./use-action-lock.js";
import { useConnect } from "./use-connect.js";
import { useKnownTags } from "./use-known-tags.js";
import { usePageCapture } from "./use-page-capture.js";
import { useQuickSave } from "./use-quick-save.js";
import { useSourceNote } from "./use-source-note.js";
import { useStoredDraft } from "./use-stored-draft.js";

import type {
  CaptureStatus,
  ExtensionCaptureController,
  PageHighlights,
} from "./capture-controller.js";
import type { ReaderConnectedCollection } from "@mdbase-reader/connect";
import type {
  Annotation,
  AnnotationDeletionPlan,
  AnnotationId,
  SourceImportProgress,
  SourceSummary,
} from "@mdbase-reader/core";

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
  const [projection, setProjection] = useState<PageHighlights | null>(null);
  // The page and collection a save was last attempted for; another page starts afresh.
  const [attemptedFor, setAttemptedFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The page and collection whose existing source has been looked up.
  const [discovered, setDiscovered] = useState<string | null>(null);
  const refreshEpoch = useRef(0);
  useEffect(
    () => () => {
      refreshEpoch.current++;
    },
    [],
  );
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

  const { collectionId, pageUrl, submittedUrl, pageKind, discoveryKey, attemptKey } = pageKeys(
    connection.snapshot,
    capture,
  );

  const display = useCallback(
    (values: readonly Annotation[], url: string, focus?: AnnotationId) =>
      showSavedHighlights(tabId, values, url, focus),
    [tabId],
  );

  useEffect(() => {
    const epoch = ++discovery.current;
    refreshEpoch.current++;
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
      setDiscovered(`${collection.collectionId} ${pageUrl}`);
      if (!existing) {
        return;
      }
      const values = await collection.annotations.listForSource(
        collection.collectionId,
        existing.id,
      );
      if (epoch !== discovery.current) {
        return;
      }
      setAnnotations(values);
      if (pageKind === "html" && submittedUrl) {
        try {
          const shown = await display(values, submittedUrl);
          if (epoch === discovery.current) {
            setProjection(shown);
          }
        } catch (reason) {
          if (epoch === discovery.current) {
            setNotice(`Could not show your highlights on this page: ${problemMessage(reason)}`);
          }
        }
      } else {
        void markSavedPage(tabId, 0).catch(() => undefined);
      }
    })().catch((reason: unknown) => {
      if (epoch === discovery.current) {
        setNotice(`Could not check existing sources: ${problemMessage(reason)}`);
      }
    });
    return () => setRefreshing(false);
  }, [collectionId, display, extension, pageKind, pageUrl, setNotice, submittedUrl, tabId]);

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

  const save = (changes?: Partial<CaptureDraft>): Promise<void> =>
    lock.run(async () => {
      const collection = extension?.session.connectedCollection();
      if (!collection || !writer || !extension) {
        throw new Error(
          connectionUnavailableMessage(extension?.session.getSnapshot() ?? connection.snapshot),
        );
      }
      if (!capture) {
        throw new Error("The page is not ready. Reopen Reader on this page before saving.");
      }
      const draft = { ...stored.draft, ...changes };
      if (changes) {
        stored.setDraft((value) => ({ ...value, ...changes }));
      }
      discovery.current++;
      refreshEpoch.current++;
      setRefreshing(false);
      setAttemptedFor(attemptKey);
      setStatus("saving");
      try {
        const result = await writer.save({
          session: extension.session,
          collection,
          capture,
          draft,
          known: source,
          citation,
          pdfBytes: () => fetchPdf(tabId, capture.canonicalUrl),
          onProgress: setProgress,
          onSource: (saved, existing) => {
            setProgress(null);
            setSource(saved);
            setStatus(existing ? "existing" : "saved");
          },
        });
        if (result.annotation) {
          stored.setDraft((value) => ({ ...value, comment: "" }));
          page.setSelection(null);
          rememberColor(draft.color);
        }
        const used = [
          ...(result.existing ? [] : splitTags(draft.tags)),
          ...(result.annotation ? splitTags(draft.highlightTags) : []),
        ];
        void rememberTags(collection.collectionId, used).catch(() => undefined);
        setNotice(
          [result.annotation ? "Highlight saved." : null, ...result.notices]
            .filter(Boolean)
            .join(" ") || null,
        );
        // The write is complete. Refreshing the display must not keep Save locked.
        setProgress(null);
        void refreshAnnotations(result.source, Boolean(result.annotation));
      } finally {
        setStatus((current) => (current === "saving" ? "ready" : current));
      }
    }, "save");

  async function refreshAnnotations(saved: SourceSummary, render: boolean): Promise<void> {
    const collection = extension?.session.connectedCollection();
    if (!collection || !capture) {
      setNotice(connectionUnavailableMessage(connection.snapshot));
      return;
    }
    const epoch = ++refreshEpoch.current;
    setRefreshing(true);
    try {
      const values = await collection.annotations.listForSource(collection.collectionId, saved.id);
      if (epoch !== refreshEpoch.current) {
        return;
      }
      setAnnotations(values);
      if (render && capture.kind === "html") {
        const shown = await display(values, capture.submittedUrl);
        if (epoch === refreshEpoch.current) {
          setProjection(shown);
        }
      } else {
        void markSavedPage(tabId, values.filter((value) => value.target?.quote).length).catch(
          () => undefined,
        );
      }
    } catch (reason) {
      if (epoch === refreshEpoch.current) {
        setNotice(
          `Saved safely. Could not refresh highlights on this page: ${problemMessage(reason)}. Retry refreshing highlights; do not save again.`,
        );
      }
    } finally {
      if (epoch === refreshEpoch.current) {
        setRefreshing(false);
      }
    }
  }

  const refreshHighlights = async (): Promise<void> => {
    if (source && !refreshing && !lock.busy) {
      setNotice(null);
      await refreshAnnotations(source, true);
    }
  };

  const revealHighlight = (id: AnnotationId): Promise<void> =>
    lock.run(async () => {
      if (capture?.kind === "html") {
        setProjection(await display(annotations, capture.submittedUrl, id));
      }
    }, "page");

  /** Applies an edit to the list and redraws the page; the edit itself already succeeded. */
  const afterEdit = (next: readonly Annotation[]): void => {
    setAnnotations(next);
    if (capture?.kind === "html") {
      const url = capture.submittedUrl;
      void display(next, url)
        .then(setProjection)
        .catch(() => undefined);
    }
  };
  const editing = (): { collection: ReaderConnectedCollection; writer: CaptureWriter } => {
    const collection = extension?.session.connectedCollection();
    if (!collection || !writer) {
      throw new Error(connectionUnavailableMessage(connection.snapshot));
    }
    return { collection, writer };
  };
  const updateHighlightComment = async (annotation: Annotation, comment: string): Promise<void> => {
    const { collection, writer } = editing();
    const updated = await writer.updateComment(collection, annotation, comment);
    afterEdit(annotations.map((value) => (value.id === updated.id ? updated : value)));
  };
  const planHighlightDeletion = (annotation: Annotation): Promise<AnnotationDeletionPlan> => {
    const { collection, writer } = editing();
    return writer.planDeletion(collection, annotation);
  };
  const deleteHighlight = async (
    annotation: Annotation,
    plan: AnnotationDeletionPlan,
  ): Promise<void> => {
    const { collection, writer } = editing();
    await writer.delete(collection, annotation, plan);
    afterEdit(annotations.filter((value) => value.id !== annotation.id));
  };

  const tags = useKnownTags(extension, annotations);
  const connectedCollection = useCallback(
    () => extension?.session.connectedCollection() ?? null,
    [extension],
  );
  const note = useSourceNote(connectedCollection, source, setSource);

  useQuickSave({
    invocation: page.invocation,
    // Connected, with this page's existing source looked up and its citation settled.
    ready: discoveryKey !== null && discovered === discoveryKey && !citationPending,
    busy: lock.busy || page.navigated,
    capture,
    title: stored.draft.title,
    save,
  });

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
    directAccess: connection.directAccess,
    projection,
    progress,
    refreshing,
    refreshHighlights,
    busy: lock.busy,
    saveAttempted: attemptedFor === attemptKey,
    navigated: page.navigated,
    following: page.following,
    invocation: page.invocation,
    connect: connection.connect,
    retry: connection.retry,
    applySetup: connection.applySetup,
    select: connection.select,
    save,
    clearSelection: () => page.setSelection(null),
    revealHighlight,
    updateHighlightComment,
    planHighlightDeletion,
    deleteHighlight,
    knownTags: tags.knownTags,
    loadTags: tags.loadTags,
    note,
  };
}

/**
 * Draws the saved highlights on the live page (optionally scrolling to one) and marks the
 * toolbar button. Needs no extra permission: opening the panel granted `activeTab`.
 */
async function showSavedHighlights(
  tabId: number,
  values: readonly Annotation[],
  url: string,
  focus?: AnnotationId,
): Promise<PageHighlights> {
  const quoted = values.filter((annotation) => annotation.target?.quote);
  void markSavedPage(tabId, quoted.length).catch(() => undefined);
  const index = quoted.findIndex((annotation) => annotation.id === focus);
  const { report, outcomes } = await renderAnnotations(
    tabId,
    annotationQuotes(quoted),
    url,
    index === -1 ? undefined : index,
  );
  return {
    report,
    outcomes: new Map(quoted.map((annotation, i) => [annotation.id, outcomes[i] ?? "missing"])),
  };
}

/** What identifies the panel's current page and collection, for discarding stale work. */
function pageKeys(
  snapshot: ExtensionCaptureController["snapshot"],
  capture: PageCapture | null,
): {
  readonly collectionId: string | null;
  readonly pageUrl: string | undefined;
  readonly submittedUrl: string | undefined;
  readonly pageKind: PageCapture["kind"] | undefined;
  /** Set once both are known: the existing-source lookup is for this pair. */
  readonly discoveryKey: string | null;
  /** A save attempt belongs to this pair, even before the collection is chosen. */
  readonly attemptKey: string;
} {
  const collectionId = snapshot.status === "ready" ? snapshot.collectionId : null;
  const pageUrl = capture?.canonicalUrl;
  return {
    collectionId,
    pageUrl,
    submittedUrl: capture?.submittedUrl,
    pageKind: capture?.kind,
    discoveryKey: collectionId && pageUrl ? `${collectionId} ${pageUrl}` : null,
    attemptKey: `${collectionId ?? ""} ${pageUrl ?? ""}`,
  };
}
