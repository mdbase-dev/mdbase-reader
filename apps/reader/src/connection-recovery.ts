import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

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
const plainProblems: readonly (readonly [RegExp, MessageDescriptor])[] = [
  [
    /(?:encrypted grant key|remote authority signing key) is unavailable/iu,
    msg({
      message:
        "This browser no longer has the key for this collection’s connection. Reconnect to keep reading.",
    }),
  ],
  [
    /(?:exact application declaration|application declaration bound to this grant)/iu,
    msg({
      message:
        "Reader’s access to this collection has changed. Review the updated access to continue.",
    }),
  ],
  [
    /application declaration is invalid/iu,
    msg({
      message:
        "mdbase Connect did not accept Reader’s app registration, so it cannot open collections here.",
    }),
  ],
  [
    /failed to fetch|networkerror|network request failed|load failed/iu,
    msg({
      message: "Reader could not reach mdbase Connect. Check your connection, then try again.",
    }),
  ],
  [
    /timed? ?out/iu,
    msg({ message: "mdbase Connect took too long to answer. Try again in a moment." }),
  ],
];

/** Connection failures as a person should read them. */
export function describeConnectionProblem(message: string): string;
export function describeConnectionProblem(message: string | null): string | null;
export function describeConnectionProblem(message: string | null): string | null {
  if (!message) {
    return message;
  }
  const match = plainProblems.find(([pattern]) => pattern.test(message));
  return match ? i18n._(match[1]) : message;
}

/** The original text behind a plain description, for a Details disclosure; null if none. */
export function connectionProblemDetail(message: string | null): string | null {
  return message && plainProblems.some(([pattern]) => pattern.test(message)) ? message : null;
}

export function connectionStatus(
  session: Exclude<ReaderConnectSnapshot, { status: "ready" }>,
): string {
  switch (session.status) {
    case "starting":
      return t`Finding mdbase Connect…`;
    case "start_failed":
      return session.problem.message;
    case "authorization_required":
      return t`Reader needs your approval to open ${session.info.displayName}.`;
    case "checking_setup":
      return t`Checking the collection’s Reader contracts…`;
    case "unavailable":
      return unavailableStatus(session.reason);
    case "blocked":
      return session.problem.message;
    case "setup_review_required":
      return t`Review the Reader definitions before they are installed.`;
    default:
      return t`Choose a collection to open in Reader.`;
  }
}

function unavailableStatus(reason: string): string {
  switch (reason) {
    case "offline":
    case "device_offline":
      return t`This collection is offline.`;
    case "desktop_update_required":
      return t`Update mdbase Connect on your computer to open this collection.`;
    case "old_connector_running":
      return t`An older connector is running. Restart mdbase Connect on your computer.`;
    case "approval_required":
      return t`This collection needs approval on your computer.`;
    case "sync_required":
      return t`Sync this collection on your computer before opening it.`;
    case "no_device_registered":
      return t`No computer is registered for this collection.`;
    case "access_removed":
      return t`Your access to this collection has been removed.`;
    case "collection_migrating":
      return t`This collection is being migrated.`;
    case "collection_not_yet_migrated":
      return t`This collection has not been migrated yet.`;
    case "collection_deleted":
      return t`This collection has been deleted.`;
    case "locked":
      return t`This collection is locked.`;
    case "not_found":
      return t`This collection could not be found.`;
    case "disconnected":
      return t`This collection is disconnected.`;
    default:
      return t`This collection is unavailable.`;
  }
}

export function isLocalhost(current: Location): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(current.hostname);
}
