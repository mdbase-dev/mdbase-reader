// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturePage, watchSelection, watchTabSelection } from "./page-capture.js";

import type { LiveWebCapture } from "@mdbase-reader/web-capture";

function htmlSnapshot(): LiveWebCapture {
  const snapshot = capturePage();
  if ("pdf" in snapshot) {
    throw new Error("Expected an HTML page");
  }
  return snapshot;
}

describe("extension page capture", () => {
  beforeEach(() => {
    window.location.href = "https://example.com/story?utm_source=test#section";
    document.head.innerHTML =
      '<title>A story</title><link rel="canonical" href="https://example.com/story">';
    document.body.innerHTML =
      '<main><article><p>The exact durable quotation appears here.</p></article><form><input value="private"><textarea>draft</textarea></form></main>';
  });
  afterEach(() => vi.unstubAllGlobals());

  it("captures the current DOM without form values and normalizes its URLs", () => {
    const captured = htmlSnapshot();
    expect(captured).toMatchObject({
      submittedUrl: "https://example.com/story?utm_source=test",
      canonicalUrl: "https://example.com/story",
      pageTitle: "A story",
    });
    expect(captured.html).toContain("durable quotation");
    expect(captured.html).not.toContain("private");
    expect(captured.html).not.toContain("draft");
  });

  it("includes text rendered inside open shadow roots, with slotted content in place", () => {
    const host = document.createElement("article-body");
    host.innerHTML = '<span slot="byline">By Ada</span>Light paragraph text.';
    host.attachShadow({ mode: "open" }).innerHTML =
      '<style>p{}</style><h2>Shadow heading</h2><slot name="byline"></slot><p>Shadow paragraph. <slot></slot></p>';
    document.querySelector("article")?.append(host);
    const { html } = htmlSnapshot();
    expect(html).toContain("Shadow heading");
    expect(html).toMatch(
      /<h2>Shadow heading<\/h2><span slot="byline">By Ada<\/span><p>Shadow paragraph\. Light paragraph text\.<\/p>/u,
    );
    expect(html).not.toContain("<slot");
    expect(html).not.toContain("p{}");
  });

  it("recognises a PDF open in Chrome's viewer instead of serializing its wrapper", () => {
    Object.defineProperty(document, "contentType", {
      value: "application/pdf",
      configurable: true,
    });
    try {
      expect(capturePage()).toEqual({
        pdf: true,
        url: "https://example.com/story?utm_source=test",
        title: "A story",
      });
    } finally {
      Object.defineProperty(document, "contentType", { value: "text/html", configurable: true });
    }
  });

  it("notifies the panel of new selections once, even when injected twice", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const ports = [fakePort(), fakePort()];
    const connect = vi.fn(() => ports[connect.mock.calls.length - 1]);
    vi.stubGlobal("chrome", { runtime: { sendMessage, connect } });
    watchSelection("watch");
    watchSelection("watch");
    expect(connect).toHaveBeenCalledWith({ name: "watch" });
    // The replaced watcher lets go of its port.
    expect(ports[0]?.disconnect).toHaveBeenCalled();
    expect(ports[1]?.disconnect).not.toHaveBeenCalled();
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ type: "mdbase-reader/selection" });
    vi.useRealTimers();
  });

  it("stops watching once the panel holding its port goes away", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const port = fakePort();
    vi.stubGlobal("chrome", { runtime: { sendMessage, connect: () => port } });
    watchSelection("watch");
    selectSomething();
    port.closeFromPanel();
    await vi.advanceTimersByTimeAsync(400);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not install a watcher without a panel to report to", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        connect: () => {
          throw new Error("Extension context invalidated.");
        },
      },
    });
    watchSelection("watch");
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps the watcher of its own tab and lets go of other tabs' watchers", async () => {
    const listeners: ((port: chrome.runtime.Port) => void)[] = [];
    vi.stubGlobal("chrome", {
      runtime: { onConnect: { addListener: (listener: never) => listeners.push(listener) } },
      scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    });
    await watchTabSelection(7);
    await watchTabSelection(7);
    expect(listeners).toHaveLength(1);
    const own = { ...fakePort(), sender: { tab: { id: 7 } } };
    const other = { ...fakePort(), sender: { tab: { id: 8 } } };
    const unrelated = { ...fakePort(), name: "something-else", sender: { tab: { id: 8 } } };
    for (const port of [own, other, unrelated]) {
      listeners[0]?.(port as unknown as chrome.runtime.Port);
    }
    expect(own.disconnect).not.toHaveBeenCalled();
    expect(other.disconnect).toHaveBeenCalled();
    expect(unrelated.disconnect).not.toHaveBeenCalled();
  });
});

function selectSomething(): void {
  const text = document.querySelector("p")!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 9);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function fakePort(): {
  name: string;
  disconnect: ReturnType<typeof vi.fn>;
  onDisconnect: { addListener: (listener: () => void) => void };
  closeFromPanel: () => void;
} {
  const listeners: (() => void)[] = [];
  return {
    name: "mdbase-reader/selection-watch",
    disconnect: vi.fn(),
    onDisconnect: { addListener: (listener) => listeners.push(listener) },
    closeFromPanel: () => listeners.forEach((listener) => listener()),
  };
}
