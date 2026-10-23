import { t as translate } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

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
      <Trans context="Reader action">Try again</Trans>
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
  const { t } = useLingui();
  const reviewAccess = hasSelectedCollection && requiresAccessReview(error);
  const reconnect = hasSelectedCollection && requiresReconnect(error);
  if (session.status !== "authorization_required" && !reviewAccess && !reconnect) {
    return null;
  }
  const label = reconnect
    ? translate({ message: "Reconnect collection", context: "ConnectionLayout status or action" })
    : reviewAccess
      ? translate({ message: "Review updated access" })
      : translate({
          message: "Authorize collection",
          context: "ConnectionLayout status or action",
        });
  return (
    <button
      type="button"
      className="mdbase-connect-action"
      disabled={working}
      onClick={onAuthorize}
    >
      {working ? t({ message: "Opening mdbase…", context: "ConnectionLayout interface" }) : label}
    </button>
  );
}
