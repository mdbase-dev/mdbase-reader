import type { CslItem, CslValidationProblem } from "./citation.js";
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
  readonly kind?: string;
  readonly published?: string | number;
  readonly publication?: string;
  readonly url?: string;
  readonly site?: string;
  readonly readingStatus?: ReadingStatus;
  readonly reading?: CurrentReadingState;
  readonly citation?: CslItem;
  readonly citationProblems?: readonly CslValidationProblem[];
  readonly documents: readonly DocumentDescriptor[];
  /** The record's frontmatter as read, for views that show arbitrary fields. */
  readonly properties?: Readonly<Record<string, unknown>>;
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

// Fields the source contract maintains; editing them by hand would break the record.
const maintainedSourceFields = new Set(["id", "type", "documents"]);

/**
 * Whether a frontmatter field (a dotted path) may be edited by hand. Nested citation and reading
 * values can be; the `csl` and `reading` objects as a whole, and identity fields, cannot.
 */
export function isEditableSourceField(key: string): boolean {
  const [top] = key.split(".");
  return (
    top !== undefined &&
    top !== "" &&
    !maintainedSourceFields.has(top) &&
    key !== "reading" &&
    key !== "csl"
  );
}

// Fields the source contract requires; an edit may change them but not remove them.
const requiredSourceFields = new Set(["title", "kind", "saved_at"]);

export function isRequiredSourceField(key: string): boolean {
  return requiredSourceFields.has(key);
}

/** Frontmatter fields to set on a source, by dotted path; null removes a field. */
export interface SourceFieldChange {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly fields: Readonly<Record<string, unknown>>;
}

// Summaries are immutable, so each one's search text is built once and reused per keystroke.
const searchTextBySource = new WeakMap<SourceSummary, string>();

function sourceSearchText(source: SourceSummary): string {
  let text = searchTextBySource.get(source);
  if (text === undefined) {
    text = [
      source.title,
      ...source.creators,
      ...source.tags,
      source.publication,
      source.site,
      source.published === undefined ? undefined : String(source.published),
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n")
      .toLocaleLowerCase();
    searchTextBySource.set(source, text);
  }
  return text;
}

/** Library search over the fields a source summary shows. */
export function filterSources<Summary extends SourceSummary>(
  sources: readonly Summary[],
  search: string | undefined,
): readonly Summary[] {
  const normalized = search?.trim().toLocaleLowerCase();
  return normalized
    ? sources.filter((source) => sourceSearchText(source).includes(normalized))
    : sources;
}
