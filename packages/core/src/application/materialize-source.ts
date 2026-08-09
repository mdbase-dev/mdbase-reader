import { validateCslItem, type CslItem } from "../domain/citation.js";

import type { Annotation } from "../domain/annotation.js";
import type { AnnotationId } from "../domain/identity.js";
import type { Source, SourceSummary } from "../domain/source.js";

export type MaterializationProblemKind = "broken-embed" | "cycle" | "missing-citation";

export interface MaterializationProblem {
  readonly kind: MaterializationProblemKind;
  readonly reference: string;
  readonly message: string;
}

export interface MaterializedSource {
  readonly markdown: string;
  readonly bibliography: readonly CslItem[];
  readonly renderedAnnotations: readonly AnnotationId[];
  readonly problems: readonly MaterializationProblem[];
}

export function materializeSource(
  source: Source,
  annotations: readonly Annotation[],
  citationSources: readonly SourceSummary[],
): MaterializedSource {
  const context = createContext(source, annotations);
  const markdown = resolveEmbeds(source.body, context, []);
  const bibliography = collectBibliography(markdown, citationSources, context.problems);
  return {
    markdown: ensureTrailingNewline(markdown),
    bibliography,
    renderedAnnotations: [...context.rendered],
    problems: context.problems,
  };
}

interface MaterializationContext {
  readonly source: Source;
  readonly annotations: ReadonlyMap<string, Annotation>;
  readonly rendered: Set<AnnotationId>;
  readonly problems: MaterializationProblem[];
}

function createContext(source: Source, annotations: readonly Annotation[]): MaterializationContext {
  const byReference = new Map<string, Annotation>();
  for (const annotation of annotations) {
    const standardPath = `annotations/${annotation.id}`;
    byReference.set(annotation.id, annotation);
    byReference.set(standardPath, annotation);
    if (annotation.path) {
      byReference.set(normalizeReference(annotation.path), annotation);
    }
  }
  return { source, annotations: byReference, rendered: new Set(), problems: [] };
}

function resolveEmbeds(
  markdown: string,
  context: MaterializationContext,
  stack: readonly AnnotationId[],
): string {
  return markdown.replaceAll(embedPattern, (embed: string, rawReference: string) => {
    const reference = normalizeReference(rawReference);
    const annotation = context.annotations.get(reference);
    if (!annotation) {
      if (reference.startsWith("annotations/")) {
        context.problems.push({
          kind: "broken-embed",
          reference,
          message: `Annotation embed ${reference} could not be resolved.`,
        });
      }
      return embed;
    }
    if (stack.includes(annotation.id)) {
      context.problems.push({
        kind: "cycle",
        reference,
        message: `Annotation embed ${reference} forms a transclusion cycle.`,
      });
      return embed;
    }
    context.rendered.add(annotation.id);
    const body = annotationBody(annotation);
    const resolved = resolveEmbeds(body, context, [...stack, annotation.id]);
    return addAttribution(resolved, context.source, annotation);
  });
}

const embedPattern = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu;

function normalizeReference(reference: string): string {
  return reference.trim().replace(/^\.\//u, "").replace(/\.md$/iu, "");
}

function annotationBody(annotation: Annotation): string {
  if (annotation.body.trim()) {
    return annotation.body.trim();
  }
  const quote = annotation.target?.quote?.exact;
  if (quote) {
    return quote
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  return `*[${annotation.annotationType} annotation]*`;
}

function addAttribution(body: string, source: Source, annotation: Annotation): string {
  const attribution = annotationAttribution(source, annotation);
  const lines = body.split("\n");
  let quoteEnd = 0;
  while (quoteEnd < lines.length && /^\s*>/u.test(lines[quoteEnd] ?? "")) {
    quoteEnd += 1;
  }
  if (quoteEnd > 0) {
    lines.splice(quoteEnd, 0, ">", `> ${attribution}`);
    return lines.join("\n").trim();
  }
  return `${body.trim()}\n\n${attribution}`.trim();
}

function annotationAttribution(source: Source, annotation: Annotation): string {
  const locator = usableLocator(annotation.locator?.label);
  const validation = validateCslItem(source.citation);
  if (validation.valid) {
    return `— [@${validation.item.id}${locator ? `, ${locator}` : ""}]`;
  }
  const url = source.citation?.["URL"];
  const label = typeof url === "string" ? `[${source.title}](${url})` : source.title;
  return `— ${label}${locator ? `, ${locator}` : ""}`;
}

function usableLocator(locator: string | undefined): string | null {
  const value = locator?.trim();
  return value && !value.startsWith("[[") ? value : null;
}

function collectBibliography(
  markdown: string,
  sources: readonly SourceSummary[],
  problems: MaterializationProblem[],
): readonly CslItem[] {
  const citations = new Set<string>();
  for (const match of markdown.matchAll(/@([\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*)/gu)) {
    const citekey = match[1];
    if (citekey) {
      citations.add(citekey);
    }
  }
  const items = new Map<string, CslItem>();
  for (const source of sources) {
    const validation = validateCslItem(source.citation);
    if (validation.valid && citations.has(validation.item.id) && !items.has(validation.item.id)) {
      items.set(validation.item.id, validation.item);
    }
  }
  for (const citekey of citations) {
    if (!items.has(citekey)) {
      problems.push({
        kind: "missing-citation",
        reference: citekey,
        message: `Citation @${citekey} has no valid CSL record in this collection.`,
      });
    }
  }
  return [...items.values()];
}

function ensureTrailingNewline(value: string): string {
  return `${value.trimEnd()}\n`;
}
