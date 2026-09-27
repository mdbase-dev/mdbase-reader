// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EpubFrameEnhancements } from "./epub-frames.js";

function frameDocument(container: HTMLElement): Document {
  const frame = document.createElement("iframe");
  container.append(frame);
  const inner = frame.contentDocument;
  if (!inner) {
    throw new Error("Missing frame document");
  }
  inner.body.innerHTML = "<p>Attention is the rarest form of generosity.</p>";
  return inner;
}

function select(inner: Document, end: number): void {
  const text = inner.querySelector("p")?.firstChild;
  if (!text) {
    throw new Error("Missing fixture");
  }
  inner.defaultView?.getSelection()?.setBaseAndExtent(text, 0, text, end);
  inner.dispatchEvent(new Event("selectionchange"));
}

describe("EpubFrameEnhancements", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports a selection made without a pointer release once it settles", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const inner = frameDocument(container);
    const settled = vi.fn();
    const frames = new EpubFrameEnhancements(container, settled);
    inner.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerType: "touch" }));
    select(inner, 9);
    vi.advanceTimersByTime(400);
    expect(settled).toHaveBeenCalledWith(inner, "touch");

    // Moving a handle reports the new range; the same range settling again does not.
    select(inner, 12);
    vi.advanceTimersByTime(400);
    inner.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(settled).toHaveBeenCalledTimes(2);
    frames.destroy();
  });

  it("leaves a selection Readium reported on release alone", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const inner = frameDocument(container);
    const settled = vi.fn();
    const frames = new EpubFrameEnhancements(container, settled);
    select(inner, 9);
    inner.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(400);
    expect(settled).not.toHaveBeenCalled();
    frames.destroy();
  });

  it("reports the selection clearing as it settles", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const inner = frameDocument(container);
    const frames = new EpubFrameEnhancements(container, vi.fn());
    const cleared = vi.fn();
    frames.onSelectionCleared(cleared);
    select(inner, 9);
    vi.advanceTimersByTime(400);
    inner.defaultView?.getSelection()?.removeAllRanges();
    inner.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(400);
    expect(cleared).toHaveBeenCalledTimes(1);
    frames.destroy();
  });
});
