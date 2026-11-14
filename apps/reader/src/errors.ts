import { t } from "@lingui/core/macro";
import { ConnectRepositoryError } from "@mdbase-reader/connect";
import { describeError, isMdbaseError } from "@mdbase-reader/connect/native";

export function readerErrorMessage(reason: unknown, fallback: string): string {
  const code = isMdbaseError(reason)
    ? reason.reason
    : reason instanceof ConnectRepositoryError
      ? reason.code
      : undefined;
  if (code === "query_incomplete") {
    return t`This list may be incomplete. Reader could not verify all results. Try again after the collection finishes syncing.`;
  }
  if (code === "query_budget_exceeded") {
    return t`This annotation query is too large. Try again. If it still fails, contact support.`;
  }
  if (isMdbaseError(reason)) {
    return describeError(reason)?.message ?? fallback;
  }
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason;
  }
  return fallback;
}
