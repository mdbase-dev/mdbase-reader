import { annotationBodySections } from "@mdbase-reader/core";

/**
 * The parts of an annotation body a person edits: the quoted passage and their comment. Leading
 * image embeds (area crops) are kept as written and are not editable here.
 */
export interface AnnotationBodyFields {
  /** False when the body holds Markdown these fields cannot represent; edit it raw instead. */
  readonly structured: boolean;
  /** Null when the annotation has no quotation to show. */
  readonly quote: string | null;
  readonly comment: string;
}

const imageEmbedLine = /^\s*!\[\[[^\]|]+\.(?:avif|gif|jpe?g|png|webp)(?:\|[^\]]+)?\]\]\s*$/iu;

function isHeadLine(line: string): boolean {
  return line.trim() === "" || imageEmbedLine.test(line);
}

/**
 * Splits a body into editable fields. `selectedText` is the anchored quotation, shown when an
 * older record keeps the passage only in its selector.
 */
export function annotationBodyFields(body: string, selectedText?: string): AnnotationBodyFields {
  const sections = annotationBodySections(body);
  if (sections.quote === null) {
    const start = sections.before.findIndex((line) => !isHeadLine(line));
    return {
      structured: true,
      quote: selectedText ?? null,
      comment: start < 0 ? "" : sections.before.slice(start).join("\n").trim(),
    };
  }
  if (!sections.before.every(isHeadLine)) {
    return { structured: false, quote: null, comment: body };
  }
  return { structured: true, quote: sections.quote, comment: sections.after.join("\n").trim() };
}

/**
 * The body after editing its fields. Unchanged parts keep their original Markdown, and a body
 * whose fields did not change is returned as it was.
 */
export function annotationBodyWithFields(
  body: string,
  fields: Pick<AnnotationBodyFields, "quote" | "comment">,
  selectedText?: string,
): string {
  const current = annotationBodyFields(body, selectedText);
  if (
    !current.structured ||
    (current.quote === fields.quote && current.comment.trim() === fields.comment.trim())
  ) {
    return current.structured ? body : fields.comment;
  }
  const sections = annotationBodySections(body);
  const commentStart = sections.before.findIndex((line) => !isHeadLine(line));
  const head = (
    sections.quote !== null || commentStart < 0
      ? sections.before
      : sections.before.slice(0, commentStart)
  )
    .join("\n")
    .trim();
  return [
    head,
    quoteMarkdown(sections, fields.quote, selectedText),
    fields.comment.trim() ? fields.comment : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function quoteMarkdown(
  sections: ReturnType<typeof annotationBodySections>,
  quote: string | null,
  selectedText: string | undefined,
): string {
  if (quote === null || quote.trim() === "") {
    return "";
  }
  if (sections.quote !== null && quote === sections.quote) {
    return sections.quoteLines.join("\n").trimEnd();
  }
  // An untouched selector fallback stays out of the body rather than being fabricated into it.
  if (sections.quote === null && quote === selectedText) {
    return "";
  }
  return quote
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}
