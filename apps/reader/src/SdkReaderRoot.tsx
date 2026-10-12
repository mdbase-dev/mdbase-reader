import { FeedbackButton } from "@mdbase-dev/ui/feedback";
import { ConnectLayout, OpeningScreen } from "@mdbase-dev/ui/screens";
import {
  describeError,
  nativeReaderCollection,
  summarizeStatus,
  type MdbaseApplication,
  type MdbaseApplicationConnection,
  type MdbaseApplicationEntry,
  type MdbaseApplicationSnapshot,
  type MdbaseErrorDescription,
  type NativeReaderCollection,
} from "@mdbase-reader/connect/native";
import { useEffect, useRef, useState, useSyncExternalStore, type JSX, type ReactNode } from "react";

import { CollectionSwitchingContext } from "./CollectionPicker.js";
import { ReaderWorkspace } from "./ReaderWorkspace.js";
import { readyReaderConnection } from "./sdk-ready-connection.js";
import { SdkSetupReview } from "./SdkSetupReview.js";

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

type Act = (action: (signal: AbortSignal) => Promise<unknown>, signIn?: boolean) => Promise<void>;

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
  // Setup always goes through one review; nothing is written before Confirm.
  const [reviewing, setReviewing] = useState(false);
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
          problem={snapshot.problem}
          renderNative={renderNative}
        />
      </CollectionSwitchingContext>
    );
  }
  const selected = snapshot.collections.find(
    (collection) => collection.collectionId === snapshot.selectedCollectionId,
  );
  // The review stays until it finishes or is cancelled: status changes while
  // setup is applying must not unmount it and abort the apply.
  if (reviewing && selected) {
    return (
      <SdkSetupReview
        application={application}
        displayName={selected.displayName}
        embedded={embedded ?? false}
        onCancel={() => setReviewing(false)}
        onApplied={() => setReviewing(false)}
      />
    );
  }
  const review: Run = () => {
    setReviewing(true);
    return Promise.resolve();
  };
  const screen = connectionScreen(application, snapshot, problem, review);
  const actions = (
    <>
      {screen.identity ? <p className="mdbase-connect-status">{screen.identity}</p> : null}
      <ConnectionActions
        application={application}
        snapshot={snapshot}
        screen={screen}
        working={working}
        act={act}
        review={review}
        onSignedOut={onSignedOut}
      />
      <FeedbackButton />
    </>
  );
  if (embedded) {
    return (
      <section className="import-step" aria-labelledby="import-destination-title">
        <h2 id="import-destination-title">Choose a destination</h2>
        {screen.title ? <h3>{screen.title}</h3> : null}
        <p role={screen.error ? "alert" : "status"}>{screen.message}</p>
        {actions}
      </section>
    );
  }
  return (
    <ConnectLayout
      app="reader"
      title={screen.title ?? "Open mdbase Reader"}
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
  readonly problem: MdbaseErrorDescription | null;
} {
  const caller = useRef<AbortController | null>(null);
  const busy = useRef(0);
  const latestAction = useRef(0);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<MdbaseErrorDescription | null>(null);
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
      application.start({ signal: scope.signal }).catch((error: unknown) => {
        if (!scope.signal.aborted) {
          setProblem(describeError(error) ?? describeError("internal"));
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
  const act: Act = async (action, signIn = false) => {
    const scope = caller.current;
    if (!scope || scope.signal.aborted || (busy.current > 0 && !signIn)) {
      return;
    }
    // The SDK owns sign-in serialization/renewal, not this UI's busy flag.
    const ordinal = ++latestAction.current;
    busy.current++;
    setWorking(true);
    setProblem(null);
    try {
      await action(scope.signal);
    } catch (error: unknown) {
      if (!aborted(scope) && ordinal === latestAction.current) {
        setProblem(describeError(error) ?? describeError("internal"));
      }
    } finally {
      busy.current--;
      if (!aborted(scope)) {
        setWorking(busy.current > 0);
      }
    }
  };
  return { act, working, problem };
}

/** Read through a call: the abort state changes across the awaited action. */
function aborted(scope: AbortController): boolean {
  return scope.signal.aborted;
}

type Run = (signal: AbortSignal) => Promise<unknown>;
/** The one SDK-suggested way out of a settled problem. */
type Recovery =
  | { readonly label: string; readonly href: string }
  | { readonly label: string; readonly run: Run; readonly signIn?: true }
  | { readonly label: string; readonly reload: true };

interface ConnectionScreenState {
  readonly message: string;
  /** The SDK's heading for a settled problem; null keeps the default title. */
  readonly title: string | null;
  readonly recovery: Recovery | null;
  /** Ready but unchecked: offer the SDK's readiness check. */
  readonly checkAgain: boolean;
  readonly error: boolean;
  readonly identity: string | null;
  readonly signedIn: boolean;
  readonly waiting: boolean;
  readonly setup: boolean;
  readonly approval: boolean;
  /** The requested collection cannot open; offer the chooser instead. */
  readonly rechoose: boolean;
  readonly choosing: boolean;
  readonly closed: boolean;
}

type ScreenFlags = ReturnType<typeof screenFlags>;

/** A settled readiness problem or incompatible collection ends Opening. */
function readinessState(snapshot: MdbaseApplicationSnapshot): {
  readonly readinessProblem: boolean;
  readonly incompatible: boolean;
} {
  const { problem, assessment, checking } = snapshot.readiness;
  if (checking) {
    return { readinessProblem: false, incompatible: false };
  }
  return {
    readinessProblem: problem !== null || assessment?.problem != null,
    incompatible: assessment?.status === "incompatible",
  };
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
  readonly readinessProblem: boolean;
  readonly incompatible: boolean;
} {
  const unavailable = snapshot.problem === "application_not_yet_available";
  const closed = snapshot.status === "closed";
  const { state } = snapshot.selection;
  const waiting = snapshot.status === "authorizing" || state === "approving";
  const readiness = readinessState(snapshot);
  const opening =
    !readiness.readinessProblem &&
    !readiness.incompatible &&
    (snapshot.status === "starting" ||
      snapshot.status === "opening" ||
      snapshot.readiness.checking);
  return {
    ...readiness,
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

/** Blocked, readiness and incompatible states use the SDK's shared copy and action. */
function describedProblem(
  snapshot: MdbaseApplicationSnapshot,
  flags: ScreenFlags,
): MdbaseErrorDescription | null {
  const { closed, unavailable, waiting, invalid, approval, readinessProblem, incompatible } = flags;
  if (closed || unavailable || waiting || invalid || approval) {
    return null;
  }
  return snapshot.status === "blocked" || readinessProblem || incompatible
    ? describeError(snapshot)
    : null;
}

interface SettledScreen {
  readonly described: MdbaseErrorDescription | null;
  readonly recovery: Recovery | null;
  readonly unchecked: boolean;
  /** READY evidence without a usable connection: the SDK retired this one. */
  readonly retired: boolean;
  /** This collection cannot open as is; offer the chooser. */
  readonly rechoose: boolean;
}

function actionableProblem(
  snapshot: MdbaseApplicationSnapshot,
  flags: ScreenFlags,
): MdbaseErrorDescription | null {
  if (flags.closed || flags.unavailable) {
    return describedProblem(snapshot, flags);
  }
  const described = describeError(snapshot);
  return described?.action === "sign_in" ? described : describedProblem(snapshot, flags);
}

function canContinueSignIn(flags: ScreenFlags): boolean {
  return flags.waiting && !flags.closed && !flags.unavailable;
}

function settledScreen(
  application: MdbaseApplication,
  snapshot: MdbaseApplicationSnapshot,
  flags: ScreenFlags,
  review: Run,
  actionProblem: MdbaseErrorDescription | null,
): SettledScreen {
  const described = actionProblem ?? actionableProblem(snapshot, flags);
  const settledReady = snapshot.status === "ready" && !flags.opening;
  const { assessment } = snapshot.readiness;
  const retired = settledReady && !flags.readinessProblem && assessment?.status === "ready";
  return {
    described,
    recovery: described
      ? recoveryAction(
          application,
          described,
          flags.readinessProblem && snapshot.status !== "blocked",
          review,
        )
      : null,
    unchecked: settledReady && assessment === null && described === null,
    retired,
    rechoose: flags.incompatible || flags.readinessProblem || retired,
  };
}

function screenMessage(
  snapshot: MdbaseApplicationSnapshot,
  flags: ScreenFlags,
  settled: SettledScreen,
  failed: boolean,
  signedIn: boolean,
): string {
  const selected = snapshot.collections.find(
    (collection) => collection.collectionId === snapshot.selectedCollectionId,
  );
  const message = [
    [flags.unavailable, "Opening collections isn't available in this build yet."],
    [flags.closed, "mdbase Reader has signed out. Reload to sign in again."],
    [settled.described !== null, settled.described?.message ?? ""],
    [failed, "This action could not be completed. Please try again."],
    [flags.waiting, "Waiting for approval in the mdbase tab…"],
    [flags.invalid, "This link doesn't name a collection mdbase Reader can open."],
    [flags.approval, "mdbase Reader isn't approved for the collection in this link yet."],
    [flags.setup, "This collection needs mdbase Reader setup before reading."],
    [settled.unchecked, "This collection hasn't been checked yet. Check again before reading."],
    [
      settled.retired,
      "The connection to this collection has changed. Choose the collection again.",
    ],
    [
      flags.opening || snapshot.status === "ready",
      `Opening ${selected?.displayName ?? "your collection"}…`,
    ],
    [signedIn, "Choose the collection you want to read from."],
  ] as const;
  return (
    message.find(([applies]) => applies)?.[1] ??
    "Sign in with your mdbase account to open your collections."
  );
}

function connectionScreen(
  application: MdbaseApplication,
  snapshot: MdbaseApplicationSnapshot,
  problem: MdbaseErrorDescription | null,
  review: Run,
): ConnectionScreenState {
  const flags = screenFlags(snapshot);
  const settled = settledScreen(application, snapshot, flags, review, problem);
  const signIn = !flags.closed && snapshot.signIn?.state === "paired" ? snapshot.signIn : null;
  const failed = problem !== null || snapshot.status === "blocked";
  return {
    message: screenMessage(snapshot, flags, settled, failed, signIn !== null),
    error: failed || flags.unavailable || flags.invalid || settled.rechoose,
    title: settled.described?.title ?? null,
    recovery: settled.recovery,
    checkAgain: settled.unchecked,
    identity: identityLabel(signIn),
    signedIn: signIn !== null,
    waiting: canContinueSignIn(flags),
    setup: flags.setup && settled.described?.action !== "set_up",
    approval: flags.approval,
    rechoose: flags.approval || flags.invalid || settled.rechoose,
    choosing: flags.choosing,
    closed: flags.closed,
  };
}

/** Map the SDK's suggested action onto one Reader control. Readiness problems
 * re-check rather than restart; a web app updates by reloading. */
function recoveryAction(
  application: MdbaseApplication,
  problem: MdbaseErrorDescription,
  readiness: boolean,
  review: Run,
): Recovery | null {
  const label = problem.actionLabel ?? "Try again";
  switch (problem.action) {
    case "sign_in":
      return { label, signIn: true, run: (signal) => application.approve(undefined, { signal }) };
    case "approve":
      return { label, run: (signal) => application.approve(undefined, { signal }) };
    case "set_up":
      return { label, run: review };
    case "choose_collection":
      return { label, run: (signal) => application.chooseAnother({ signal }) };
    case "update_app":
      return problem.updateUrl ? { label, href: problem.updateUrl } : { label, reload: true };
    case "retry":
    case "check_connection":
    case "reload":
      if (readiness) {
        return { label: "Check again", run: (signal) => application.assess({ signal }) };
      }
      return problem.action === "reload"
        ? { label, reload: true }
        : { label, run: (signal) => application.start({ signal }) };
    default:
      return null;
  }
}

function identityLabel(signIn: MdbaseApplicationSnapshot["signIn"]): string | null {
  if (signIn?.accountEmail) {
    return `Signed in as ${signIn.accountEmail}`;
  }
  return signIn?.accountProvider === "github" && signIn.accountLogin
    ? `Signed in as ${signIn.accountLogin} on GitHub`
    : null;
}

const setupActionLabel = describeError("setup_required")?.actionLabel ?? "Set up";

function ConnectionActions({
  application,
  snapshot,
  screen,
  working,
  act,
  review,
  onSignedOut,
}: {
  readonly application: MdbaseApplication;
  readonly snapshot: MdbaseApplicationSnapshot;
  readonly screen: ConnectionScreenState;
  readonly working: boolean;
  readonly act: Act;
  readonly review: Run;
  readonly onSignedOut: SdkReaderRootProps["onSignedOut"];
}): JSX.Element {
  const selected = screen.closed ? null : snapshot.selectedCollectionId;
  const action = (
    label: string,
    run: (signal: AbortSignal) => Promise<unknown>,
    primary = false,
    signIn = false,
  ): JSX.Element => (
    <button
      key={label}
      type="button"
      className={`mdbase-connect-action mdbase-button${primary ? " is-primary" : ""}`}
      disabled={working && !signIn}
      onClick={() => void act(run, signIn)}
    >
      {label}
    </button>
  );
  const { recovery } = screen;
  return (
    <div className="sdk-connection-actions">
      {recovery ? <RecoveryControl recovery={recovery} working={working} act={act} /> : null}
      {screen.checkAgain
        ? action("Check again", (signal) => application.assess({ signal }), true)
        : null}
      {((screen.choosing && !screen.signedIn) || screen.waiting) && !recovery
        ? action("Sign in", (signal) => application.approve(undefined, { signal }), true, true)
        : null}
      {screen.setup ? action(setupActionLabel, review, true) : null}
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
    </div>
  );
}

function RecoveryControl({
  recovery,
  working,
  act,
}: {
  readonly recovery: Recovery;
  readonly working: boolean;
  readonly act: Act;
}): JSX.Element {
  const className = "mdbase-connect-action mdbase-button is-primary";
  if ("href" in recovery) {
    return (
      <a className={className} href={recovery.href}>
        {recovery.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      disabled={working && !("signIn" in recovery && recovery.signIn)}
      onClick={() =>
        "reload" in recovery ? window.location.reload() : void act(recovery.run, recovery.signIn)
      }
    >
      {recovery.label}
    </button>
  );
}

function NativeScopeView({
  application,
  connection,
  problem,
  renderNative,
}: {
  readonly application: MdbaseApplication;
  readonly connection: MdbaseApplicationConnection;
  readonly problem: MdbaseApplicationSnapshot["problem"];
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
  return (
    <>
      <NativeStatus connection={original} problem={problem} />
      {renderNative ? (
        renderNative({ application, connection: original, collection })
      ) : (
        <ReaderWorkspace opened={collection} />
      )}
    </>
  );
}

function NativeStatus({
  connection,
  problem,
}: {
  readonly connection: MdbaseApplicationConnection;
  readonly problem: MdbaseApplicationSnapshot["problem"];
}): ReactNode {
  const status = useSyncExternalStore(
    (listener) => connection.records.onStatus(listener),
    () => connection.records.status,
    () => connection.records.status,
  );
  const summary = summarizeStatus(status, problem);
  const description = describeError(problem);
  return summary.kind === "collection_migrating" ||
    summary.kind === "update_required" ||
    summary.kind === "account_suspended" ? (
    <p className="mdbase-connect-status" role="status">
      {summary.text}
      {description?.action === "update_app" && description.updateUrl ? (
        <>
          {" "}
          <a href={description.updateUrl} target="_blank" rel="noreferrer">
            {description.actionLabel}
          </a>
        </>
      ) : null}
    </p>
  ) : null;
}
