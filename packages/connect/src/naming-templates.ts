/**
 * Reader's name templates (`docs/design/app-settings.md`): the collection's
 * `source_name_template` and `annotation_name_template` choose the preferred name of a new
 * source note or annotation. The rendered name only ever comes first: it goes through the naming
 * rules in core's `record-names.ts`, and Reader's own fallbacks follow it. A template that is
 * empty, invalid or renders nothing usable gives Reader's default names unchanged.
 */
import {
  idSuffix,
  pathStem,
  preferredAnnotationLeaves,
  preferredSourceNoteStems,
  quoteWords,
  sourceNoteStems,
  type Annotation,
  type AuthorYear,
} from "@mdbase-reader/core";

import { renderNameTemplate } from "./name-template-engine.js";

/** Today's source note name: the title, slugged to 60 characters. */
export const defaultSourceNameTemplate = "{{ title | slug }}";
/** Today's annotation name: its ID. */
export const defaultAnnotationNameTemplate = "{{ id }}";

/** The templates a create uses. */
export interface ReaderNameTemplates {
  readonly source: string;
  readonly annotation: string;
}

export const defaultNameTemplates: ReaderNameTemplates = {
  source: defaultSourceNameTemplate,
  annotation: defaultAnnotationNameTemplate,
};

/** Where creates get the collection's current templates. */
export interface ReaderNaming {
  /** The templates to use now. May fail; a create then uses the defaults. */
  templates(): Promise<ReaderNameTemplates>;
}

/** The templates `naming` gives, or the defaults when there is none or it fails. */
export async function currentNameTemplates(
  naming: ReaderNaming | undefined,
): Promise<ReaderNameTemplates> {
  try {
    return naming ? await naming.templates() : defaultNameTemplates;
  } catch {
    return defaultNameTemplates;
  }
}

/** What a new source's name may be built from. */
export interface SourceNameFacts {
  readonly id: string;
  readonly title: string;
  /** Authors as written, such as `Ada Lovelace` or `Lovelace, Ada`. */
  readonly creators?: readonly string[];
  /** The first author's family name and the year, as Reader's own fallback names use them. */
  readonly authorYear?: AuthorYear | undefined;
  readonly kind?: string | undefined;
  readonly published?: string | number | undefined;
  readonly site?: string | undefined;
  readonly citation?: Readonly<Record<string, unknown>> | undefined;
  readonly savedAt?: string | undefined;
}

/** The source a chapter or other part belongs to. */
export interface SourceNameParent {
  readonly title: string;
  readonly path: string;
  readonly creators?: readonly string[];
  readonly published?: string | number | undefined;
  readonly citation?: Readonly<Record<string, unknown>> | undefined;
}

/** The variables a source note template sees. See the settings contract for the list. */
export function sourceNameVariables(
  source: SourceNameFacts,
  parent?: SourceNameParent,
): Record<string, unknown> {
  const citation = source.citation;
  const authors = source.creators?.length ? [...source.creators] : cslNames(citation);
  return {
    title: source.title,
    authors,
    author: source.authorYear?.family ?? familyName(authors[0]),
    year: String(source.authorYear?.year ?? yearOf(source.published, citation)),
    type: text(citation?.["type"]) ?? source.kind ?? "",
    publisher: text(citation?.["publisher"]) ?? "",
    site: source.site ?? "",
    id: source.id,
    short_id: idSuffix(source.id, 8),
    date: source.savedAt ?? "",
    ...(parent ? parentVariables(parent) : {}),
  };
}

function parentVariables(parent: SourceNameParent): Record<string, unknown> {
  const authors = parent.creators?.length ? [...parent.creators] : cslNames(parent.citation);
  return {
    parent_title: parent.title,
    parent_author: familyName(authors[0]),
    parent_year: yearOf(parent.published, parent.citation),
    parent_stem: pathStem(parent.path),
  };
}

/**
 * Paths to try, in order, for a new source note named by `template`. `defaults` are the paths
 * Reader would use without a template; they are what an unusable template gives.
 */
export async function sourceNotePathCandidates(
  template: string,
  source: SourceNameFacts,
  parent?: SourceNameParent,
  defaults?: readonly string[],
): Promise<readonly string[]> {
  return (await sourceNoteNamePreview(template, source, parent, defaults)).paths;
}

export interface SourceNoteNamePreview {
  /** Paths to try, in order. */
  readonly paths: readonly string[];
  /** True when the template gave nothing usable and Reader's own names apply. */
  readonly usedDefault: boolean;
  readonly problem?: string;
}

