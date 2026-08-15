import {
  ReaderPortableApplicationSession,
  connectProblemMessage,
  type MdbaseAppManifest,
  type ReaderConnectSnapshot,
} from "@mdbase-reader/connect";
import {
  importSourceFile,
  type Annotation,
  type SourceImportProgress,
  type SourceSummary,
} from "@mdbase-reader/core";
import { createReaderRuntimeServices } from "@mdbase-reader/platform";
import { webCaptureImport, type LiveWebCapture } from "@mdbase-reader/web-capture";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { localStorageAdapter, problemMessage, sourceForUrl } from "./capture-model.js";
import manifest from "./generated/mdbase-app.json";
import { captureTab, renderAnnotations } from "./page-capture.js";

const STAGING_CONNECT = "https://connect-staging.mdbase.dev";
export const STAGING_READER = "https://mdbase-reader.pages.dev/";

export type CaptureStatus = "opening" | "ready" | "saving" | "saved" | "existing" | "error";

export interface ExtensionCaptureController {
  readonly snapshot: ReaderConnectSnapshot;
  readonly capture: LiveWebCapture | null;
  readonly status: CaptureStatus;
  readonly problem: string | null;
  readonly source: SourceSummary | null;
  readonly annotations: readonly Annotation[];
  readonly deviceCode: string | null;
  readonly renderedCount: number | null;
  readonly progress: SourceImportProgress | null;
  readonly connect: () => Promise<void>;
  readonly applySetup: () => Promise<void>;
  readonly select: (collectionId: string) => void;
  readonly changeCollection: () => void;
  readonly showAnnotations: () => Promise<void>;
}

