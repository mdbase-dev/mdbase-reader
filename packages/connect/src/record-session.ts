// Reader applications reach the SDK through this package only.
import { connectFailure, connectProblem, connectSuccess } from "@mdbase-dev/connect/advanced";

import { ConnectRepositoryError } from "./repository-client.js";

import type { ConnectFailure, ConnectOutcome } from "@mdbase-dev/connect";

export { MdbaseRecordSession } from "@mdbase-dev/connect";
export type { MdbaseRecordSessionSnapshot, MdbaseRecordSessionState } from "@mdbase-dev/connect";
export type { MdbaseRecordSessionAdapter } from "@mdbase-dev/connect/advanced";

/**
 * Reader's repositories and gateways report failures by throwing; record
 * session adapters report them as outcomes. A repository failure keeps its
 * Connect problem (and so an interrupted write's request ID) with Reader's
 * message; any other error is an operation failure with its own message.
 */
export function recordFailure(error: unknown): ConnectFailure {
  if (error instanceof ConnectRepositoryError && error.problem) {
    return connectFailure({ ...error.problem, message: error.message });
  }
  if (error instanceof Error) {
    return connectFailure(connectProblem("operation_failed", error.message));
  }
  throw error;
}

/** A missing record, as record sessions expect to learn of deletion. */
export function recordMissing(): ConnectFailure {
  return connectFailure(connectProblem("file_not_found", "This record no longer exists."));
}

/** Run a throwing read or recovery as a record session outcome; `null` means deleted. */
export async function recordOutcome<Value>(
  operation: () => Promise<Value | null>,
): Promise<ConnectOutcome<Value>> {
  try {
    const value = await operation();
    return value === null ? recordMissing() : connectSuccess(value);
  } catch (error) {
    return recordFailure(error);
  }
}

export function recordSuccess<Value>(value: Value): ConnectOutcome<Value> {
  return connectSuccess(value);
}

/** The record changed since the base a write was prepared against. */
export function recordChanged(message: string): ConnectFailure {
  return connectFailure(connectProblem("concurrent_modification", message));
}
