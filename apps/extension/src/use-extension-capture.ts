import {
  ReaderPortableApplicationSession,
  connectProblemMessage,
  type MdbaseAppManifest,
  type ReaderConnectSnapshot,
} from "@mdbase-reader/connect";
import { useCallback, useEffect, useRef, useState } from "react";

import { problemMessage, sourceForUrl } from "./capture-model.js";
import manifest from "./generated/mdbase-app.json";
import { captureTab, renderAnnotations, type SelectedWebCapture } from "./page-capture.js";
import { CaptureWriter, type CaptureDraft } from "./save-capture.js";

import type { CaptureStatus, ExtensionCaptureController } from "./capture-controller.js";
import type { PageQuote, ProjectionReport } from "./page-annotations.js";
import type { Annotation, SourceImportProgress, SourceSummary } from "@mdbase-reader/core";

export type { ExtensionCaptureController } from "./capture-controller.js";

// The controller coordinates one popup's explicit actions; I/O is isolated in CaptureWriter.
// eslint-disable-next-line max-lines-per-function
export function useExtensionCapture(tabId: number): ExtensionCaptureController {
  const [session] = useState(
    () =>
      new ReaderPortableApplicationSession({
        serverUrl: "https://connect-lab.mdbase.dev",
        loopbackUrl: "http://127.0.0.1:28487",
        manifest: manifest as MdbaseAppManifest,
        storage: localStorage,
        timeouts: { watchStartMs: 60_000, uploadMs: 120_000 },
      }),
  );
  const [writer] = useState(() => new CaptureWriter());
  const [snapshot, setSnapshot] = useState<ReaderConnectSnapshot>(() => session.getSnapshot());
  const [capture, setCapture] = useState<SelectedWebCapture | null>(null);
  const [draft, setDraft] = useState<CaptureDraft>({
    title: "",
    tags: "",
    note: "",
    comment: "",
    highlight: false,
  });
  const [status, setStatus] = useState<CaptureStatus>("opening");
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<SourceSummary | null>(null);
  const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [projection, setProjection] = useState<ProjectionReport | null>(null);
  const [progress, setProgress] = useState<SourceImportProgress | null>(null);
  const [busy, setBusy] = useState(true);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const lock = useRef(true);
  const discovery = useRef(0);
  const selectedCollection = useRef<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    if (lock.current) {
      return;
    }
    lock.current = true;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setProblem(problemMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress(null);
      setDeviceCode(null);
    }
  }, []);

  const readPage = useCallback(async () => {
    const value = await captureTab(tabId);
    discovery.current++;
    setSource(null);
    setAnnotations([]);
    setCapture(value);
    setDraft((current) => ({
      ...current,
      title: current.title || value.pageTitle,
      highlight: Boolean(value.selection),
    }));
    setStatus("ready");
    setProjection(null);
  }, [tabId]);
  useEffect(() => {
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot();
      const id = next.status === "ready" ? next.collectionId : null;
      if (id !== selectedCollection.current) {
        selectedCollection.current = id;
        discovery.current++;
        setSource(null);
        setAnnotations([]);
        setProjection(null);
      }
      setSnapshot(next);
    });
    // captureTab resolves an external Chrome scripting request before publishing state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void readPage()
      .then(() => session.start())
      .then((outcome) => {
        setProblem(connectProblemMessage(outcome));
      })
      .catch((reason: unknown) => setProblem(problemMessage(reason)))
      .finally(() => {
        lock.current = false;
        setBusy(false);
      });
    return () => {
      unsubscribe();
      session.destroy();
    };
  }, [readPage, session]);

  const collectionId = snapshot.status === "ready" ? snapshot.collectionId : null;
  useEffect(() => {
    const sequence = discovery;
    const epoch = ++sequence.current;
    const collection = session.connectedCollection();
    if (collection && capture) {
      void sourceForUrl(collection, capture.canonicalUrl)
        .then(async (existing) => {
          if (epoch !== discovery.current || !existing) {
            return;
          }
          setSource(existing);
          setStatus("existing");
          const values = await collection.annotations.listForSource(
            collection.collectionId,
            existing.id,
          );
          if (epoch === discovery.current) {
            setAnnotations(values);
          }
        })
        .catch((reason: unknown) => {
          if (epoch === discovery.current) {
            setNotice(`Could not check existing sources: ${problemMessage(reason)}`);
          }
        });
    }
    return () => {
      sequence.current++;
    };
  }, [capture, collectionId, session]);

  const connect = (choose = false): Promise<void> =>
    run(async () => {
      const selected = "collectionId" in session.getSnapshot();
      const outcome = await session.authorize(choose || !selected ? "choose" : "selected", {
        timeoutMs: 10 * 60_000,
        onDeviceCode: ({ userCode }) => setDeviceCode(userCode),
        openVerification: async ({ verificationUriComplete }) => {
          await chrome.tabs.create({ url: verificationUriComplete });
        },
      });
      setProblem(connectProblemMessage(outcome));
      setSnapshot(session.getSnapshot());
    });
  const retry = (): Promise<void> =>
    run(async () => {
      if (!capture) {
        await readPage();
      }
      setProblem(connectProblemMessage(await session.start()));
      setSnapshot(session.getSnapshot());
    });
  const applySetup = (): Promise<void> =>
    run(async () => {
      setProblem(connectProblemMessage(await session.applyCollectionSetup()));
    });
  const select = (id: string): void => {
    if (lock.current) {
      return;
    }
    setProblem(connectProblemMessage(session.select(id)));
    setStatus("ready");
  };
  const save = (): Promise<void> =>
    run(async () => {
      const collection = session.connectedCollection();
      if (!capture || !collection) {
        throw new Error("Connect a collection before saving.");
      }
      discovery.current++;
      setSaveAttempted(true);
      setStatus("saving");
      try {
        const result = await writer.save({
          session,
          collection,
          capture,
          draft,
          onProgress: setProgress,
          onSource: (saved, existing) => {
            setSource(saved);
            setStatus(existing ? "existing" : "saved");
          },
        });
        if (result.annotation) {
          setDraft((value) => ({ ...value, highlight: false, comment: "" }));
          setNotice("Highlight saved to the saved document.");
        }
        try {
          const values = await collection.annotations.listForSource(
            collection.collectionId,
            result.source.id,
          );
          setAnnotations(values);
          if (result.annotation) {
            setProjection(
              await renderAnnotations(tabId, annotationQuotes(values), capture.submittedUrl),
            );
          }
        } catch (reason) {
          setNotice(
            `Saved safely. Could not refresh highlights on this page: ${problemMessage(reason)}`,
          );
        }
      } finally {
        setStatus((current) => (current === "saving" ? "ready" : current));
      }
    });
  const showAnnotations = (): Promise<void> =>
    run(async () => {
      if (capture) {
        setProjection(
          await renderAnnotations(tabId, annotationQuotes(annotations), capture.submittedUrl),
        );
      }
    });
  return {
    snapshot,
    capture,
    draft,
    setDraft,
    status,
    problem,
    notice,
    source,
    annotations,
    deviceCode,
    projection,
    progress,
    busy,
    saveAttempted,
    connect,
    retry,
    applySetup,
    select,
    save,
    showAnnotations,
    readSelection: () => run(readPage),
  };
}

function annotationQuotes(annotations: readonly Annotation[]): readonly PageQuote[] {
  return annotations.flatMap((annotation) =>
    annotation.target?.quote
      ? [{ ...annotation.target.quote, ...(annotation.color ? { color: annotation.color } : {}) }]
      : [],
  );
}
