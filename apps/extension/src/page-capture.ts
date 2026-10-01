import {
  drawPageQuotes,
  injectPageText,
  revealPageQuote,
  type PageProjection,
  type PageQuote,
} from "./page-annotations.js";

import type { QuoteSelector } from "@mdbase-reader/core";
import type { LiveWebCapture } from "@mdbase-reader/web-capture";

export interface SelectedWebCapture extends LiveWebCapture {
  readonly kind: "html";
  readonly selection: QuoteSelector | null;
}

/** A PDF open in Chrome's viewer. Its bytes are fetched only when saving. */
export interface PdfCapture {
  readonly kind: "pdf";
  readonly submittedUrl: string;
  readonly canonicalUrl: string;
  readonly retrievedAt: string;
  readonly pageTitle: string;
  readonly selection: null;
}

export type PageCapture = SelectedWebCapture | PdfCapture;

type PageSnapshot =
  LiveWebCapture | { readonly pdf: true; readonly url: string; readonly title: string };

const maximumPdfBytes = 40 * 1024 * 1024;

export async function captureTab(tabId: number): Promise<PageCapture> {
  let snapshot: PageSnapshot | undefined;
  try {
    [{ result: snapshot } = { result: undefined }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: capturePage,
    });
  } catch (reason) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && /\.pdf$/iu.test(new URL(tab.url).pathname)) {
      return pdfCapture(tab.url, tab.title ?? "");
    }
    throw reason;
  }
  if (!snapshot) {
    throw new Error(
      "Reader could not inspect this page. Open an ordinary HTTPS page and try again.",
    );
  }
  if ("pdf" in snapshot) {
    return pdfCapture(snapshot.url, snapshot.title);
  }
  return { ...snapshot, kind: "html", selection: await readSelection(tabId) };
}

export async function readSelection(tabId: number): Promise<QuoteSelector | null> {
  return (await injectPageText(tabId, { action: "selection" })).selection ?? null;
}

/** Tells the panel when the reader selects text, so no extra clicks are needed per highlight. */
export async function watchTabSelection(tabId: number): Promise<void> {
  holdSelectionWatchers();
  watchedTabs.add(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: watchSelection,
    args: [selectionWatchPort],
  });
}

const selectionWatchPort = "mdbase-reader/selection-watch";
/** Tabs whose watcher this panel keeps alive. */
const watchedTabs = new Set<number>();
let holdingWatchers = false;

/**
 * Each watcher connects a port back to the panel and uninstalls itself once the port
 * disconnects. Chrome disconnects it when the panel closes, so the page stops reporting
 * selections nobody reads. Other panels let go of watchers for tabs they do not show.
 */
function holdSelectionWatchers(): void {
  if (holdingWatchers) {
    return;
  }
  holdingWatchers = true;
  chrome.runtime.onConnect.addListener((port) => {
    const tab = port.sender?.tab?.id;
    if (port.name === selectionWatchPort && (tab === undefined || !watchedTabs.has(tab))) {
      port.disconnect();
    }
  });
}

