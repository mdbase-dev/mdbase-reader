import { annotationWikiCandidate } from "./annotation-wiki-candidates.js";

import type { Annotation, SourceSummary } from "@mdbase-reader/core";
import type {
  CitationCompletionCandidate,
  WikiLinkCandidate,
} from "@mdbase-reader/markdown-editor";

export function sourceNoteWikiCandidates(
  sources: readonly SourceSummary[],
  annotations: readonly Annotation[],
): readonly WikiLinkCandidate[] {
  const annotationCandidates = annotations.map(annotationWikiCandidate);
  const annotationPaths = new Set(annotationCandidates.map(({ path }) => path));
  return [
    ...annotationCandidates,
    ...sources.flatMap((source) => {
      const path = source.path.replace(/\.md$/u, "");
      return annotationPaths.has(path)
        ? []
        : [
            {
              label: source.title,
              path,
              kind: "Source",
              detail: sourceDetail(source),
            },
          ];
    }),
  ];
}

function sourceDetail(source: SourceSummary): string {
  return source.creators.length > 0
    ? source.creators.join(", ")
    : (source.publication ?? "Library source");
}

export function sourceNoteCitationCandidates(
  sources: readonly SourceSummary[],
): readonly CitationCompletionCandidate[] {
  return sources.flatMap((source) =>
    source.citation
      ? [
          {
            id: source.citation.id,
            label:
              typeof source.citation["title"] === "string"
                ? source.citation["title"]
                : source.title,
            ...(source.creators.join(", ") || source.publication
              ? { detail: source.creators.join(", ") || source.publication }
              : {}),
            display: citationDisplay(source),
          },
        ]
      : [],
  );
}

function citationDisplay(source: SourceSummary): string {
  const creator =
    citationCreator(source.citation?.["author"]) ?? creatorSurname(source.creators[0]);
  const year = citationYear(source.citation?.["issued"]) ?? citationYear(source.published);
  return [creator, year].filter(Boolean).join(" ") || source.title;
}

function citationCreator(value: unknown): string | undefined {
  const first: unknown = Array.isArray(value) ? value[0] : undefined;
  if (!first || typeof first !== "object") {
    return undefined;
  }
  const record = first as Readonly<Record<string, unknown>>;
  const creator = record["family"] ?? record["literal"];
  return typeof creator === "string" && creator.trim() ? creator.trim() : undefined;
}

function creatorSurname(value: string | undefined): string | undefined {
  return value?.trim().split(/\s+/u).at(-1);
}

function citationYear(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return /\b\d{4}\b/u.exec(String(value))?.[0];
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const parts = (value as Readonly<Record<string, unknown>>)["date-parts"];
  const year: unknown = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
  return typeof year === "string" || typeof year === "number" ? String(year) : undefined;
}
