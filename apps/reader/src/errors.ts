import { t } from "@lingui/core/macro";
import { ConnectRepositoryError } from "@mdbase-reader/connect";

export function readerErrorMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ConnectRepositoryError && reason.code === "query_incomplete") {
    return t`This list may be incomplete. Reader could not verify all results. Try again after the collection finishes syncing.`;
  }
  if (reason instanceof ConnectRepositoryError && reason.code === "query_budget_exceeded") {
    return t`This annotation query is too large. Try again. If it still fails, contact support.`;
  }
  if (reason instanceof Error && reason.message.trim()) {
    return reason.message;
  }
  if (typeof reason === "string" && reason.trim()) {
    return reason;
  }
  return fallback;
}
