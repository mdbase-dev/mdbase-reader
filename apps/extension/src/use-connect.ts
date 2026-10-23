import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";

import { problemMessage } from "./capture-model.js";
import {
  createExtensionSession,
  rememberCollection,
  type ExtensionSession,
} from "./connect-session.js";
import { connectionView, startingView, type ConnectionView } from "./connection-view.js";

import type { ActionLock } from "./use-action-lock.js";

export interface ConnectLink {
  readonly extension: ExtensionSession | null;
  readonly snapshot: ConnectionView;
  /** Creates this page's SDK entry and starts it (sign-in state loads from its storage). */
  readonly open: () => Promise<ExtensionSession>;
  /** Sign in, or with `choose`, approve this extension for another collection. */
  readonly connect: (choose?: boolean) => Promise<void>;
  /** The settled problem's action (or the readiness check), as the SDK suggests it. */
  readonly retry: () => Promise<void>;
  readonly applySetup: () => Promise<void>;
  readonly select: (id: string) => void;
}

type Run = (signal: AbortSignal) => Promise<unknown>;

/** The recovery for the current screen; null when there is nothing to do here. */
function recovery(
  extension: ExtensionSession,
  view: ConnectionView,
): ((signal: AbortSignal) => Promise<unknown>) | null {
  const { application } = extension;
  if (view.status === "unchecked") {
    return (signal) => application.assess({ signal });
  }
  switch (view.problem?.action) {
    case "sign_in":
      // A refused or expired sign-in starts again through approve (the SDK's sign_in).
      return (signal) => application.approve(undefined, { signal });
    case "approve":
      return (signal) => application.approve(undefined, { signal });
    case "set_up":
      return (signal) => application.configure({ signal });
    case "choose_collection":
      return (signal) => application.chooseAnother({ signal });
    case "check_again":
      return (signal) => application.assess({ signal });
    case "retry":
      return (signal) => application.start({ signal });
    case "update_app": {
      const url = view.problem.updateUrl;
      return url ? () => chrome.tabs.create({ url }) : () => Promise.resolve(location.reload());
    }
    case "reload":
      return () => Promise.resolve(location.reload());
    default:
      return null;
  }
}

export function useConnect(lock: ActionLock): ConnectLink {
  const [extension, setExtension] = useState<ExtensionSession | null>(null);
  const [snapshot, setSnapshot] = useState<ConnectionView>(startingView);
  const { run, locked, setProblem } = lock;
  const [scope] = useState(() => new AbortController());
  const currentSession = useRef<ExtensionSession | null>(null);
  const signInAction = useRef(0);

  useEffect(() => {
    if (!extension) {
      return;
    }
    const { application } = extension;
    currentSession.current = extension;
    const publish = (): void => {
      const usable = extension.connectedCollection() !== null;
      const view = connectionView(application.getSnapshot(), usable, extension.hostAvailable());
      if (view.status === "ready" && view.collectionId) {
        rememberCollection(view.collectionId);
      }
      setSnapshot(view);
    };
    // The SDK follows page visibility itself (followVisibility).
    const unsubscribe = application.subscribe(publish);
    publish();
    return () => {
      unsubscribe();
      currentSession.current = null;
      extension.dispose();
    };
  }, [extension]);
  useEffect(() => () => scope.abort(), [scope]);

  const open = useCallback(async (): Promise<ExtensionSession> => {
    const created = await createExtensionSession();
    setExtension(created);
    const { application } = created;
    if (application.getSnapshot().status === "not_started") {
      await application.start({ signal: scope.signal });
    }
    return created;
  }, [scope]);

  const act = (action: (session: ExtensionSession) => Run | null): Promise<void> =>
    run(async () => {
      if (!extension) {
        throw new Error(t`mdbase is still starting. Try again in a moment.`);
      }
      const next = action(extension);
      if (next) {
        await next(scope.signal);
      }
    });
  const approveSignIn = (): Promise<void> => {
    if (!extension || scope.signal.aborted) {
      return Promise.resolve();
    }
    const ordinal = ++signInAction.current;
    const current = (): boolean =>
      !scope.signal.aborted &&
      currentSession.current === extension &&
      ordinal === signInAction.current;
    // Invoke from the gesture even while authorizing; renewal belongs to the SDK.
    return extension.application.approve(undefined, { signal: scope.signal }).then(
      () => {
        if (current()) {
          setProblem(null);
        }
      },
      (reason: unknown) => {
        if (current()) {
          setProblem(problemMessage(reason));
        }
      },
    );
  };
  const connect = (choose = false): Promise<void> =>
    choose && snapshot.signedIn
      ? act(
          ({ application }) =>
            (signal) =>
              application.approve(null, { signal }),
        )
      : snapshot.status === "waiting" || snapshot.problem?.action === "sign_in"
        ? approveSignIn()
        : act(
            ({ application }) =>
              (signal) =>
                application.approve(undefined, { signal }),
          );
  // Without an SDK suggestion, retry starts again (or reopens, if opening failed).
  const retry = (): Promise<void> => {
    if (!extension) {
      return run(async () => {
        await open();
      });
    }
    if (snapshot.problem?.action === "sign_in") {
      return approveSignIn();
    }
    return act(
      (session) =>
        recovery(session, snapshot) ?? ((signal) => session.application.start({ signal })),
    );
  };
  const applySetup = (): Promise<void> =>
    act(
      ({ application }) =>
        (signal) =>
          application.configure({ signal }),
    );
  const select = (id: string): void => {
    if (locked() || !extension) {
      return;
    }
    void run(async () => {
      await extension.application.select(id, { signal: scope.signal });
    });
  };
  return { extension, snapshot, open, connect, retry, applySetup, select };
}
