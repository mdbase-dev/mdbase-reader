import { Wordmark } from "@mdbase-dev/ui/brand";
import { ReaderButton } from "@mdbase-reader/ui";

import { requiresAccessReview, requiresReconnect } from "./connection-recovery.js";

import type { ReaderConnectSnapshot } from "@mdbase-reader/connect";
import type { JSX, ReactNode } from "react";

export function ConnectionRetry({
  error,
  onRetry,
}: {
  readonly error: string | null;
  readonly onRetry: () => void;
}): JSX.Element | null {
  return error ? <ReaderButton onClick={onRetry}>Try again</ReaderButton> : null;
}

export function ConnectionLayout({
  status,
  error,
  detail,
  children,
}: {
  readonly status: string;
  readonly error?: string | null;
  /** The technical text behind a plain error, kept for support rather than shown up front. */
  readonly detail?: string | null;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <main className="connection-screen">
      <section className="connection-card">
        <Wordmark app="reader" />
        <div className="connection-copy">
          <h1>Open mdbase Reader</h1>
          {/* A failed step often reports the same message as its status; say it once. */}
          {error !== status ? <p role="status">{status}</p> : null}
          {error ? (
            <p className="connection-error" role="alert">
              {error}
            </p>
          ) : null}
          {detail ? (
            <details className="connection-error-detail">
              <summary>Details</summary>
              <code>{detail}</code>
            </details>
          ) : null}
        </div>
        {children}
      </section>
    </main>
  );
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
    <ReaderButton disabled={working} onClick={onAuthorize}>
      {working ? "Opening mdbase…" : label}
    </ReaderButton>
  );
}
