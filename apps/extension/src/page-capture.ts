import { t } from "@lingui/core/macro";

import { localizedCaptureError } from "./capture-errors.js";
import {
  drawPageQuotes,
  injectPageText,
  revealPageQuote,
  type PageProjection,
  type PageQuote,
} from "./page-annotations.js";

import type { SocialPageItems } from "./social-page.js";
import type { QuoteSelector } from "@mdbase-reader/core";
import type { LiveWebCapture } from "@mdbase-reader/web-capture";

export interface SelectedWebCapture extends LiveWebCapture {
  readonly kind: "html";
  readonly selection: QuoteSelector | null;
  readonly selectionPostId?: string;
  /** The browsing page may be a feed; provenance always belongs to the post. */
  readonly pageUrl?: string;
  readonly social?: SocialPageItems;
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

export async function captureSocialTab(
  tabId: number,
  id?: string,
): Promise<SelectedWebCapture | null> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["social-page.js"] });
  } catch {
    return null;
  }
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (postId?: string) => globalThis.mdbaseReaderSocialPage?.capture(postId) ?? null,
    // Chrome refuses `undefined` as an injection argument.
    args: id === undefined ? [] : [id],
  });
  return execution?.result ?? null;
}

export async function captureTab(tabId: number): Promise<PageCapture> {
  const social = await captureSocialTab(tabId);
  if (social) {
    return social;
  }
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
    throw localizedCaptureError(reason);
  }
  if (!snapshot) {
    throw new Error(
      t`Reader could not inspect this page. Open an ordinary HTTPS page and try again.`,
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

/** Lets go of the page's selection once it has been saved, so the page does not offer it again. */
export async function clearPageSelection(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.getSelection()?.removeAllRanges(),
  });
}

/** Tells the panel when the reader selects text, so no extra clicks are needed per highlight. */
export async function watchTabSelection(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: watchSelection,
    args: [selectionWatchPort, selectionWatchGraceMs],
  });
  // The panel connects to its own tab only, so other panels never see this port. Closing the
  // panel disconnects it, and the page then stops reporting selections nobody reads.
  watchPorts.get(tabId)?.disconnect();
  const port = chrome.tabs.connect(tabId, { name: selectionWatchPort });
  watchPorts.set(tabId, port);
  port.onMessage.addListener((message: unknown) => {
    if (isPageKeyMessage(message)) {
      pageKeys.get(tabId)?.onKey(message.key);
    }
  });
  postPageKeys(tabId, pageKeys.get(tabId)?.keys ?? noPageKeys);
}

/** Which highlight keys the panel acts on now: digits 1 to `colors`, and Esc when `clear`. */
export interface PageKeys {
  readonly colors: number;
  readonly clear: boolean;
}

/**
 * Lets the panel's highlight keys work while focus is in the page: the page forwards the
 * keys `keys` arms to `onKey`. The returned function disarms them.
 */
export function followPageKeys(
  tabId: number,
  keys: PageKeys,
  onKey: (key: string) => void,
): () => void {
  const entry = { keys, onKey };
  pageKeys.set(tabId, entry);
  postPageKeys(tabId, keys);
  return () => {
    if (pageKeys.get(tabId) === entry) {
      pageKeys.delete(tabId);
      postPageKeys(tabId, noPageKeys);
    }
  };
}

function postPageKeys(tabId: number, keys: PageKeys): void {
  try {
    watchPorts.get(tabId)?.postMessage({ type: pageKeysMessage, ...keys });
  } catch {
    // The page went away; its next watcher is told the keys when it connects.
  }
}

function isPageKeyMessage(value: unknown): value is { readonly key: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === pageKeyMessage &&
    "key" in value &&
    typeof value.key === "string"
  );
}

/** Closes this panel's port to a tab, so the page stops reporting selections. */
export function unwatchTabSelection(tabId: number): void {
  watchPorts.get(tabId)?.disconnect();
  watchPorts.delete(tabId);
}

const selectionWatchPort = "mdbase-reader/selection-watch";
/** How long an installed watcher waits for its panel to connect before removing itself. */
const selectionWatchGraceMs = 10_000;
/** This panel's open port to each tab it watches. */
const watchPorts = new Map<number, chrome.runtime.Port>();
/** The panel tells the page which keys to forward; the page sends back each one pressed. */
const pageKeysMessage = "mdbase-reader/page-keys";
const pageKeyMessage = "mdbase-reader/page-key";
const noPageKeys: PageKeys = { colors: 0, clear: false };
const pageKeys = new Map<
  number,
  { readonly keys: PageKeys; readonly onKey: (key: string) => void }
>();

