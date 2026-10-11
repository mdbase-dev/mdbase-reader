import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { ConnectLayout, OpeningScreen } from "@mdbase-dev/ui/screens";
import {
  nativeReaderCollection,
  type MdbaseApplication,
  type MdbaseApplicationConnection,
  type MdbaseApplicationEntry,
  type MdbaseApplicationSnapshot,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { useEffect, useRef, useState, useSyncExternalStore, type JSX, type ReactNode } from "react";

import { CollectionSwitchingContext } from "./CollectionPicker.js";
import { ReaderWorkspace } from "./ReaderWorkspace.js";
import { readyReaderConnection } from "./sdk-ready-connection.js";

export type ReaderSdk = MdbaseApplicationEntry;

export interface ReaderNativeScope {
  readonly application: MdbaseApplication;
  readonly connection: MdbaseApplicationConnection;
  readonly collection: NativeReaderCollection;
}

export interface SdkReaderRootProps {
  readonly sdk: ReaderSdk;
  readonly onSignedOut?: () => void;
  /** An existing app workflow can host connection actions without a nested main. */
  readonly embedded?: boolean;
  /** Real native domain UI only; defaults to the reading workspace over the native collection. */
  readonly renderNative?: (scope: ReaderNativeScope) => ReactNode;
}

type Act = (action: (signal: AbortSignal) => Promise<unknown>) => Promise<void>;

const keys = new WeakMap<ReaderSdk, number>();
let nextKey = 0;
function key(sdk: ReaderSdk): number {
  let value = keys.get(sdk);
  if (value === undefined) {
    value = ++nextKey;
    keys.set(sdk, value);
  }
  return value;
}

/**
 * Reader over the public SDK application entry. The SDK owns sign-in, consent,
 * setup and collection selection; this view forwards lifecycle and selection,
 * opens the workspace only for a current, READY connection, and never closes the
 * borrowed client. Production still starts `ConnectReader` (see docs/new-sdk.md).
 */
export function SdkReaderRoot(props: SdkReaderRootProps): JSX.Element {
  return <ApplicationView key={key(props.sdk)} {...props} />;
}

function ApplicationView({
  sdk,
  renderNative,
  onSignedOut,
  embedded,
}: SdkReaderRootProps): JSX.Element {
  const application = sdk.application();
  const snapshot = useSyncExternalStore(
    (listener) => application.subscribe(listener),
    () => application.getSnapshot(),
    () => application.getSnapshot(),
  );
  const { act, working, problem } = useApplicationLifecycle(application);
  const connection = readyReaderConnection(sdk, snapshot);
  if (connection) {
    return (
      <CollectionSwitchingContext
        value={{
          collectionId: connection.id,
          connections: snapshot.collections.map(({ collectionId, displayName }) => ({
            collectionId,
            displayName,
          })),
          select: (collectionId) => {
            void act((signal) => application.select(collectionId, { signal }));
          },
          // Adding a collection asks Connect to choose one; approval decides what opens.
          connect: () => act((signal) => application.approve(null, { signal })),
        }}
      >
        <NativeScopeView
          key={`${connection.id}:${connection.generation}`}
          application={application}
          connection={connection}
          renderNative={renderNative}
        />
      </CollectionSwitchingContext>
    );
  }
  const screen = connectionScreen(snapshot, problem);
  const actions = (
    <>
      {screen.identity ? <p className="mdbase-connect-status">{screen.identity}</p> : null}
      <ConnectionActions
        application={application}
        snapshot={snapshot}
        screen={screen}
        working={working}
        act={act}
        onSignedOut={onSignedOut}
      />
      <FeedbackButton />
    </>
  );
  if (embedded) {
    return (
      <section className="import-step" aria-labelledby="import-destination-title">
        <h2 id="import-destination-title">Choose a destination</h2>
        <p role={screen.error ? "alert" : "status"}>{screen.message}</p>
        {actions}
      </section>
    );
  }
  return (
    <ConnectLayout
      app="reader"
      title="Open mdbase Reader"
      {...(screen.error ? { error: screen.message } : { status: screen.message })}
    >
      {actions}
    </ConnectLayout>
  );
}

/** Start once (StrictMode-safe), forward foreground state, and run one action at a time. */
function useApplicationLifecycle(application: MdbaseApplication): {
  readonly act: Act;
  readonly working: boolean;
  readonly problem: boolean;
} {
  const caller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState(false);
  useEffect(() => {
    const scope = new AbortController();
    caller.current = scope;
    const foreground = (): void => {
      if (scope.signal.aborted || application.getSnapshot().status === "closed") {
        return;
      }
      try {
        application.setForeground(document.visibilityState === "visible");
      } catch {
        // The SDK owner may already be retired.
      }
    };
    document.addEventListener("visibilitychange", foreground);
    foreground();
    // StrictMode replays effects; only the surviving scope starts the SDK.
    queueMicrotask(() => {
      if (scope.signal.aborted || application.getSnapshot().status !== "not_started") {
        return;
      }
      application.start({ signal: scope.signal }).catch(() => {
        if (!scope.signal.aborted) {
          setProblem(true);
        }
      });
    });
    return () => {
      scope.abort();
      document.removeEventListener("visibilitychange", foreground);
      try {
        if (application.getSnapshot().status !== "closed") {
          application.setForeground(false);
        }
      } catch {
        // No close claim on teardown.
      }
    };
  }, [application]);
  const act: Act = async (action) => {
    const scope = caller.current;
    if (!scope || scope.signal.aborted || busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    setProblem(false);
    try {
      await action(scope.signal);
    } catch {
      if (!aborted(scope)) {
        setProblem(true);
      }
    } finally {
      if (!aborted(scope)) {
        busy.current = false;
        setWorking(false);
      }
    }
  };
  return { act, working, problem };
}

/** Read through a call: the abort state changes across the awaited action. */
function aborted(scope: AbortController): boolean {
  return scope.signal.aborted;
}

interface ConnectionScreenState {
  readonly message: string;
  readonly error: boolean;
  readonly identity: string | null;
  readonly signedIn: boolean;
  readonly setup: boolean;
  readonly approval: boolean;
  /** The requested collection cannot open; offer the chooser instead. */
  readonly rechoose: boolean;
  readonly choosing: boolean;
  readonly closed: boolean;
}

function screenFlags(snapshot: MdbaseApplicationSnapshot): {
  readonly unavailable: boolean;
  readonly closed: boolean;
  readonly waiting: boolean;
  readonly opening: boolean;
  readonly setup: boolean;
  readonly approval: boolean;
  readonly invalid: boolean;
  readonly choosing: boolean;
} {
  const unavailable = snapshot.problem === "application_not_yet_available";
  const closed = snapshot.status === "closed";
  const { state } = snapshot.selection;
  const waiting = snapshot.status === "authorizing" || state === "approving";
  const opening =
    snapshot.status === "starting" || snapshot.status === "opening" || snapshot.readiness.checking;
  return {
    unavailable,
    closed,
    approval: !closed && state === "approval_required",
    invalid: !closed && state === "invalid",
    waiting,
    opening,
    choosing: !closed && !unavailable && !waiting && !opening,
    setup:
      !closed &&
      !unavailable &&
      (snapshot.status === "setup_required" ||
        snapshot.readiness.assessment?.status === "setup_required"),
  };
}

function connectionScreen(
  snapshot: MdbaseApplicationSnapshot,
  problem: boolean,
): ConnectionScreenState {
  const { unavailable, closed, waiting, opening, setup, approval, invalid, choosing } =
    screenFlags(snapshot);
  const signIn = !closed && snapshot.signIn?.state === "paired" ? snapshot.signIn : null;
  const failed = problem || snapshot.status === "blocked";
  const selected = snapshot.collections.find(
    (collection) => collection.collectionId === snapshot.selectedCollectionId,
  );
  const message = [
    [unavailable, "Opening collections isn't available in this build yet."],
    [closed, "mdbase Reader has signed out. Reload to sign in again."],
    [failed, "This action could not be completed. Please try again."],
    [waiting, "Waiting for approval in the mdbase tab…"],
    [invalid, "This link doesn't name a collection mdbase Reader can open."],
    [approval, "mdbase Reader isn't approved for the collection in this link yet."],
    [setup, "This collection needs mdbase Reader setup before reading."],
    [
      opening || snapshot.status === "ready",
      `Opening ${selected?.displayName ?? "your collection"}…`,
    ],
    [signIn !== null, "Choose the collection you want to read from."],
  ] as const;
  return {
    message:
      message.find(([applies]) => applies)?.[1] ??
      "Sign in with your mdbase account to open your collections.",
    error: failed || unavailable || invalid,
    identity: identityLabel(signIn),
    signedIn: signIn !== null,
    setup,
    approval,
    rechoose: approval || invalid,
    choosing,
    closed,
  };
}

function identityLabel(signIn: MdbaseApplicationSnapshot["signIn"]): string | null {
  if (signIn?.accountEmail) {
    return `Signed in as ${signIn.accountEmail}`;
  }
  return signIn?.accountProvider === "github" && signIn.accountLogin
    ? `Signed in as ${signIn.accountLogin} on GitHub`
    : null;
}

function ConnectionActions({
  application,
  snapshot,
  screen,
  working,
  act,
  onSignedOut,
}: {
  readonly application: MdbaseApplication;
  readonly snapshot: MdbaseApplicationSnapshot;
  readonly screen: ConnectionScreenState;
  readonly working: boolean;
  readonly act: Act;
  readonly onSignedOut: SdkReaderRootProps["onSignedOut"];
}): JSX.Element {
  const selected = screen.closed ? null : snapshot.selectedCollectionId;
  const action = (
    label: string,
    run: (signal: AbortSignal) => Promise<unknown>,
    primary = false,
  ): JSX.Element => (
    <button
      key={label}
      type="button"
      className={`mdbase-connect-action mdbase-button${primary ? " is-primary" : ""}`}
      disabled={working}
      onClick={() => void act(run)}
    >
      {label}
    </button>
  );
  return (
    <>
      {screen.choosing && !screen.signedIn
        ? action("Sign in", (signal) => application.authorize({ signal }), true)
        : null}
      {screen.setup
        ? action("Set up mdbase Reader", (signal) => application.configure({ signal }), true)
        : null}
      {screen.approval
        ? action(
            "Approve this collection",
            (signal) => application.approve(undefined, { signal }),
            true,
          )
        : null}
      {screen.choosing
        ? snapshot.collections.map((collection) =>
            action(collection.displayName, (signal) =>
              application.select(collection.collectionId, { signal }),
            ),
          )
        : null}
      {selected
        ? action("Forget collection", (signal) => application.forget(selected, { signal }))
        : null}
      {selected || screen.rechoose
        ? action("Choose another collection", (signal) => application.chooseAnother({ signal }))
        : null}
      {screen.signedIn
        ? action("Sign out", (signal) =>
            application.close().then(() => {
              signal.throwIfAborted();
              onSignedOut?.();
            }),
          )
        : null}
    </>
  );
}

function NativeScopeView({
  application,
  connection,
  renderNative,
}: {
  readonly application: MdbaseApplication;
  readonly connection: MdbaseApplicationConnection;
  readonly renderNative: SdkReaderRootProps["renderNative"];
}): ReactNode {
  // The parent keys by SDK collection ID and generation. A later snapshot may hand
  // back a new facade for the same scope; it must not retire these adapters.
  const [original] = useState(connection);
  const [collection, setCollection] = useState<NativeReaderCollection | null>(null);
  useEffect(() => {
    const opened = nativeReaderCollection(original);
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setCollection(opened);
      }
    });
    return () => {
      active = false;
      opened.dispose();
    };
  }, [original]);
  if (!collection) {
    return <OpeningScreen app="reader" title={`Opening ${original.displayName}`} />;
  }
  if (renderNative) {
    return renderNative({ application, connection: original, collection });
  }
  return <ReaderWorkspace opened={collection} />;
}
