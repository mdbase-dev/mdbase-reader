// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installLongPressSelection } from "./pdf-long-press-selection.js";

function touch(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 7,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

function setup(): {
  readonly page: HTMLElement;
  readonly modes: { select: ReturnType<typeof vi.fn>; pan: ReturnType<typeof vi.fn> };
  readonly seen: string[];
  readonly changeSelection: (selected: boolean) => void;
  readonly stop: () => void;
} {
  const host = document.createElement("div");
  const page = document.createElement("div");
  host.append(page);
  document.body.append(host);
  const seen: string[] = [];
  // The viewer's own handlers, which the replayed events must reach.
  page.addEventListener("pointerdown", () => seen.push("pointerdown"));
  page.addEventListener("dblclick", () => seen.push("dblclick"));
  page.addEventListener("click", () => seen.push("click"));
  const modes = { select: vi.fn(), pan: vi.fn() };
  let listener: (event: { readonly selection: unknown }) => void = () => undefined;
  const stop = installLongPressSelection({
    host,
    modes,
    selection: {
      onSelectionChange: (next) => {
        listener = next;
        return () => undefined;
      },
    },
  });
  return {
    page,
    modes,
    seen,
    changeSelection: (selected) => listener({ selection: selected ? {} : null }),
    stop,
  };
}

describe("installLongPressSelection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("leaves a swipe to scroll", () => {
    const { page, modes, seen } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    page.dispatchEvent(touch("pointermove", 100, 360));
    vi.advanceTimersByTime(600);
    page.dispatchEvent(touch("pointerup", 100, 300));
    expect(modes.select).not.toHaveBeenCalled();
    expect(seen).toEqual(["pointerdown"]);
  });

  it("starts selecting where a finger holds, replaying the press for the viewer", () => {
    const { page, modes, seen } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    vi.advanceTimersByTime(500);
    expect(modes.select).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["pointerdown", "pointerdown"]);
  });

  it("blocks scrolling while a hold drags a selection", () => {
    const { page } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    vi.advanceTimersByTime(500);
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    page.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
  });

  it("selects the word when the finger lifts without dragging, swallowing its click", () => {
    const { page, seen } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    vi.advanceTimersByTime(500);
    page.dispatchEvent(touch("pointerup", 102, 401));
    page.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(seen).toEqual(["pointerdown", "pointerdown", "dblclick"]);
  });

  it("pans again once the selection it made is dismissed", () => {
    const { page, modes, changeSelection } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    vi.advanceTimersByTime(500);
    changeSelection(true);
    page.dispatchEvent(touch("pointerup", 100, 400));
    vi.advanceTimersByTime(50);
    expect(modes.pan).not.toHaveBeenCalled();
    changeSelection(false);
    expect(modes.pan).toHaveBeenCalledTimes(1);
  });

  it("pans at once after a hold that selected nothing", () => {
    const { page, modes } = setup();
    page.dispatchEvent(touch("pointerdown", 100, 400));
    vi.advanceTimersByTime(500);
    page.dispatchEvent(touch("pointerup", 100, 400));
    vi.advanceTimersByTime(50);
    expect(modes.pan).toHaveBeenCalledTimes(1);
  });
});
