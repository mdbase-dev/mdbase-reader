import { requiresAccessReview, requiresReconnect } from "./connection-recovery.js";

import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";
import type { JSX } from "react";

export function ConnectionRetry({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element | null {
  return error ? (
    <button type="button" className="mdbase-button" onClick={onRetry}>
      Try again
    </button>
  ) : null;
}

export function SelectedAuthorizationAction({
  session,
  error,
  working,
  hasSelectedCollection,
  onAuthorize,
}: {
  readonly session: Exclude<ReaderConnectSnapshot, { status: "ready" }>;
  readonly error: string | null;
  readonly working: boolean;
  readonly hasSelectedCollection: boolean;
  readonly onAuthorize: () => void;
}): JSX.Element | null {
  const reviewAccess = hasSelectedCollection && requiresAccessReview(error);
  const reconnect = hasSelectedCollection && requiresReconnect(error);
  if (session.status !== "authorization_required" && !reviewAccess && !reconnect) {
    return null;
  }
  const label = reconnect
    ? "Reconnect collection"
    : reviewAccess
      ? "Review updated access"
      : "Authorize collection";
  return (
    <button
      type="button"
      className="mdbase-connect-action"
      disabled={working}
      onClick={onAuthorize}
    >
      {working ? "Opening mdbase…" : label}
    </button>
  );
}
