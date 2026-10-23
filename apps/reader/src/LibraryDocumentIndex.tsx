import { createContext, useContext, useEffect, useState, type JSX, type ReactNode } from "react";

import { archivedHtmlTextExtractor } from "./document-text-extraction.js";
import { LibraryIndexIdle } from "./library-index-idle.js";
import { runLibraryIndexQueue, type LibraryIndexProgress } from "./library-index-queue.js";
import { LibraryTextClient } from "./library-text-client.js";

import type { ReaderLibrarySnapshot, ReaderWorkspaceGateway } from "./workspace-model.js";

interface LibraryIndexState {
  readonly client: LibraryTextClient | null;
  readonly version: number;
  readonly status: string;
  readonly paused: boolean;
  readonly togglePause: (() => void) | undefined;
}
interface IndexSession {
  readonly client: LibraryTextClient;
  readonly idle: LibraryIndexIdle;
  readonly attempted: Set<string>;
  readonly collection: string;
  readonly gateway: ReaderWorkspaceGateway;
}
const initialState: LibraryIndexState = {
  client: null,
  version: 0,
  status: "Library index unavailable; searching loaded documents only.",
  paused: false,
  togglePause: undefined,
};
const LibraryIndexContext = createContext<LibraryIndexState>(initialState);

export function useLibraryDocumentIndex(): LibraryIndexState {
  return useContext(LibraryIndexContext);
}

function useIndexSession(
  collection: string | undefined,
  gateway: ReaderWorkspaceGateway,
  fail: (failed: boolean) => void,
): IndexSession | null {
  const [session, setSession] = useState<IndexSession | null>(null);
  useEffect(() => {
    if (!collection) {
      return undefined;
    }
    const controller = new AbortController();
    let client: LibraryTextClient | undefined;
    const idle = new LibraryIndexIdle();
    void (async () => {
      try {
        await idle.wait(controller.signal);
        client = new LibraryTextClient(() => {
          if (!controller.signal.aborted) {
            fail(true);
          }
        });
        await client.open(collection);
        if (!controller.signal.aborted) {
          fail(false);
          setSession({ client, idle, attempted: new Set(), collection, gateway });
        }
      } catch {
        client?.close();
        if (!controller.signal.aborted) {
          fail(true);
        }
      }
    })();
    return () => {
      controller.abort();
      idle.dispose();
      client?.close();
    };
  }, [collection, gateway, fail]);
  return session?.collection === collection && session?.gateway === gateway ? session : null;
}

export function LibraryDocumentIndex({
  library,
  gateway,
  children,
}: {
  readonly library: ReaderLibrarySnapshot;
  readonly gateway: ReaderWorkspaceGateway;
  readonly children: ReactNode;
}): JSX.Element {
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [progress, setProgress] = useState<LibraryIndexProgress | null>(null);
  const session = useIndexSession(library.sources[0]?.collectionId, gateway, setFailed);
  useEffect(() => {
    if (!session || paused || failed) {
      return undefined;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        await session.idle.wait(controller.signal);
        const extract = await archivedHtmlTextExtractor();
        controller.signal.throwIfAborted();
        const files = new Map(
          library.sources.flatMap((source) =>
            source.documents.map((file) => [file.fileId, file] as const),
          ),
        );
        await runLibraryIndexQueue({
          files: [...files.values()],
          complete: library.sourceIndex?.complete !== false,
          client: session.client,
          gateway,
          signal: controller.signal,
          idle: (signal) => session.idle.wait(signal),
          extract,
          attempted: session.attempted,
          report: (next) => {
            if (!controller.signal.aborted) {
              setProgress(next);
              setVersion((value) => value + 1);
            }
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          session.client.close();
          setFailed(true);
        }
      }
    })();
    return () => controller.abort();
  }, [failed, gateway, library.sources, library.sourceIndex?.complete, paused, session]);
  return (
    <LibraryIndexContext
      value={{
        client: failed ? null : (session?.client ?? null),
        version,
        status: failed ? initialState.status : indexStatus(progress, paused),
        paused,
        togglePause: failed ? undefined : () => setPaused((value) => !value),
      }}
    >
      {children}
    </LibraryIndexContext>
  );
}

function indexStatus(progress: LibraryIndexProgress | null, paused: boolean): string {
  let activity = "Library text index waiting for idle time.";
  if (paused) {
    activity = "Library indexing paused.";
  } else if (progress) {
    activity = `Library text: ${String(progress.checked)} of ${String(progress.total)} saved pages checked${progress.skipped ? `; ${String(progress.skipped)} skipped or evicted` : ""}.`;
  }
  return `${activity} Saved HTML pages up to 256 KiB are indexed on this device; PDF/EPUB and larger pages use loaded-document search. Index storage is limited to 32 MiB.`;
}
