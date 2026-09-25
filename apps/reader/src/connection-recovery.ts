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

/** Connection failures as a person should read them. */
export function describeConnectionProblem(message: string): string;
export function describeConnectionProblem(message: string | null): string | null;
export function describeConnectionProblem(message: string | null): string | null {
  if (!message) {
    return message;
  }
  return plainProblems.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

/** The original text behind a plain description, for a Details disclosure; null if none. */
export function connectionProblemDetail(message: string | null): string | null {
  return message && describeConnectionProblem(message) !== message ? message : null;
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
      return "Reader needs your approval to open this collection.";
    case "checking_setup":
      return "Checking the collection’s Reader contracts…";
    case "unavailable":
      return `This collection is ${session.reason.replaceAll("_", " ")}.`;
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
