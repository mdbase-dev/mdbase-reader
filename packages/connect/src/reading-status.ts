import { recordRevision } from "@mdbase-reader/core";

import { sourceFromDocument } from "./mapping.js";
import { outcomeValue } from "./repository-client.js";

import type { ReaderConnectClient } from "./repository-client.js";
import type {
  CollectionId,
  DateTime,
  ReadingPosition,
  ReadingStatus,
  Source,
  SourceId,
} from "@mdbase-reader/core";

export interface ReadingStatusChange {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly status: ReadingStatus;
  readonly changedAt: DateTime;
}

export async function writeReadingStatus(
  client: ReaderConnectClient,
  path: string,
  input: ReadingStatusChange,
): Promise<Source> {
  const current = outcomeValue(
    await client.read({ path, includeDocument: true }),
    "read source before changing reading status",
  );
  const existing = current.frontmatter["reading"];
  const reading = readingWithStatus(
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? (existing as Readonly<Record<string, unknown>>)
      : {},
    input.status,
    input.changedAt,
  );
  const updated = outcomeValue(
    await client.update({
      path,
      ifRevision: recordRevision(current.revision),
      patch: { reading },
      includeDocument: true,
    }),
    "change reading status",
  );
  return sourceFromDocument(input.collectionId, updated);
}

/** Applies a lifecycle change while keeping `finished_at` consistent with `started_at`. */
export function readingWithStatus(
  existing: Readonly<Record<string, unknown>>,
  status: ReadingStatus,
  changedAt: DateTime,
): Record<string, unknown> {
  const { finished_at: finishedAt, ...rest } = existing;
  if (status === "finished") {
    return {
      ...rest,
      status,
      started_at: rest["started_at"] ?? changedAt,
      finished_at: finishedAt ?? changedAt,
    };
  }
  return {
    ...rest,
    status,
    ...(status === "reading" && rest["started_at"] === undefined ? { started_at: changedAt } : {}),
  };
}

/** The compact resume selector stored as `reading.position`. */
export function positionFrontmatter(position: ReadingPosition): Readonly<Record<string, unknown>> {
  if (position.kind === "pdf") {
    return { pdf: { page_index: position.pageIndex } };
  }
  if (position.kind === "epub") {
    return { epub: { locator: position.locator } };
  }
  return {
    html: {
      href: position.href,
      ...(position.progression === undefined ? {} : { progression: position.progression }),
    },
  };
}
