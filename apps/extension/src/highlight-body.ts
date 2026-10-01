/**
 * A highlight's Markdown body is its passage as a blockquote, then the reader's comment.
 * Bodies edited elsewhere may have no leading quote; then all of it is the comment.
 */
export function highlightBody(exact: string, comment: string): string {
  const quote = exact
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return comment.trim() ? `${quote}\n\n${comment}` : quote;
}

export function highlightComment(body: string): string {
  return body
    .slice(quoteLength(body))
    .replace(/^\s*\n/u, "")
    .trimEnd();
}

/** Replaces only the comment, keeping the saved quote text exactly as it is. */
export function withHighlightComment(body: string, comment: string): string {
  const quote = body.slice(0, quoteLength(body)).trimEnd();
  if (!quote) {
    return comment;
  }
  return comment.trim() ? `${quote}\n\n${comment}` : quote;
}

function quoteLength(body: string): number {
  let length = 0;
  for (const line of body.split("\n")) {
    if (!line.startsWith(">")) {
      break;
    }
    length += line.length + 1;
  }
  return Math.min(length, body.length);
}

/**
 * A passage as the panel shows it: the page's indentation and line wrapping dropped, with
 * paragraph breaks kept. Display only; the saved selector keeps the page's own text.
 */
export function displayQuote(exact: string): string {
  return exact
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
