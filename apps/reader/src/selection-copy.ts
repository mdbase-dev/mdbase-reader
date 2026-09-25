import { appendAnnotationQuoteFooter } from "@mdbase-reader/core";

/** Where copied text came from, for its citation line. */
export interface QuoteCitation {
  readonly citekey?: string | undefined;
  readonly title: string;
  /** A human locator such as "p. 16"; omitted when it names nothing a reader could find. */
  readonly locator?: string | undefined;
}

/**
 * The passage as a Markdown blockquote with a citation line: a Pandoc citation when the source
 * has a citekey, otherwise its title. Pasted into a literature note it renders and cites cleanly.
 */
export function citedQuote(text: string, citation: QuoteCitation): string {
  const quote = text
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
  const locator = citation.locator?.trim();
  const footer = citation.citekey
    ? `[@${citation.citekey}${locator ? `, ${locator}` : ""}]`
    : `— ${citation.title}${locator ? `, ${locator}` : ""}`;
  return appendAnnotationQuoteFooter(quote, footer) ?? quote;
}

/** Only page labels locate a passage for someone else; EPUB and web locations do not. */
export function citableLocator(label: string | undefined): string | undefined {
  return label && /^pp?\.\s/u.test(label) ? label : undefined;
}

/**
 * Copies text. The Clipboard API needs focus and permission that embedded or older browsers may
 * refuse, so fall back to a hidden textarea and the legacy copy command.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy path below.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only fallback without the Clipboard API
    if (!document.execCommand("copy")) {
      throw new Error("The browser refused to copy.");
    }
  } finally {
    field.remove();
  }
}
