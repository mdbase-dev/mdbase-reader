import {
  connectProblemMessage,
  type ReaderConnectSnapshot,
  type ReaderPortableApplicationSession,
} from "@mdbase-reader/connect";
import { useCallback, useEffect, useState } from "react";

import {
  createExtensionSession,
  rememberCollection,
  restoreCollection,
  type ExtensionSession,
} from "./connect-session.js";

import type { ActionLock } from "./use-action-lock.js";

const notStarted: ReaderConnectSnapshot = { status: "not_started", connections: [] };

export interface ConnectLink {
  readonly extension: ExtensionSession | null;
  readonly snapshot: ReaderConnectSnapshot;
  readonly deviceCode: string | null;
  /** Creates the session (grants load from extension storage) and restores the last collection. */
  readonly open: () => Promise<ReaderPortableApplicationSession>;
  readonly connect: (choose?: boolean) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly applySetup: () => Promise<void>;
  readonly select: (id: string) => void;
}

export function useConnect(lock: ActionLock): ConnectLink {
  const [extension, setExtension] = useState<ExtensionSession | null>(null);
  const [snapshot, setSnapshot] = useState<ReaderConnectSnapshot>(notStarted);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const { run, setProblem, locked } = lock;

  useEffect(() => {
    if (!extension) {
      return;
    }
    const { session } = extension;
    const unsubscribe = session.subscribe(() => setSnapshot(session.getSnapshot()));
    return () => {
      unsubscribe();
      session.destroy();
    };
  }, [extension]);

  const open = useCallback(async (): Promise<ReaderPortableApplicationSession> => {
    const created = await createExtensionSession();
    setExtension(created);
    const problem = connectProblemMessage(await created.session.start());
    if (problem) {
      setProblem(problem);
    }
    setSnapshot(await restoreCollection(created.session));
    return created.session;
  }, [setProblem]);

  const connect = (choose = false): Promise<void> =>
    run(async () => {
      const session = extension?.session;
      if (!session) {
        throw new Error("mdbase Connect is still starting. Try again in a moment.");
      }
      const selected = "collectionId" in session.getSnapshot();
      try {
        const outcome = await session.authorize(choose || !selected ? "choose" : "selected", {
          timeoutMs: 10 * 60_000,
          onDeviceCode: ({ userCode }) => setDeviceCode(userCode),
          openVerification: async ({ verificationUriComplete }) => {
            await chrome.tabs.create({ url: verificationUriComplete });
          },
        });
        setProblem(connectProblemMessage(outcome));
      } finally {
        setDeviceCode(null);
      }
      const next = session.getSnapshot();
      if ("collectionId" in next) {
        rememberCollection(next.collectionId);
      }
      setSnapshot(next);
    });
  const retry = (): Promise<void> =>
    run(async () => {
      const session = extension?.session;
      if (!session) {
        await open();
        return;
      }
      setProblem(connectProblemMessage(await session.start()));
      setSnapshot(await restoreCollection(session));
    });
  const applySetup = (): Promise<void> =>
    run(async () => {
      const session = extension?.session;
      if (session) {
        setProblem(connectProblemMessage(await session.applyCollectionSetup()));
      }
    });
  const select = (id: string): void => {
    const session = extension?.session;
    if (locked() || !session) {
      return;
    }
    const outcome = session.select(id);
    setProblem(connectProblemMessage(outcome));
    if (outcome.ok) {
      rememberCollection(id);
    }
  };
  return { extension, snapshot, deviceCode, open, connect, retry, applySetup, select };
}
