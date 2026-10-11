import { describeError, type MdbaseApplicationSnapshot } from "@mdbase-reader/connect/native";

/**
 * What the extension's pages show for the SDK's application snapshot. The SDK owns
 * sign-in, selection, setup and readiness; this only names the screen to show.
 */
export type ConnectionStatus =
  /** Starting, opening or checking the collection. */
  | "opening"
  | "signed_out"
  /** Waiting for sign-in or approval in the mdbase tab. */
  | "waiting"
  /** Signed in without a usable selected collection. */
  | "choosing"
  /** The selected collection needs this extension approved for it. */
  | "approval"
  | "setup"
  /** Open but not yet checked; offer the SDK's readiness check. */
  | "unchecked"
  /** A settled problem with the SDK's copy and one action. */
  | "problem"
  | "ready"
  | "closed";

/** The SDK's suggested way out of a settled problem. */
export type RecoveryAction =
  | "sign_in"
  | "approve"
  | "set_up"
  | "choose_collection"
  | "update_app"
  | "retry"
  | "reload"
  | "check_again"
  | null;

export interface ConnectionProblemView {
  readonly title: string;
  readonly message: string;
  readonly action: RecoveryAction;
  readonly actionLabel: string | null;
  readonly updateUrl: string | null;
}

export interface ConnectionCollection {
  readonly collectionId: string;
  readonly displayName: string;
}

export interface ConnectionView {
  readonly status: ConnectionStatus;
  readonly collections: readonly ConnectionCollection[];
  /** The SDK's selected collection, usable or not. */
  readonly collectionId: string | null;
  readonly signedIn: boolean;
  readonly identity: string | null;
  readonly problem: ConnectionProblemView | null;
}

export const startingView: ConnectionView = {
  status: "opening",
  collections: [],
  collectionId: null,
  signedIn: false,
  identity: null,
  problem: null,
};

const retired: ConnectionProblemView = {
  title: "Choose the collection again",
  message: "The connection to this collection has changed. Choose the collection again.",
  action: "choose_collection",
  actionLabel: "Choose a collection",
  updateUrl: null,
};

/** The SDK's description of a settled problem, as one extension control. */
function sdkProblem(
  snapshot: MdbaseApplicationSnapshot,
  readiness: boolean,
): ConnectionProblemView | null {
  const described = describeError(snapshot);
  if (!described) {
    return null;
  }
  const { action } = described;
  // A readiness problem is re-checked; restarting would not change it.
  const mapped: RecoveryAction =
    readiness && (action === "retry" || action === "check_connection" || action === "reload")
      ? "check_again"
      : action === "check_connection"
        ? "retry"
        : action === "sign_in" ||
            action === "approve" ||
            action === "set_up" ||
            action === "choose_collection" ||
            action === "update_app" ||
            action === "retry" ||
            action === "reload"
          ? action
          : null;
  return {
    title: described.title,
    message: described.message,
    action: mapped,
    actionLabel: mapped === "check_again" ? "Check again" : described.actionLabel,
    updateUrl: described.updateUrl,
  };
}

function identityLabel(signIn: MdbaseApplicationSnapshot["signIn"]): string | null {
  if (signIn?.state !== "paired") {
    return null;
  }
  if (signIn.accountEmail) {
    return `Signed in as ${signIn.accountEmail}`;
  }
  return signIn.accountProvider === "github" && signIn.accountLogin
    ? `Signed in as ${signIn.accountLogin} on GitHub`
    : null;
}

type Screen = Pick<ConnectionView, "status" | "problem">;

const plain = (status: ConnectionStatus): Screen => ({ status, problem: null });

/** Screens that win over everything else: closed, waiting in the mdbase tab, a problem. */
function interruption(snapshot: MdbaseApplicationSnapshot): Screen | null {
  const { status, readiness, selection } = snapshot;
  if (status === "closed") {
    return plain("closed");
  }
  const signInProblem = sdkProblem(snapshot, false);
  if (signInProblem?.action === "sign_in") {
    return { status: "problem", problem: signInProblem };
  }
  if (status === "authorizing" || selection.state === "approving") {
    return plain("waiting");
  }
  const readinessProblem = readiness.problem !== null || readiness.assessment?.problem != null;
  if (status === "blocked" || readinessProblem || readiness.assessment?.status === "incompatible") {
    const problem = sdkProblem(snapshot, readinessProblem && status !== "blocked");
    return problem ? { status: "problem", problem } : plain("opening");
  }
  return null;
}

/** The step the reader (or the SDK) has to take next. */
function nextStep(snapshot: MdbaseApplicationSnapshot): ConnectionStatus | null {
  const { status, readiness, selection } = snapshot;
  if (selection.state === "approval_required") {
    return "approval";
  }
  if (status === "setup_required" || readiness.assessment?.status === "setup_required") {
    return "setup";
  }
  if (["not_started", "starting", "opening"].includes(status) || readiness.checking) {
    return "opening";
  }
  if (status === "signed_out") {
    return "signed_out";
  }
  return status === "unselected" || selection.state === "invalid" ? "choosing" : null;
}

function screen(snapshot: MdbaseApplicationSnapshot, usable: boolean): Screen {
  const interrupted = interruption(snapshot);
  if (interrupted) {
    return interrupted;
  }
  const step = nextStep(snapshot);
  if (step) {
    return plain(step);
  }
  if (usable) {
    return plain("ready");
  }
  return snapshot.readiness.assessment === null
    ? plain("unchecked")
    : { status: "problem", problem: retired };
}

/**
 * `usable` is whether the SDK hands out a current READY connection right now. While the
 * SDK host restarts (`hostAvailable` false) its last snapshot is stale, so the page shows
 * mdbase opening; the SDK's own status is not changed.
 */
export function connectionView(
  snapshot: MdbaseApplicationSnapshot,
  usable: boolean,
  hostAvailable = true,
): ConnectionView {
  const signedIn = snapshot.status !== "closed" && snapshot.signIn?.state === "paired";
  return {
    ...(hostAvailable ? screen(snapshot, usable) : plain("opening")),
    collections: snapshot.status === "closed" ? [] : snapshot.collections,
    collectionId: snapshot.status === "closed" ? null : snapshot.selectedCollectionId,
    signedIn,
    identity: identityLabel(snapshot.signIn),
  };
}

/** Why saving cannot happen yet, for the save bar and a refused save. */
export function connectionUnavailableMessage(view: ConnectionView): string {
  switch (view.status) {
    case "problem":
      return view.problem?.message ?? "This collection can't be used right now.";
    case "signed_out":
      return "Sign in to mdbase before saving.";
    case "waiting":
      return "Finish signing in or approving in the mdbase tab, then save.";
    case "choosing":
      return "Choose a collection before saving.";
    case "approval":
      return "Approve access to this collection before saving.";
    case "setup":
      return "Set up this collection for Reader before saving.";
    case "unchecked":
      return "Check this collection before saving.";
    case "closed":
      return "Reader has signed out. Sign in again before saving; your draft is kept.";
    default:
      return "mdbase is still getting ready. Try again in a moment.";
  }
}
