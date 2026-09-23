import { pageAnnotations, type PageQuote, type ProjectionReport } from "./page-annotations.js";

import type { QuoteSelector } from "@mdbase-reader/core";
import type { LiveWebCapture } from "@mdbase-reader/web-capture";

export interface SelectedWebCapture extends LiveWebCapture {
  readonly selection: QuoteSelector | null;
}

export async function captureTab(tabId: number): Promise<SelectedWebCapture> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: capturePage,
  });
  if (!execution?.result) {
    throw new Error(
      "Reader could not inspect this page. Open an ordinary HTTPS page and try again.",
    );
  }
  const [selection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageAnnotations,
    args: [{ action: "selection" }],
  });
  return { ...execution.result, selection: selection?.result?.selection ?? null };
}

export function capturePage(): LiveWebCapture {
  const url = new URL(document.location.href);
  if (url.protocol !== "https:" || url.username || url.password) {
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
  for (const control of clone.querySelectorAll(
    "input, textarea, select, option, [contenteditable], [data-mdbase-reader-ui], [data-mdbase-reader-highlights]",
  )) {
    control.remove();
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
  annotations: readonly PageQuote[],
  expectedUrl: string,
): Promise<ProjectionReport> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).href.split("#")[0] !== expectedUrl.split("#")[0]) {
    throw new Error(
      "The tab has navigated to another page. Reopen Reader’s extension on that page.",
    );
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: pageAnnotations,
    args: [{ action: "render", quotes: annotations, expectedUrl }],
  });
  if (!execution?.result) {
    throw new Error("Could not display highlights. Reopen the extension on this page.");
  }
  return execution.result.report;
}