export async function fetchPdf(tabId: number, url: string): Promise<Uint8Array> {
  // Fetch from the page itself so the reader's own access (institutional login) applies.
  let result: Awaited<ReturnType<typeof pagePdfBytes>> | undefined;
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: pagePdfBytes,
      args: [url, maximumPdfBytes],
    });
    result = execution?.result;
  } catch {
    // Browser pages may forbid injection; the ordinary fetch below remains available.
  }
  if (result && "base64" in result) {
    return Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
  }
  if (result?.error === "too-large") {
    const maximumMb = Math.round(maximumPdfBytes / 1024 / 1024);
    throw new Error(
      t`This PDF is larger than ${maximumMb} MB. Download it and import the file in Reader.`,
    );
  }
  const response = await fetch(url);
  if (!response.ok) {
    const status = response.status;
    throw new Error(t`Could not download this PDF (HTTP ${status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function pdfCapture(url: string, title: string): PdfCapture {
  const clean = new URL(url);
  if (clean.protocol !== "https:" || clean.username || clean.password) {
    throw new Error(t`Reader can capture ordinary HTTPS pages only.`);
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
    throw new Error("reader/https-only");
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
 * stays installed only while its panel holds the port the panel connects to this tab.
 */
export function watchSelection(portName: string, graceMs: number): void {
  // Repeated here: an injected function cannot use the module's constants.
  const keysMessage = "mdbase-reader/page-keys";
  const keyMessage = "mdbase-reader/page-key";
  const scope = globalThis as unknown as { mdbaseReaderSelectionWatch?: AbortController };
  scope.mdbaseReaderSelectionWatch?.abort();
  const controller = new AbortController();
  scope.mdbaseReaderSelectionWatch = controller;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let port: chrome.runtime.Port | null = null;
  // The keys the panel acts on now; none until it says.
  let keys = { colors: 0, clear: false };
  // A panel that never connects (it closed while installing) leaves no watcher behind.
  const unclaimed = setTimeout(() => controller.abort(), graceMs);
  const onConnect = (incoming: chrome.runtime.Port): void => {
    if (incoming.name !== portName || port) {
      return;
    }
    port = incoming;
    clearTimeout(unclaimed);
    incoming.onDisconnect.addListener(() => controller.abort());
    incoming.onMessage.addListener((message: unknown) => {
      const value = message as { type?: unknown; colors?: unknown; clear?: unknown } | null;
      if (value?.type === keysMessage) {
        keys = {
          colors: typeof value.colors === "number" ? value.colors : 0,
          clear: value.clear === true,
        };
      }
    });
  };
  try {
    chrome.runtime.onConnect.addListener(onConnect);
  } catch {
    // The extension was reloaded; its new panel reinstalls this watcher.
    controller.abort();
    return;
  }
  controller.signal.addEventListener("abort", () => {
    clearTimeout(timer);
    clearTimeout(unclaimed);
    chrome.runtime.onConnect.removeListener(onConnect);
    port?.disconnect();
  });
  const report = (): void => {
    timer = undefined;
    if (!document.getSelection()?.toString().trim()) {
      return;
    }
    try {
      void chrome.runtime.sendMessage({ type: "mdbase-reader/selection" }).catch(() => undefined);
    } catch {
      controller.abort();
    }
  };
  document.addEventListener(
    "selectionchange",
    () => {
      clearTimeout(timer);
      timer = setTimeout(report, 350);
    },
    { signal: controller.signal },
  );
  const editable = (node: unknown): boolean =>
    node instanceof Element &&
    (node.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !==
      null ||
      (node instanceof HTMLElement && node.isContentEditable));
  // Keys meant for the page, or for whatever the reader is typing in.
  const notForPanel = (event: KeyboardEvent): boolean =>
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    editable(event.target) ||
    editable(document.activeElement);
  // The panel's highlight keys, for a reader whose focus is still in the page they selected on.
  window.addEventListener(
    "keydown",
    (event) => {
      if (!port || notForPanel(event)) {
        return;
      }
      const digit = /^[1-9]$/u.test(event.key) ? Number(event.key) : 0;
      const acts = (digit > 0 && digit <= keys.colors) || (event.key === "Escape" && keys.clear);
      const selection = document.getSelection();
      if (!acts || !selection || selection.isCollapsed || !selection.toString().trim()) {
        return;
      }
      if (timer !== undefined) {
        // The panel still shows the previous selection; report this one rather than act on that.
        clearTimeout(timer);
        report();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        port.postMessage({ type: keyMessage, key: event.key });
      } catch {
        controller.abort();
      }
    },
    { capture: true, signal: controller.signal },
  );
}

/** Injected into a tab, which may have navigated since Save. Fetch only the captured URL. */
export async function pagePdfBytes(
  url: string,
  maximumBytes: number,
): Promise<{ readonly base64: string } | { readonly error: string }> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    return { error: "http" };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    return { error: "too-large" };
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
