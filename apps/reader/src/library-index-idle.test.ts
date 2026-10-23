// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { LibraryIndexIdle } from "./library-index-idle.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("index idle scheduling", () => {
  it("postpones work for reading/input and hidden documents", async () => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const scheduler = new LibraryIndexIdle();
    const ready = vi.fn();
    const pending = scheduler.wait(new AbortController().signal).then(ready);
    await vi.advanceTimersByTimeAsync(2900);
    expect(ready).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).not.toHaveBeenCalled();
    hidden.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(ready).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(ready).toHaveBeenCalledOnce();
    scheduler.dispose();
  });

  it("cancels idle timers on close instead of resuming work later", async () => {
    vi.useFakeTimers();
    const scheduler = new LibraryIndexIdle();
    const controller = new AbortController();
    const pending = scheduler.wait(controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    scheduler.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
