import { MdbaseError } from "@mdbase-dev/sdk";

import type { Mdbase, RecordLease, RecordOpenOptions } from "@mdbase-dev/sdk";

export type {
  Mdbase,
  RecordLease,
  RecordSession,
  RecordSessionSnapshot,
  RecordSessionState,
  RecordRecoveryRef,
} from "@mdbase-dev/sdk";

/** Borrow a native editor from whichever application implementation owns this collection. */
export async function openReaderRecord(
  mdbase: Mdbase,
  collectionId: string,
  path: string,
  options: RecordOpenOptions = {},
): Promise<RecordLease> {
  const connection = mdbase.connection(collectionId);
  if (!connection?.isCurrent()) {
    throw new MdbaseError({
      code: "unavailable",
      recovery: "retry",
      message: "This collection is no longer open in mdbase Reader.",
    });
  }
  const lease = await connection.records.records.open({ path }, options);
  if (!connection.isCurrent()) {
    lease.release();
    throw new MdbaseError({
      code: "cancelled",
      recovery: "none",
      message: "This collection is no longer open in mdbase Reader.",
    });
  }
  return lease;
}
