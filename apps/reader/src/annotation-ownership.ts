import { sourceLink } from "@mdbase-reader/core";

import type {
  AnnotationCreationRequest,
  AnnotationTarget,
  DocumentRange,
  DocumentTarget,
  SourceSummary,
} from "@mdbase-reader/core";

export interface AnnotationOwnerDecision {
  readonly owner: SourceSummary;
  readonly reason: string;
}
export type RangeContainment = (
  range: DocumentRange,
  target: AnnotationTarget,
) => Promise<boolean | null>;
export interface AnnotationOwnershipInput {
  readonly source: SourceSummary;
  readonly sources: readonly SourceSummary[];
  readonly preference: "chapter" | "book";
  readonly document?: DocumentTarget | undefined;
  readonly target?: AnnotationTarget | undefined;
  readonly contains?: RangeContainment | undefined;
}

/** Never substitute an approximate anchor, stale revision, unresolved parent or overlap. */
export async function defaultAnnotationOwner(
  input: AnnotationOwnershipInput,
): Promise<AnnotationOwnerDecision> {
  const { source, sources } = input;
  const book = sources.find(({ id }) => id === source.partOf) ?? source;
  if (source.partOf && input.preference === "chapter") {
    return { owner: source, reason: "Created in this chapter." };
  }
  if (input.preference === "book") {
    return {
      owner: book,
      reason:
        book === source && source.partOf
          ? "Book unavailable; keeping the current owner."
          : "Your ownership setting keeps new annotations on the book.",
    };
  }
  if (sources.length === 1 && !source.partOf) {
    return { owner: source, reason: "Owned by this source." };
  }
  if (!input.document || !input.target) {
    return { owner: source, reason: "A note about this source as a whole." };
  }
  const result = await matchingParts(input, input.document, input.target);
  if (result.reason) {
    return { owner: source, reason: result.reason };
  }
  const unique = [...new Map(result.parts.map((part) => [part.id, part])).values()];
  const matched = unique.length === 1 ? unique[0] : undefined;
  return matched
    ? { owner: matched, reason: "Inside this chapter’s verified range on the exact file revision." }
    : {
        owner: source,
        reason:
          unique.length > 1
            ? "Chapter ranges overlap; choose an owner explicitly."
            : "No verified chapter contains the whole selection; keeping this on the book.",
      };
}

async function matchingParts(
  input: AnnotationOwnershipInput,
  opened: DocumentTarget,
  target: AnnotationTarget,
): Promise<{ readonly parts: readonly SourceSummary[]; readonly reason?: string }> {
  const parts: SourceSummary[] = [];
  for (const part of input.sources) {
    if (part.id === input.source.id || !part.partOf) {
      continue;
    }
    for (const document of part.documents) {
      if (document.fileId !== opened.fileId || !document.range) {
        continue;
      }
      if (
        part.relations &&
        part.relations.filter(({ relation }) => relation === "part-of").length !== 1
      ) {
        return { parts, reason: "Chapter parents are ambiguous; keeping this on the book." };
      }
      if (document.revision !== opened.revision) {
        return {
          parts,
          reason: "Chapter range revision differs from the opened file; keeping this on the book.",
        };
      }
      const inside = await input.contains?.(document.range, target);
      if (inside === null || inside === undefined) {
        return {
          parts,
          reason:
            "Chapter boundaries or selection containment are unverified; keeping this on the book.",
        };
      }
      if (inside) {
        parts.push(part);
      }
    }
  }
  return { parts };
}

export function annotationWithOwner(
  request: AnnotationCreationRequest,
  owner: AnnotationCreationRequest["sourceRecord"],
): AnnotationCreationRequest {
  return {
    ...request,
    ...(request.document
      ? { documentSourceRecord: request.documentSourceRecord ?? request.sourceRecord }
      : {}),
    sourceRecord: owner,
    sourceId: owner.id,
    source: sourceLink(owner),
  };
}
