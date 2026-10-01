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
});

describe("selection watcher", () => {
  beforeEach(() => {
    document.body.innerHTML = "<p>The exact durable quotation appears here.</p>";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("notifies the panel of new selections once, even when injected twice", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const page = pageEvents();
    vi.stubGlobal("chrome", { runtime: { sendMessage, onConnect: page.onConnect } });
    watchSelection("watch", 10_000);
    const replaced = fakePort("watch");
    page.connect(replaced);
    watchSelection("watch", 10_000);
    // The replaced watcher lets go of its port and its connect listener.
    expect(replaced.disconnect).toHaveBeenCalled();
    expect(page.listeners).toHaveLength(1);
    page.connect(fakePort("watch"));
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ type: "mdbase-reader/selection" });
    vi.useRealTimers();
  });

  it("stops watching once the panel holding its port goes away", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const page = pageEvents();
    vi.stubGlobal("chrome", { runtime: { sendMessage, onConnect: page.onConnect } });
    watchSelection("watch", 10_000);
    const port = fakePort("watch");
    page.connect(port);
    selectSomething();
    port.closeFromPanel();
    await vi.advanceTimersByTimeAsync(400);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(page.listeners).toHaveLength(0);
    vi.useRealTimers();
  });

  it("removes itself when no panel connects, and ignores other ports", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const page = pageEvents();
    vi.stubGlobal("chrome", { runtime: { sendMessage, onConnect: page.onConnect } });
    watchSelection("watch", 1000);
    page.connect(fakePort("something-else"));
    await vi.advanceTimersByTimeAsync(1000);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(page.listeners).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does not install a watcher once the extension has reloaded", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage,
        onConnect: {
          addListener: () => {
            throw new Error("Extension context invalidated.");
          },
          removeListener: () => undefined,
        },
      },
    });
    watchSelection("watch", 10_000);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("connects only to its own tab, replacing its earlier port", async () => {
    const ports: ReturnType<typeof fakePort>[] = [];
    const connect = vi.fn((_tab: number, { name }: { name: string }) => {
      const port = fakePort(name);
      ports.push(port);
      return port;
    });
    vi.stubGlobal("chrome", {
      tabs: { connect },
      scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    });
    await watchTabSelection(7);
    await watchTabSelection(7);
    // Other panels never receive this port, so none of them can close another tab's watcher.
    expect(connect.mock.calls.map(([tab]) => tab)).toEqual([7, 7]);
    expect(ports[0]?.disconnect).toHaveBeenCalled();
    expect(ports[1]?.disconnect).not.toHaveBeenCalled();
  });
});

/** The page side of `chrome.runtime.onConnect`, with a way to connect a panel's port. */
function pageEvents(): {
  onConnect: {
    addListener: (listener: (port: chrome.runtime.Port) => void) => void;
    removeListener: (listener: (port: chrome.runtime.Port) => void) => void;
  };
  listeners: ((port: chrome.runtime.Port) => void)[];
  connect: (port: ReturnType<typeof fakePort>) => void;
} {
  const listeners: ((port: chrome.runtime.Port) => void)[] = [];
  return {
    listeners,
    onConnect: {
      addListener: (listener) => listeners.push(listener),
      removeListener: (listener) => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      },
    },
    connect: (port) => {
      for (const listener of [...listeners]) {
        listener(port as unknown as chrome.runtime.Port);
      }
    },
  };
}

function selectSomething(): void {
  const text = document.querySelector("p")!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 9);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function fakePort(name = "mdbase-reader/selection-watch"): {
  name: string;
  disconnect: ReturnType<typeof vi.fn>;
  onDisconnect: { addListener: (listener: () => void) => void };
  closeFromPanel: () => void;
} {
  const listeners: (() => void)[] = [];
  return {
    name,
    disconnect: vi.fn(),
    onDisconnect: { addListener: (listener) => listeners.push(listener) },
    closeFromPanel: () => listeners.forEach((listener) => listener()),
  };
}