export function useExtensionCapture(tabId: number): ExtensionCaptureController {
  const session = useMemo(() => portableSession(), []);
  const [snapshot, setSnapshot] = useState<ReaderConnectSnapshot>(() => session.getSnapshot());
  const [capture, setCapture] = useState<LiveWebCapture | null>(null);
  const captureRef = useRef<LiveWebCapture | null>(null);
  const [status, setStatus] = useState<CaptureStatus>("opening");
  const [problem, setProblem] = useState<string | null>(null);
  const [source, setSource] = useState<SourceSummary | null>(null);
  const [annotations, setAnnotations] = useState<readonly Annotation[]>([]);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [renderedCount, setRenderedCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<SourceImportProgress | null>(null);
  const setters = useMemo(
    () => ({ setProblem, setSource, setAnnotations, setStatus, setProgress }),
    [],
  );
  const save = useSaveCapture(session, setters);

  useEffect(() => {
    const refresh = (): void => {
      const current = session.getSnapshot();
      setSnapshot(current);
      if (current.status === "ready" && captureRef.current) {
        void save(captureRef.current);
      }
    };
    const unsubscribe = session.subscribe(refresh);
    void session.start().then((outcome) => {
      setProblem(connectProblemMessage(outcome));
      refresh();
    });
    void captureTab(tabId)
      .then((value) => {
        captureRef.current = value;
        setCapture(value);
        setStatus("ready");
        void save(value);
      })
      .catch((reason: unknown) => {
        setProblem(problemMessage(reason));
        setStatus("error");
      });
    return () => {
      unsubscribe();
      session.destroy();
    };
  }, [save, session, tabId]);

  const connect = useCallback(async (): Promise<void> => {
    setProblem(null);
    const target = session.getSnapshot().status === "unselected" ? "choose" : "selected";
    const outcome = await session.authorize(target, {
      onDeviceCode: ({ userCode }) => setDeviceCode(userCode),
      openVerification: async ({ verificationUriComplete }) => {
        await chrome.tabs.create({ url: verificationUriComplete });
      },
    });
    setProblem(connectProblemMessage(outcome));
    setDeviceCode(null);
    setSnapshot(session.getSnapshot());
  }, [session]);

  const applySetup = useCallback(async (): Promise<void> => {
    setProblem(null);
    const outcome = await session.applyCollectionSetup();
    setProblem(connectProblemMessage(outcome));
    setSnapshot(session.getSnapshot());
  }, [session]);

  const showAnnotations = useCallback(async (): Promise<void> => {
    const quotes = annotations.flatMap((annotation) => {
      const exact = annotation.target?.quote?.exact;
      return exact ? [{ exact, ...(annotation.color ? { color: annotation.color } : {}) }] : [];
    });
    setRenderedCount(await renderAnnotations(tabId, quotes));
  }, [annotations, tabId]);

  const select = (id: string): void => {
    session.select(id);
    setSnapshot(session.getSnapshot());
  };
  const changeCollection = (): void => {
    session.clearSelection();
    setSource(null);
    setAnnotations([]);
    setRenderedCount(null);
    setProgress(null);
    setProblem(null);
    setStatus(captureRef.current ? "ready" : "opening");
    setSnapshot(session.getSnapshot());
  };
  return {
    snapshot,
    capture,
    status,
    problem,
    source,
    annotations,
    deviceCode,
    renderedCount,
    progress,
    connect,
    applySetup,
    select,
    changeCollection,
    showAnnotations,
  };
}

interface CaptureSetters {
  readonly setProblem: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setSource: React.Dispatch<React.SetStateAction<SourceSummary | null>>;
  readonly setAnnotations: React.Dispatch<React.SetStateAction<readonly Annotation[]>>;
  readonly setStatus: React.Dispatch<React.SetStateAction<CaptureStatus>>;
  readonly setProgress: React.Dispatch<React.SetStateAction<SourceImportProgress | null>>;
}

function useSaveCapture(
  session: ReaderPortableApplicationSession,
  setters: CaptureSetters,
): (value: LiveWebCapture) => Promise<void> {
  const operation = useRef(false);
  return useCallback(
    async (value) => {
      const collection = session.connectedCollection();
      if (!collection || operation.current) {
        return;
      }
      operation.current = true;
      setters.setProblem(null);
      setters.setProgress(null);
      try {
        let existing = await sourceForUrl(collection, value.canonicalUrl);
        if (existing) {
          await showSavedSource(collection, existing, "existing", setters);
          return;
        }
        const pending = await recoverPendingWrites(session);
        if (pending) {
          existing = await sourceForUrl(collection, value.canonicalUrl);
          if (existing) {
            await showSavedSource(collection, existing, "saved", setters);
            return;
          }
        }
        setters.setStatus("saving");
        const prepared = await webCaptureImport(value);
        const dependencies = {
          imports: collection.sourceImports,
          ...createReaderRuntimeServices(localStorageAdapter()),
        };
        const request = {
          collectionId: collection.collectionId,
          name: prepared.name,
          declaredMediaType: "text/html",
          bytes: prepared.bytes,
          title: prepared.title,
          archive: prepared.archive,
          capture: prepared.capture,
          metadata: prepared.metadata,
        } as const;
        try {
          const imported = await importSourceFile(dependencies, request, {
            recoverExistingFiles: pending,
            onProgress: setters.setProgress,
          });
          await showSavedSource(collection, imported, "saved", setters);
        } catch (reason) {
          const recovered = await recoverPendingWrites(session);
          if (!recovered) {
            throw reason;
          }
          existing = await sourceForUrl(collection, value.canonicalUrl);
          if (existing) {
            await showSavedSource(collection, existing, "saved", setters);
            return;
          }
          const imported = await importSourceFile(dependencies, request, {
            recoverExistingFiles: true,
            onProgress: setters.setProgress,
          });
          await showSavedSource(collection, imported, "saved", setters);
        }
      } catch (reason) {
        setters.setProblem(problemMessage(reason));
        setters.setStatus("error");
      } finally {
        operation.current = false;
      }
    },
    [session, setters],
  );
}

async function recoverPendingWrites(session: ReaderPortableApplicationSession): Promise<boolean> {
  const outcomes = await session.recoverPendingMutations();
  const failure = outcomes.find((outcome) => !outcome.ok);
  if (failure && !failure.ok) {
    throw new Error(failure.problem.message);
  }
  return outcomes.length > 0;
}

async function showSavedSource(
  collection: NonNullable<ReturnType<ReaderPortableApplicationSession["connectedCollection"]>>,
  source: SourceSummary,
  status: "saved" | "existing",
  setters: CaptureSetters,
): Promise<void> {
  setters.setSource(source);
  setters.setAnnotations(
    await collection.annotations.listForSource(collection.collectionId, source.id),
  );
  setters.setProgress(null);
  setters.setStatus(status);
}

function portableSession(): ReaderPortableApplicationSession {
  return new ReaderPortableApplicationSession({
    serverUrl: STAGING_CONNECT,
    loopbackUrl: "http://127.0.0.1:28486",
    manifest: manifest as MdbaseAppManifest,
    storage: localStorage,
    timeouts: { watchStartMs: 60_000, uploadMs: 120_000 },
  });
}
