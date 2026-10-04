// mdbase-next backend: the 15 replica error codes as Reader's Connect problems.
import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect/advanced";
import { isMdbaseError, mdbaseError, type ErrorCode, type MdbaseError } from "@mdbase-dev/sdk";

import { ConnectRepositoryError } from "../repository-client.js";

import type { ConnectFailure, ConnectOutcome } from "@mdbase-dev/connect";

type ConnectProblem = ConnectFailure["problem"];

/** Shown while a private collection has none of the person's devices online. */
export const waitingForDeviceMessage =
  "Waiting for one of your devices to come online. Reader opens the collection as soon as one does.";

/** What a person reads for each code; apps show their own text keyed on code and reason. */
const messages: Readonly<Record<ErrorCode, string>> = {
  invalid_request: "mdbase did not accept Reader’s request.",
  invalid_record: "mdbase did not accept this record because it is not valid.",
  not_found: "This record or file no longer exists.",
  conflict: "The record changed before Reader saved it. Reload it and try again.",
  unauthenticated: "Reader’s access to this collection has expired. Reconnect to keep reading.",
  forbidden: "Reader’s access to this collection does not allow this.",
  collection_invalid: "This collection’s configuration needs repair before Reader can write to it.",
  unavailable: "mdbase is not reachable right now. Reader will retry.",
  rate_limited: "mdbase asked Reader to slow down. Try again in a moment.",
  quota_exceeded: "This collection is out of storage space.",
  too_large: "This is larger than mdbase accepts.",
  upgrade_required: "This collection needs a newer version of Reader.",
  outcome_unknown: "Reader could not tell whether the last change was saved. Reload to check.",
  cancelled: "The request was cancelled.",
  internal: "mdbase hit an unexpected problem. Try again once.",
};

// The originating replica error for each mapped problem, for callers that branch on it.
const origins = new WeakMap<object, MdbaseError>();

/** True when `error` means "no device of this private collection is online". */
export function isWaitingForDevice(error: unknown): boolean {
  return isMdbaseError(error, "unavailable") && error.reason === "no_device_online";
}

/** Reader's text for a replica error. */
export function nextProblemMessage(error: MdbaseError): string {
  if (isWaitingForDevice(error)) {
    return waitingForDeviceMessage;
  }
  if (error.code === "conflict" && error.reason === "path_taken") {
    return "Another record already uses this path.";
  }
  return messages[error.code];
}

/**
 * Maps a replica error onto the closest Connect problem so the existing
 * `ConnectRepositoryError` and `connectProblemMessage` UI keep working.
 */
export function nextProblem(error: MdbaseError): ConnectProblem {
  const message = nextProblemMessage(error);
  const problem = mappedProblem(error, message);
  origins.set(problem, error);
  return problem;
}

/** The replica error a problem was mapped from, if it came from the mdbase-next backend. */
export function nextErrorOf(problem: ConnectProblem): MdbaseError | undefined {
  return origins.get(problem);
}

// One branch per code is the clearest form of the table.
// eslint-disable-next-line complexity
function mappedProblem(error: MdbaseError, message: string): ConnectProblem {
  switch (error.code) {
    case "invalid_request":
    case "too_large":
      return connectProblem("invalid_request", message);
    case "invalid_record":
      return connectProblem("operation_invalid", message, {
        details: { diagnostics: (error.issues ?? []).map((issue) => ({ ...issue })) },
      });
    case "not_found":
      return connectProblem("file_not_found", message);
    case "conflict":
      return error.reason === "path_taken"
        ? connectProblem("path_occupied", message)
        : connectProblem("concurrent_modification", message);
    case "unauthenticated":
      return connectProblem("authorization_expired", message);
    case "forbidden":
      return connectProblem("insufficient_access", message, {
        details: { required_operations: [], granted_operations: [], missing_operations: [] },
      });
    case "collection_invalid":
      return connectProblem("collection_invalid", message, {
        details: { diagnostics: (error.issues ?? []).map((issue) => ({ ...issue })) },
      });
    case "unavailable":
      return isWaitingForDevice(error)
        ? connectProblem("connector_offline", message, { details: {} })
        : connectProblem("temporarily_unavailable", message);
    case "rate_limited":
      return connectProblem("rate_limited", message, {
        ...(error.retryAfterMs === undefined
          ? {}
          : { details: { retry_after_ms: error.retryAfterMs } }),
      });
    case "upgrade_required":
      return connectProblem("connector_upgrade_required", message);
    case "outcome_unknown":
      return connectProblem("operation_outcome_unknown", message, {
        details: { request_id: error.traceId ?? "" },
      });
    case "cancelled":
      return connectProblem("operation_cancelled", message);
    case "quota_exceeded":
    case "internal":
      return connectProblem("operation_failed", message);
  }
}

/** Any thrown value as a replica error (DOM aborts become `cancelled`). */
export function asMdbaseError(error: unknown): MdbaseError {
  if (isMdbaseError(error)) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return mdbaseError("cancelled", error.message);
  }
  throw error;
}

/** Runs an SDK call as a Connect outcome; replica errors become failures, bugs still throw. */
export async function nextOutcome<Value>(
  operation: () => Promise<Value>,
): Promise<ConnectOutcome<Value>> {
  try {
    return connectSuccess(await operation());
  } catch (error) {
    return connectFailure(nextProblem(asMdbaseError(error)));
  }
}

/** A Connect failure for something the mdbase-next client API has no equivalent for yet. */
export function unsupportedOnNext(feature: string): ConnectFailure {
  return connectFailure(
    connectProblem(
      "unsupported_operation",
      `${feature} is not available on the mdbase-next backend yet.`,
    ),
  );
}

/** A replica error as the error Reader's repositories throw (bugs still throw as they are). */
export function nextRepositoryError(operation: string, error: unknown): ConnectRepositoryError {
  const problem = nextProblem(asMdbaseError(error));
  return new ConnectRepositoryError(operation, problem.code, problem.message, problem);
}
