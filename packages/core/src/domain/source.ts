import type { DocumentDescriptor } from "./document.js";
import type { CollectionId, FileId, RecordRevision, SourceId } from "./identity.js";
import type { DateTime } from "./time.js";

export const readingStatuses = [
  "inbox",
  "queued",
  "reading",
  "finished",
  "archived",
  "abandoned",
] as const;
export type ReadingStatus = (typeof readingStatuses)[number];

export type ReadingPosition =
  | { readonly kind: "pdf"; readonly pageIndex: number }
  | { readonly kind: "epub"; readonly locator: Readonly<Record<string, unknown>> }
  | { readonly kind: "html"; readonly href: string; readonly progression?: number };

export interface CurrentReadingState {
  readonly status: ReadingStatus;
  readonly progress?: number;
  readonly documentFileId?: FileId;
  readonly position?: ReadingPosition;
  readonly startedAt?: DateTime;
  readonly lastOpenedAt?: DateTime;
  readonly finishedAt?: DateTime;
}

export interface SourceSummary {
  readonly collectionId: CollectionId;
  readonly id: SourceId;
  readonly path: string;
  readonly title: string;
  readonly creators: readonly string[];
  readonly tags: readonly string[];
  readonly readingStatus?: ReadingStatus;
  readonly reading?: CurrentReadingState;
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
  readonly totalCount?: number;
}
