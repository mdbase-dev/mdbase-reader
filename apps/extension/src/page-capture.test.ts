// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturePage,
  fetchPdf,
  followPageKeys,
  pagePdfBytes,
  watchSelection,
  watchTabSelection,
} from "./page-capture.js";

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

describe("PDF capture downloads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])(
    "downloads the saved page's PDF after tab navigation (fallback: %s)",
    async (fallback) => {
      const savedUrl = "https://example.com/saved.pdf";
      window.location.href = "https://example.com/next.pdf";
      const bytes = new Uint8Array([1, 2, 3]);
      const fetch = vi.fn((url: string) =>
        Promise.resolve(new Response(url === savedUrl ? bytes : new Uint8Array([9]))),
      );
      vi.stubGlobal("fetch", fetch);
      const executeScript = vi.fn(
        async ({ func, args }: { func: typeof pagePdfBytes; args: [string, number] }) => {
          if (fallback) {
            throw new Error("Cannot access this page");
          }
          return [{ result: await func(...args) }];
        },
      );
      vi.stubGlobal("chrome", { scripting: { executeScript } });
      expect(await fetchPdf(1, savedUrl)).toEqual(bytes);
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 1 },
        func: pagePdfBytes,
        args: [savedUrl, expect.any(Number)],
      });
      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        savedUrl,
        ...(fallback ? [] : [{ credentials: "include" }]),
      );
    },
  );
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

describe("page highlight keys", () => {
  beforeEach(() => {
    document.body.innerHTML = "<p>The exact durable quotation appears here.</p>";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the panel's highlight keys while text is selected on the page", async () => {
    vi.useFakeTimers();
    const page = pageEvents();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(() => Promise.resolve()), onConnect: page.onConnect },
    });
    document.body.innerHTML =
      "<p>The exact durable quotation appears here.</p><input><div contenteditable>notes</div>";
    watchSelection("watch", 10_000);
    const port = fakePort("watch");
    page.connect(port);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    // Until the panel arms them, the page's keys are its own.
    expect(press("1")).toBe(false);
    port.receive({ type: "mdbase-reader/page-keys", colors: 3, clear: true });
    expect(press("1")).toBe(true);
    expect(press("Escape")).toBe(true);
    expect(port.postMessage.mock.calls).toEqual([
      [{ type: "mdbase-reader/page-key", key: "1" }],
      [{ type: "mdbase-reader/page-key", key: "Escape" }],
    ]);
    port.postMessage.mockClear();
    // Beyond the colours, with a modifier, held down, composing, or while typing: not ours.
    expect(press("4")).toBe(false);
    expect(press("2", { ctrlKey: true })).toBe(false);
    expect(press("2", { metaKey: true })).toBe(false);
    expect(press("2", { altKey: true })).toBe(false);
    expect(press("2", { repeat: true })).toBe(false);
    expect(press("2", { isComposing: true })).toBe(false);
    expect(press("2", {}, document.querySelector("input")!)).toBe(false);
    expect(press("2", {}, document.querySelector("[contenteditable]")!)).toBe(false);
    document.querySelector("input")!.focus();
    expect(press("2")).toBe(false);
    document.querySelector("input")!.blur();
    // Nothing selected, or the panel not acting now (a save is running, or nothing pending).
    document.getSelection()!.removeAllRanges();
    expect(press("2")).toBe(false);
    selectSomething();
    await vi.advanceTimersByTimeAsync(400);
    port.receive({ type: "mdbase-reader/page-keys", colors: 0, clear: false });
    expect(press("2")).toBe(false);
    expect(press("Escape")).toBe(false);
    expect(port.postMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reports a selection not yet told to the panel rather than act on the one it shows", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => Promise.resolve());
    const page = pageEvents();
    vi.stubGlobal("chrome", { runtime: { sendMessage, onConnect: page.onConnect } });
    watchSelection("watch", 10_000);
    const port = fakePort("watch");
    page.connect(port);
    port.receive({ type: "mdbase-reader/page-keys", colors: 3, clear: true });
    selectSomething();
    expect(press("1")).toBe(false);
    expect(port.postMessage).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: "mdbase-reader/selection" });
    await vi.advanceTimersByTimeAsync(400);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(press("1")).toBe(true);
    vi.useRealTimers();
  });

  it("arms the page's keys over its port and hands each forwarded key to the panel", async () => {
    const ports: ReturnType<typeof fakePort>[] = [];
    vi.stubGlobal("chrome", {
      tabs: {
        connect: vi.fn((_tab: number, { name }: { name: string }) => {
          const port = fakePort(name);
          ports.push(port);
          return port;
        }),
      },
      scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    });
    const onKey = vi.fn();
    const disarm = followPageKeys(8, { colors: 2, clear: true }, onKey);
    await watchTabSelection(8);
    const port = ports[0]!;
    // A page connected after arming is told the keys straight away.
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: "mdbase-reader/page-keys",
      colors: 2,
      clear: true,
    });
    port.receive({ type: "mdbase-reader/page-key", key: "2" });
    port.receive({ type: "something-else", key: "1" });
    expect(onKey).toHaveBeenCalledExactlyOnceWith("2");
    disarm();
    expect(port.postMessage).toHaveBeenLastCalledWith({
      type: "mdbase-reader/page-keys",
      colors: 0,
      clear: false,
    });
    port.receive({ type: "mdbase-reader/page-key", key: "1" });
    expect(onKey).toHaveBeenCalledTimes(1);
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
  postMessage: ReturnType<typeof vi.fn>;
  onDisconnect: { addListener: (listener: () => void) => void };
  onMessage: { addListener: (listener: (message: unknown) => void) => void };
  closeFromPanel: () => void;
  /** Delivers a message from the other end of the port. */
  receive: (message: unknown) => void;
} {
  const listeners: (() => void)[] = [];
  const messageListeners: ((message: unknown) => void)[] = [];
  return {
    name,
    disconnect: vi.fn(),
    postMessage: vi.fn(),
    onDisconnect: { addListener: (listener) => listeners.push(listener) },
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    closeFromPanel: () => listeners.forEach((listener) => listener()),
    receive: (message) => messageListeners.forEach((listener) => listener(message)),
  };
}

/** Presses a key in the page, returning whether the page's default action was prevented. */
function press(
  key: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.body,
): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