/** {@link sourceNotePathCandidates}, with whether and why the default applied. */
export async function sourceNoteNamePreview(
  template: string,
  source: SourceNameFacts,
  parent?: SourceNameParent,
  defaults?: readonly string[],
): Promise<SourceNoteNamePreview> {
  const input = { title: source.title, id: source.id, authorYear: source.authorYear };
  const ownStems = sourceNoteStems(input);
  const fallback = defaults ?? ownStems.map(sourceNotePath);
  if (template === defaultSourceNameTemplate) {
    return { paths: fallback, usedDefault: false };
  }
  const rendered = await renderNameTemplate(template, sourceNameVariables(source, parent));
  if (rendered.output === undefined) {
    return { paths: fallback, usedDefault: true, problem: rendered.problem ?? "" };
  }
  const stems = preferredSourceNoteStems(rendered.output, input);
  if (sameList(stems, ownStems)) {
    // Nothing usable, or exactly Reader's own first name: Reader's own list, as planned.
    const usedDefault = stems[0] !== rendered.output.trim();
    return { paths: fallback, usedDefault };
  }
  return { paths: stems.map(sourceNotePath), usedDefault: false };
}

/** What a new annotation's name may be built from. */
export type AnnotationNameFacts = Pick<
  Annotation,
  "id" | "annotationType" | "target" | "color" | "createdAt" | "source"
>;

/** The variables an annotation template sees. See the settings contract for the list. */
export function annotationNameVariables(annotation: AnnotationNameFacts): Record<string, unknown> {
  const quote = annotation.target?.quote?.exact ?? "";
  const pageIndex = annotation.target?.pdf?.pageIndex;
  return {
    id: annotation.id,
    short_id: idSuffix(annotation.id, 8),
    type: annotation.annotationType,
    quote,
    words: quote ? quoteWords(quote) : "",
    page: pageIndex === undefined ? "" : String(pageIndex + 1),
    color: annotation.color ?? "",
    date: annotation.createdAt,
    source_stem: linkStem(annotation.source),
  };
}

export interface AnnotationNamePreview {
  readonly paths: readonly string[];
  readonly usedDefault: boolean;
  readonly problem?: string;
}

/** Paths to try, in order, for a new annotation named by `template`, all in `annotations/`. */
export async function annotationPathCandidates(
  template: string,
  annotation: AnnotationNameFacts,
): Promise<readonly string[]> {
  return (await annotationNamePreview(template, annotation)).paths;
}

/** {@link annotationPathCandidates}, with whether and why the default applied. */
export async function annotationNamePreview(
  template: string,
  annotation: AnnotationNameFacts,
): Promise<AnnotationNamePreview> {
  const fallback = [annotationPath(annotation.id)];
  if (template === defaultAnnotationNameTemplate) {
    return { paths: fallback, usedDefault: false };
  }
  const rendered = await renderNameTemplate(template, annotationNameVariables(annotation));
  if (rendered.output === undefined) {
    return { paths: fallback, usedDefault: true, problem: rendered.problem ?? "" };
  }
  const leaves = preferredAnnotationLeaves(rendered.output, annotation.id);
  return {
    paths: leaves.map(annotationPath),
    usedDefault: leaves[0] === annotation.id && rendered.output.trim() !== annotation.id,
  };
}

function sourceNotePath(stem: string): string {
  return `sources/${stem}.md`;
}

function annotationPath(leaf: string): string {
  return `annotations/${leaf}.md`;
}

/** `[[sources/adam|Adam]]` gives `adam`. */
function linkStem(link: string): string {
  const target = /^\[\[([^|\]]+)/u.exec(link.trim())?.[1] ?? link;
  return pathStem(target.trim());
}

/** `Lovelace, Ada` and `Ada Lovelace` both give `Lovelace`. */
function familyName(author: string | undefined): string {
  const trimmed = author?.trim() ?? "";
  if (trimmed.includes(",")) {
    return trimmed.slice(0, trimmed.indexOf(",")).trim();
  }
  return trimmed.split(/\s+/u).at(-1) ?? "";
}

function cslNames(citation: Readonly<Record<string, unknown>> | undefined): string[] {
  const names = [citation?.["author"], citation?.["editor"]].find(
    (value): value is readonly unknown[] => Array.isArray(value) && value.length > 0,
  );
  return (names ?? []).flatMap((name) => {
    if (!name || typeof name !== "object") {
      return [];
    }
    const parts = name as Readonly<Record<string, unknown>>;
    const literal = text(parts["literal"]);
    const written = [text(parts["given"]), text(parts["family"])].filter(Boolean).join(" ");
    return literal ? [literal] : written ? [written] : [];
  });
}

function yearOf(
  published: string | number | undefined,
  citation: Readonly<Record<string, unknown>> | undefined,
): string {
  const issued = citation?.["issued"];
  const parts =
    issued && typeof issued === "object"
      ? (issued as Readonly<Record<string, unknown>>)["date-parts"]
      : undefined;
  const head: unknown = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined;
  const written = typeof head === "number" || typeof head === "string" ? head : published;
  return /(?<!\d)\d{4}(?!\d)/u.exec(String(written ?? ""))?.[0] ?? "";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
