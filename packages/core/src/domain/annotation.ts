import { DomainError } from "./errors.js";
import {
  targetRequiresDocument,
  type AnnotationTarget,
  validateAnnotationTarget,
} from "./selector.js";

import type { DocumentTarget } from "./document.js";
import type { AnnotationId, CollectionId, RecordRevision, SourceId } from "./identity.js";
import type { DateTime } from "./time.js";

export const initialAnnotationTypes = ["highlight", "note", "bookmark", "area"] as const;
export type InitialAnnotationType = (typeof initialAnnotationTypes)[number];
export type AnnotationType = InitialAnnotationType | (string & {});

export interface Locator {
  readonly label: string;
}

export interface AnnotationDraft {
  readonly collectionId: CollectionId;
  readonly sourceId: SourceId;
  readonly source: string;
  readonly document?: DocumentTarget;
  readonly annotationType: AnnotationType;
  readonly motivation?: string;
  readonly color?: string;
  readonly locator?: Locator;
  readonly target?: AnnotationTarget;
  readonly tags: readonly string[];
  readonly body: string;
}

export interface Annotation extends AnnotationDraft {
  readonly id: AnnotationId;
  readonly path?: string;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly recordRevision?: RecordRevision;
  readonly createdAt: DateTime;
  readonly modifiedAt?: DateTime;
  readonly createdBy?: string;
}

export interface AnnotationDeletionPlan {
  readonly annotationId: AnnotationId;
  readonly path: string;
  readonly expectedRevision: RecordRevision;
  readonly brokenLinkPaths: readonly string[];
}

export function validateAnnotationDraft(draft: AnnotationDraft): void {
  const annotationType = draft.annotationType.trim();
  if (annotationType.length === 0) {
    throw new DomainError("invalid-annotation", "An annotation type must not be empty.");
  }
  if (draft.target) {
    validateAnnotationTarget(draft.target);
  }
  if (draft.annotationType === "highlight" && !draft.target?.quote) {
    throw new DomainError("invalid-annotation", "A text highlight requires quote.exact.");
  }
  if (draft.annotationType === "area" && !draft.target?.pdf) {
    throw new DomainError("invalid-annotation", "An area annotation requires PDF geometry in v1.");
  }
  if (draft.annotationType === "bookmark" && !draft.target) {
    throw new DomainError("invalid-annotation", "A bookmark requires a document position.");
  }
  if (draft.target && targetRequiresDocument(draft.target) && !draft.document) {
    throw new DomainError(
      "invalid-annotation",
      "A file selector requires an exact document target.",
    );
  }
}

/**
 * Whether a note body already embeds the annotation at `path`. An embed names it by its path,
 * with or without the extension, or as a simple wikilink by its filename alone, which is how
 * Obsidian and mdbase write a link to a uniquely named note. An alias or heading is ignored.
 */
export function bodyEmbedsAnnotation(body: string, path: string): boolean {
  const full = path.trim().replace(/\.md$/u, "");
  const name = full.split("/").at(-1);
  for (const [, raw = ""] of body.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu)) {
    const target = raw.trim().replace(/\.md$/u, "");
    if (target === full || (!target.includes("/") && target === name)) {
      return true;
    }
  }
  return false;
}

export function annotationEmbed(path: string): string {
  const normalized = path.trim().replace(/\.md$/u, "");
  if (normalized.length === 0 || normalized.includes("]]")) {
    throw new DomainError("invalid-annotation", "An annotation path is not safe to transclude.");
  }
  return `![[${normalized}]]`;
}
