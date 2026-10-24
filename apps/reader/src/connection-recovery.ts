import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";

export function requiresAccessReview(message: string | null): boolean {
  return Boolean(
    message &&
    /(?:exact application declaration|application declaration bound to this grant)/iu.test(message),
  );
}

/**
 * The grant's private keys are gone from this browser, e.g. retired when another tab
 * reconnected, or removed with site data. Retrying cannot help; authorizing again can.
 */
export function requiresReconnect(message: string | null): boolean {
  return Boolean(
    message &&
    /(?:encrypted grant key|remote authority signing key) is unavailable/iu.test(message),
  );
}

/** Technical failures and what a person should read instead; unknown messages pass through. */
const plainProblems: readonly (readonly [RegExp, string])[] = [
  [
    /(?:encrypted grant key|remote authority signing key) is unavailable/iu,
    "This browser no longer has the key for this collection’s connection. Reconnect to keep reading.",
  ],
  [
    /(?:exact application declaration|application declaration bound to this grant)/iu,
    "Reader’s access to this collection has changed. Review the updated access to continue.",
  ],
  [
    /application declaration is invalid/iu,
    "mdbase Connect did not accept Reader’s app registration, so it cannot open collections here.",
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed/iu,
    "Reader could not reach mdbase Connect. Check your connection, then try again.",
  ],
  [/timed? ?out/iu, "mdbase Connect took too long to answer. Try again in a moment."],
];

/**
 * Connection failures as a person should read them. Unknown messages pass through, unless
 * the caller knows the text is technical and gives a `fallback` to say instead.
 */
export function describeConnectionProblem(message: string, fallback?: string | null): string;
export function describeConnectionProblem(
  message: string | null,
  fallback?: string | null,
): string | null;
export function describeConnectionProblem(
  message: string | null,
  fallback?: string | null,
): string | null {
  if (!message) {
    return message;
  }
  return plainProblems.find(([pattern]) => pattern.test(message))?.[1] ?? fallback ?? message;
}

/** The original text behind a plain description, for a Details disclosure; null if none. */
export function connectionProblemDetail(
  message: string | null,
  fallback?: string | null,
): string | null {
  return message && describeConnectionProblem(message, fallback) !== message ? message : null;
}

/** What to say instead of a session problem, whose text comes straight from Connect. */
export function sessionProblemFallback(
  session: Exclude<ReaderConnectSnapshot, { status: "ready" }>,
): string | null {
  switch (session.status) {
    case "start_failed":
      return "Reader could not start its connection to mdbase Connect. Try again in a moment.";
    case "blocked":
      return "Reader cannot open this collection as it is set up now. Open another collection, or see Details.";
    default:
      return null;
  }
}

/**
 * The connection screen's status, error and Details. The session's own problem is
 * technical, and a failed start also arrives as the step's `error`; other step errors are
 * often written for people, so only recognised ones are reworded.
 */
export function connectionScreenProblem(
  session: Exclude<ReaderConnectSnapshot, { status: "ready" }>,
  error: string | null,
): { readonly status: string; readonly error: string | null; readonly detail: string | null } {
  const status = connectionStatus(session);
  const sessionProblem =
    session.status === "start_failed" || session.status === "blocked"
      ? session.problem.message
      : null;
  const fallbackFor = (message: string | null): string | null =>
    message !== null && message === sessionProblem ? sessionProblemFallback(session) : null;
  // Some failures arrive only as the session's status, not as a step's error.
  const problem = error ?? status;
  return {
    status: describeConnectionProblem(status, fallbackFor(status)),
    error: describeConnectionProblem(error, fallbackFor(error)),
    detail: connectionProblemDetail(problem, fallbackFor(problem)),
  };
}

/** What to say instead of a library load failure that has no plain description. */
export const libraryLoadFallback =
  "Reader could not load the sources in this collection. Try again in a moment.";

type UnavailableReason = Extract<ReaderConnectSnapshot, { status: "unavailable" }>["reason"];

/** Why a selected collection cannot open, and the action that resolves it. */
const unavailableReasons: Readonly<
  Record<UnavailableReason, { readonly status: string; readonly action: UnavailableAction }>
> = {
  not_authorized: {
    status: "Reader is not approved to open this collection yet. Authorize it to continue.",
    action: "authorize",
  },
  authorization_lost: {
    status:
      "Reader’s access to this collection was removed or has ended. Reconnect to keep reading.",
    action: "reconnect",
  },
  invalid_stored_grant: {
    status:
      "This browser’s saved connection to this collection can no longer be used. Reconnect to keep reading.",
    action: "reconnect",
  },
  legacy_scope_reauthorization_required: {
    status:
      "This collection was connected with an older form of access. Review the updated access to keep reading.",
    action: "review",
  },
};

export type UnavailableAction = "authorize" | "reconnect" | "review";

function unavailableReason(
  reason: string,
): { readonly status: string; readonly action: UnavailableAction } | undefined {
  // A newer SDK may add reasons; they get the generic sentence, never the enum.
  return Object.hasOwn(unavailableReasons, reason)
    ? unavailableReasons[reason as UnavailableReason]
    : undefined;
}

/** The authorization action that resolves an unavailable collection; unknown reasons reconnect. */
export function unavailableAction(reason: string): UnavailableAction {
  return unavailableReason(reason)?.action ?? "reconnect";
}

export function connectionStatus(
  session: Exclude<ReaderConnectSnapshot, { status: "ready" }>,
): string {
  switch (session.status) {
    case "starting":
      return "Finding mdbase Connect…";
    case "start_failed":
      return session.problem.message;
    case "authorization_required":
      return `Reader needs your approval to open ${session.info.displayName}.`;
    case "checking_setup":
      return "Checking the collection’s Reader contracts…";
    case "unavailable":
      return (
        unavailableReason(session.reason)?.status ??
        "Reader cannot open this collection right now. Reconnect it, or open another collection."
      );
    case "blocked":
      return session.problem.message;
    case "setup_review_required":
      return "Review the Reader definitions before they are installed.";
    default:
      return "Choose a collection to open in Reader.";
  }
}

export function isLocalhost(current: Location): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname);
}
