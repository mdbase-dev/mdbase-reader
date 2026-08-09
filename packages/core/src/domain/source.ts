import type { DocumentDescriptor } from "./document.js";
import type { CollectionId, RecordRevision, SourceId } from "./identity.js";

export const readingStatuses = [
  "inbox",
  "queued",
  "reading",
  "finished",
  "archived",
  "abandoned",
] as const;
export type ReadingStatus = (typeof readingStatuses)[number];

export interface SourceSummary {
  readonly collectionId: CollectionId;
  readonly id: SourceId;
  readonly path: string;
  readonly title: string;
  readonly creators: readonly string[];
  readonly tags: readonly string[];
  readonly readingStatus?: ReadingStatus;
  readonly documents: readonly DocumentDescriptor[];
}

export interface Source extends SourceSummary {
  readonly body: string;
  readonly recordRevision: RecordRevision;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface SourceQuery {
  readonly collectionId: CollectionId;
  readonly search?: string;
  readonly readingStatus?: ReadingStatus;
  readonly cursor?: string;
  readonly limit: number;
}

export interface Page<Item> {
  readonly items: readonly Item[];
  readonly nextCursor?: string;
}
