import { t } from "@lingui/core/macro";

import { DomainError } from "./errors.js";

import type { CslItem, CslValidationProblem } from "./citation.js";
import type { CslProvenance } from "./csl-provenance.js";
import type { DocumentDescriptor } from "./document.js";
import type { CollectionId, FileId, RecordRevision, SourceId } from "./identity.js";
import type { SourceRelation } from "./source-parts.js";
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
  readonly relations?: readonly SourceRelation[];
  /** Undefined when the parent link cannot be resolved by the collection. */
  readonly partOf?: SourceId;
  /** The record's frontmatter as read, for views that show arbitrary fields. */
  readonly properties?: Readonly<Record<string, unknown>>;
}

/**
 * The `csl` value as read, for guarding a save against outside edits: the raw value even when
 * invalid, and `null` when the record had none. `undefined` when the record was not read whole.
 */
export function loadedCitation(source: SourceSummary): unknown {
  return source.properties ? (source.properties["csl"] ?? null) : source.citation;
}

export interface Source extends SourceSummary {
  readonly cslProvenance?: CslProvenance;
  readonly body: string;
  readonly recordRevision: RecordRevision;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/**
 * A checked removal of one source record. It names the revision that was checked, so a source
 * changed since then is not removed, and the records that link to it, which are kept.
 */
export interface SourceDeletionPlan {
  readonly sourceId: SourceId;
  readonly path: string;
  readonly expectedRevision: RecordRevision;
  readonly brokenLinkPaths: readonly string[];
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

/**
 * The wikilink a record writes to point at a source: its path, so Obsidian and plain editors can
 * follow it, with the title as the alias. mdbase resolves the path back to the stable `id`.
 */
export function sourceLink(source: Pick<SourceSummary, "path" | "title">): string {
  const path = source.path.trim().replace(/\.md$/u, "");
  if (path.length === 0 || /\[\[|\]\]|\|/u.test(path)) {
    throw new DomainError(
      "invalid-annotation",
      t({ message: "A source path is not safe to link." }),
    );
  }
  const alias = source.title
    .replace(/[[\]|]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return alias ? `[[${path}|${alias}]]` : `[[${path}]]`;
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
