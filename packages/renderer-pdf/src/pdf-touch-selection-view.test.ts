// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { findPdfScroller, TouchSelectionView } from "./pdf-touch-selection-view.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function fixture(): { root: ShadowRoot; scroller: HTMLElement; view: TouchSelectionView } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const viewport = document.createElement("div");
  viewport.style.overflowY = "auto";
  const scroller = document.createElement("div");
  scroller.style.cssText = "position:relative;width:360px;height:1400px;margin:0 auto";
  viewport.append(scroller);
  root.append(viewport);
  return { root, scroller, view: new TouchSelectionView(root) };
}

const rect = { origin: { x: 10, y: 20 }, size: { width: 10, height: 12 } };

describe("PDF touch handle overlay", () => {
  it("attaches to content coordinates, leaving scrolling and clipping to the viewer", () => {
    const f = fixture();
    expect(findPdfScroller(f.root)).toBe(f.scroller);
    expect(f.view.attach()).toBe(true);
    expect(f.view.overlay.parentElement).toBe(f.scroller);
    expect(f.view.viewport).toBe(f.scroller.parentElement);
    f.view.destroy();
    expect(f.root.querySelector("[data-reader-pdf-handles]")).toBeNull();
    expect(f.root.querySelector("style")).toBeNull();
  });

  it("reuses the mounted content box and reattaches when the viewer replaces it", () => {
    const f = fixture();
    f.view.attach();
    const scan = vi.spyOn(f.root, "querySelectorAll");
    expect(f.view.attach()).toBe(true);
    expect(scan).not.toHaveBeenCalled();
    const replacement = document.createElement("div");
    replacement.style.cssText = f.scroller.style.cssText;
    f.scroller.replaceWith(replacement);
    expect(f.view.attach()).toBe(true);
    expect(scan.mock.calls.filter(([selector]) => selector === "div[style]")).toHaveLength(1);
    expect(f.view.overlay.parentElement).toBe(replacement);
    f.view.destroy();
  });

  it("fails closed when the snippet's expected content structure is absent", () => {
    const f = fixture();
    f.scroller.style.margin = "0";
    expect(f.view.attach()).toBe(false);
    expect(f.view.overlay.hidden).toBe(true);
    f.view.destroy();
  });

  it("preserves focus when updating an endpoint (don't briefly hide a focused button)", () => {
    const f = fixture();
    f.view.attach();
    f.view.overlay.hidden = false;
    f.view.place("end", rect, (point) => point);
    const button = f.view.handles.end.button;
    button.focus();
    f.view.place("end", { ...rect, origin: { x: 20, y: 20 } }, (point) => point);
    expect(f.root.activeElement).toBe(button);
    expect(button.style.left).toBe("30px");
    expect(button.style.top).toBe("41px");
    expect(button.getAttribute("aria-label")).toBe("Adjust selection end");
    f.view.destroy();
  });

  it("hides an unplaceable endpoint instead of leaving a stale hit target", () => {
    const f = fixture();
    f.view.place("end", rect, (point) => point);
    expect(f.view.handles.end.button.hidden).toBe(false);
    f.view.place("end", rect, () => null);
    expect(f.view.handles.end.button.hidden).toBe(true);
    f.view.destroy();
  });
});
