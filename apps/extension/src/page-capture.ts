import type { LiveWebCapture } from "@mdbase-reader/web-capture";

export async function captureTab(tabId: number): Promise<LiveWebCapture> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: capturePage,
  });
  if (!execution?.result) {
    throw new Error(
      "Reader could not inspect this page. Open an ordinary HTTPS page and try again.",
    );
  }
  return execution.result;
}

export function capturePage(): LiveWebCapture {
  const url = new URL(document.location.href);
  if (url.protocol !== "https:") {
    throw new Error("Reader can capture ordinary HTTPS pages only.");
  }
  url.hash = "";
  const canonical = document.querySelector<HTMLLinkElement>('link[rel~="canonical"]')?.href;
  let canonicalUrl = url.href;
  if (canonical) {
    try {
      const candidate = new URL(canonical);
      if (candidate.protocol === "https:" && !candidate.username && !candidate.password) {
        candidate.hash = "";
        canonicalUrl = candidate.href;
      }
    } catch {
      // A malformed canonical link is weaker evidence than the page URL.
    }
  }
  const clone = document.cloneNode(true) as Document;
  for (const control of clone.querySelectorAll("input, textarea, select, option")) {
    control.remove();
  }
  for (const editable of clone.querySelectorAll("[contenteditable]")) {
    editable.removeAttribute("contenteditable");
  }
  const pageTitle = document.title.trim().slice(0, 300);
  return {
    submittedUrl: url.href,
    canonicalUrl,
    retrievedAt: new Date().toISOString(),
    html: `<!doctype html>\n${clone.documentElement.outerHTML}`,
    pageTitle: pageTitle.length ? pageTitle : url.hostname,
  };
}

export async function renderAnnotations(
  tabId: number,
  annotations: readonly { exact: string; color?: string }[],
): Promise<number> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: markQuotes,
    args: [annotations],
  });
  return execution?.result ?? 0;
}

export function markQuotes(annotations: readonly { exact: string; color?: string }[]): number {
  document
    .querySelectorAll("mark[data-mdbase-reader-annotation]")
    .forEach((mark) => mark.replaceWith(...mark.childNodes));
  const { nodes, text } = readableTextNodes();
  let marked = 0;
  for (const annotation of annotations) {
    const start = uniqueQuoteStart(text, annotation.exact);
    if (start === null) {
      continue;
    }
    const range = quoteRange(nodes, start, start + annotation.exact.length);
    if (range && decorateRange(range, annotation.color)) {
      marked += 1;
    }
  }
  return marked;
}

function readableTextNodes(): { readonly nodes: Text[]; readonly text: string } {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent &&
        !parent.closest(
          "script, style, textarea, input, select, mark[data-mdbase-reader-annotation]",
        )
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text);
    text += node.textContent ?? "";
  }
  return { nodes, text };
}

function uniqueQuoteStart(text: string, exact: string): number | null {
  const start = text.indexOf(exact);
  return start >= 0 && start === text.lastIndexOf(exact) ? start : null;
}

function quoteRange(nodes: readonly Text[], start: number, end: number): Range | null {
  let offset = 0;
  let startBoundary: { readonly node: Text; readonly offset: number } | null = null;
  for (const node of nodes) {
    const next = offset + node.data.length;
    if (!startBoundary && start >= offset && start < next) {
      startBoundary = { node, offset: start - offset };
    }
    if (startBoundary && end > offset && end <= next) {
      const range = document.createRange();
      range.setStart(startBoundary.node, startBoundary.offset);
      range.setEnd(node, end - offset);
      return range;
    }
    offset = next;
  }
  return null;
}

function decorateRange(range: Range, color: string | undefined): boolean {
  const mark = document.createElement("mark");
  mark.dataset["mdbaseReaderAnnotation"] = "true";
  mark.style.background = color ?? "rgba(247, 210, 78, .52)";
  mark.style.color = "inherit";
  mark.style.boxShadow = "0 0 0 2px rgba(247, 210, 78, .18)";
  try {
    range.surroundContents(mark);
    return true;
  } catch {
    return false;
  }
}