export async function fetchPdf(tabId: number, url: string): Promise<Uint8Array> {
  // Fetch from the page itself so the reader's own access (institutional login) applies.
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: pagePdfBytes,
      args: [maximumPdfBytes],
    });
    const result = execution?.result;
    if (result && "base64" in result) {
      return Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
    }
    if (result) {
      throw new Error(result.error);
    }
  } catch (reason) {
    if (reason instanceof Error && reason.message.includes("larger than")) {
      throw reason;
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download this PDF (HTTP ${String(response.status)}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function pdfCapture(url: string, title: string): PdfCapture {
  const clean = new URL(url);
  if (clean.protocol !== "https:" || clean.username || clean.password) {
    throw new Error("Reader can capture ordinary HTTPS pages only.");
  }
  clean.hash = "";
  const name = decodeURIComponent(clean.pathname.split("/").at(-1) ?? "").replace(/\.pdf$/iu, "");
  return {
    kind: "pdf",
    submittedUrl: clean.href,
    canonicalUrl: clean.href,
    retrievedAt: new Date().toISOString(),
    pageTitle: title.trim() && title.trim() !== clean.href ? title.trim() : name || clean.hostname,
    selection: null,
  };
}

/** Chrome serializes this function alone: all runtime helpers must be nested. */
export function capturePage(): PageSnapshot {
  const url = new URL(document.location.href);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Reader can capture ordinary HTTPS pages only.");
  }
  url.hash = "";
  if (document.contentType === "application/pdf") {
    return { pdf: true, url: url.href, title: document.title };
  }
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
  // cloneNode drops shadow roots, where web-component sites keep their article text.
  flattenShadowRoots(document.documentElement, clone.documentElement);
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

  /** Replaces each open shadow host's copy with its rendered content, resolving slots. */
  function flattenShadowRoots(live: Element, copy: Element): void {
    const liveChildren = [...live.children];
    const copyChildren = [...copy.children];
    liveChildren.forEach((child, index) => {
      const counterpart = copyChildren[index];
      if (counterpart) {
        flattenShadowRoots(child, counterpart);
      }
    });
    const root = live.shadowRoot;
    if (!root) {
      return;
    }
    const owner = copy.ownerDocument;
    const rendered = [...root.childNodes].map((node) => {
      const imported = owner.importNode(node, true);
      if (node instanceof Element && imported instanceof Element) {
        flattenShadowRoots(node, imported);
      }
      return imported;
    });
    const light = [...copy.childNodes];
    const holder = owner.createElement("div");
    holder.append(...rendered);
    for (const slot of holder.querySelectorAll("slot")) {
      const name = slot.getAttribute("name") ?? "";
      const assigned = light.filter((node) =>
        node instanceof Element ? (node.getAttribute("slot") ?? "") === name : name === "",
      );
      slot.replaceWith(...(assigned.length ? assigned : [...slot.childNodes]));
    }
    holder.querySelectorAll("style").forEach((style) => style.remove());
    copy.replaceChildren(...holder.childNodes);
  }
}

/**
 * Injected; reinstalling replaces an earlier watcher (e.g. after the extension reloads). It
 * stays installed only while the panel holds the other end of its port.
 */
export function watchSelection(portName: string): void {
  const scope = globalThis as unknown as { mdbaseReaderSelectionWatch?: AbortController };
  scope.mdbaseReaderSelectionWatch?.abort();
  const controller = new AbortController();
  scope.mdbaseReaderSelectionWatch = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: portName });
  } catch {
    // The extension was reloaded; its new panel reinstalls this watcher.
    controller.abort();
    return;
  }
  port.onDisconnect.addListener(() => controller.abort());
  controller.signal.addEventListener("abort", () => {
    clearTimeout(timer);
    port.disconnect();
  });
  document.addEventListener(
    "selectionchange",
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!document.getSelection()?.toString().trim()) {
          return;
        }
        try {
          void chrome.runtime
            .sendMessage({ type: "mdbase-reader/selection" })
            .catch(() => undefined);
        } catch {
          controller.abort();
        }
      }, 350);
    },
    { signal: controller.signal },
  );
}

/** Injected into a PDF tab. Returns base64 because script results must be JSON. */
export async function pagePdfBytes(
  maximumBytes: number,
): Promise<{ readonly base64: string } | { readonly error: string }> {
  const response = await fetch(location.href, { credentials: "include" });
  if (!response.ok) {
    return { error: `Could not download this PDF (HTTP ${String(response.status)}).` };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    return {
      error: `This PDF is larger than ${String(Math.round(maximumBytes / 1024 / 1024))} MB. Download it and import the file in Reader.`,
    };
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return { base64: btoa(binary) };
}

/** Draws the quotes on the tab, optionally scrolling to the one at `focus`. */
export async function renderAnnotations(
  tabId: number,
  annotations: readonly PageQuote[],
  expectedUrl: string,
  focus?: number,
): Promise<PageProjection> {
  return drawPageQuotes(tabId, annotations, expectedUrl, focus);
}

/**
 * Scrolls to the quote at `focus` and marks it, leaving the other highlights as drawn.
 * Returns null then; only when that quote was not drawn yet are all of them drawn again,
 * and the new projection is returned.
 */
export async function revealAnnotation(
  tabId: number,
  annotations: readonly PageQuote[],
  focus: number,
  expectedUrl: string,
): Promise<PageProjection | null> {
  return revealPageQuote(tabId, annotations, focus, expectedUrl);
}
