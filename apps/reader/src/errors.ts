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
  const message = isMdbaseError(reason)
    ? describeError(reason)?.message
    : reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : undefined;
  if (!message?.trim() || /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u.test(message.trim())) {
    return fallback;
  }
  return message;
}
