export interface AnnotationBodyText {
  readonly quote: string | null;
  readonly note: string;
}

interface BlockquoteRange {
  readonly start: number;
  readonly end: number;
  readonly lines: readonly string[];
}

interface Fence {
  readonly marker: "`" | "~";
  readonly length: number;
}

/**
 * Splits authored annotation Markdown into its curated quotation and commentary.
 * The first Markdown blockquote is the quotation; selector text is deliberately
 * not involved because it is anchoring evidence rather than authored content.
 */
export function annotationBodyText(body: string): AnnotationBodyText {
  const lines = markdownLines(body);
  const blockquote = firstBlockquote(lines);
  if (!blockquote) {
    return { quote: null, note: body.trim() };
  }
  return {
    quote: blockquote.lines.join("\n").trim() || null,
    note: [...lines.slice(0, blockquote.start), ...lines.slice(blockquote.end)].join("\n").trim(),
  };
}

/** The body's lines around its first blockquote, with the quoted lines kept as written. */
export interface AnnotationBodySections {
  readonly before: readonly string[];
  readonly quoteLines: readonly string[];
  readonly quote: string | null;
  readonly after: readonly string[];
}

export function annotationBodySections(body: string): AnnotationBodySections {
  const lines = markdownLines(body);
  const blockquote = firstBlockquote(lines);
  if (!blockquote) {
    return { before: lines, quoteLines: [], quote: null, after: [] };
  }
  return {
    before: lines.slice(0, blockquote.start),
    quoteLines: lines.slice(blockquote.start, blockquote.end),
    quote: blockquote.lines.join("\n").trim() || null,
    after: lines.slice(blockquote.end),
  };
}

/** Adds a footer to the first authored blockquote, returning null when none exists. */
export function appendAnnotationQuoteFooter(body: string, footer: string): string | null {
  const lines = markdownLines(body);
  const blockquote = firstBlockquote(lines);
  if (!blockquote) {
    return null;
  }
  const footerLines = footer
    .trim()
    .split("\n")
    .map((line) => `> ${line}`);
  return [
    ...lines.slice(0, blockquote.end),
    ">",
    ...footerLines,
    ...lines.slice(blockquote.end),
  ].join("\n");
}

function markdownLines(markdown: string): readonly string[] {
  return markdown.replace(/\r\n?/gu, "\n").split("\n");
}

function firstBlockquote(lines: readonly string[]): BlockquoteRange | null {
  let fence: Fence | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (closesFence(line, fence)) {
        fence = null;
      }
      continue;
    }
    const openingFence = opensFence(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }
    if (blockquoteLine(line) !== null) {
      return readBlockquote(lines, index);
    }
  }
  return null;
}

function readBlockquote(lines: readonly string[], start: number): BlockquoteRange {
  const content: string[] = [];
  let end = start;
  let paragraphCanContinueLazily = false;
  while (end < lines.length) {
    const line = lines[end] ?? "";
    const quoted = blockquoteLine(line);
    if (quoted !== null) {
      content.push(quoted);
      paragraphCanContinueLazily = quoted.trim().length > 0;
      end += 1;
      continue;
    }
    if (paragraphCanContinueLazily && line.trim().length > 0 && !interruptsParagraph(line)) {
      content.push(line);
      end += 1;
      continue;
    }
    break;
  }
  return { start, end, lines: content };
}

function blockquoteLine(line: string): string | null {
  const match = /^ {0,3}>[\t ]?(.*)$/u.exec(line);
  return match ? (match[1] ?? "") : null;
}

function opensFence(line: string): Fence | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
  const run = match?.[1];
  if (!run) {
    return null;
  }
  const marker = run[0];
  return marker === "`" || marker === "~" ? { marker, length: run.length } : null;
}

function closesFence(line: string, fence: Fence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[\t ]*$/u.exec(line);
  const run = match?.[1];
  return Boolean(run?.startsWith(fence.marker) && run.length >= fence.length);
}

function interruptsParagraph(line: string): boolean {
  return /^(?: {4}| {0,3}(?:#{1,6}(?:[\t ]|$)|>|(?:[-+*]|\d+[.)])[\t ]|`{3,}|~{3,}))/u.test(line);
}
