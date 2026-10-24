// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HighlightSavedNotice, highlightUndoMilliseconds } from "./HighlightSavedNotice.js";
import {
  useHighlightUndo,
  type HighlightUndoController,
  type SavedHighlight,
} from "./use-highlight-undo.js";

import type { Annotation } from "@mdbase-reader/core";

const annotation = { id: "a1", annotationType: "highlight", color: "green" } as Annotation;

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe("highlight saved notice", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onUndo = vi.fn();
  const onDismiss = vi.fn();
  const render = async (saved: SavedHighlight | null): Promise<void> =>
    act(async () =>
      root.render(<HighlightSavedNotice saved={saved} onUndo={onUndo} onDismiss={onDismiss} />),
    );
  const saved = (status: SavedHighlight["status"]): SavedHighlight => ({
    id: 1,
    color: "green",
    rect: { x: 40, y: 60, width: 120, height: 20 },
    status,
    annotation: status === "saving" ? null : annotation,
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    onUndo.mockReset();
    onDismiss.mockReset();
    stubReducedMotion(false);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sweeps the ink at once and offers Undo once saved", async () => {
    await render(saved("saving"));
    expect(host.querySelector(".highlight-sweep")).not.toBeNull();
    expect(host.querySelector("button")).toBeNull();
    await render(saved("saved"));
    expect(host.querySelector("[role='status']")?.textContent).toBe("Highlight saved");
    await act(async () => host.querySelector("button")?.click());
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("undoes with Ctrl+Z or Cmd+Z, but not while typing", async () => {
    await render(saved("saved"));
    const press = (target: EventTarget, init: KeyboardEventInit): void => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
      );
    };
    const field = document.createElement("textarea");
    document.body.append(field);
    press(field, { key: "z", ctrlKey: true });
    press(document, { key: "z", ctrlKey: true, shiftKey: true });
    expect(onUndo).not.toHaveBeenCalled();
    press(document, { key: "z", metaKey: true });
    press(document, { key: "Z", ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(2);
    field.remove();
  });

  it("skips the sweep with reduced motion but keeps Undo", async () => {
    stubReducedMotion(true);
    await render(saved("saved"));
    expect(host.querySelector(".highlight-sweep")).toBeNull();
    expect(host.querySelector("button")?.textContent).toBe("Undo");
  });

  it("does not sweep across several lines", async () => {
    await render({ ...saved("saved"), rect: { x: 40, y: 60, width: 300, height: 90 } });
    expect(host.querySelector(".highlight-sweep")).toBeNull();
  });

  it("goes after a while unless pointed at", async () => {
    vi.useFakeTimers();
    await render(saved("saved"));
    await act(async () => vi.advanceTimersByTime(highlightUndoMilliseconds - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("says when a note already embeds the highlight", async () => {
    await render(saved("failed"));
    expect(host.querySelector("[role='status']")?.textContent).toBe(
      "Couldn’t undo: a note embeds this highlight.",
    );
    expect(host.querySelector("button")).toBeNull();
  });
});

describe("useHighlightUndo", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let controller: HighlightUndoController | null = null;

  function Harness({
    remove,
  }: {
    readonly remove: (annotation: Annotation) => Promise<readonly string[]>;
  }): null {
    const value = useHighlightUndo(remove);
    useEffect(() => {
      controller = value;
    });
    return null;
  }

  const mount = async (
    remove: (annotation: Annotation) => Promise<readonly string[]>,
  ): Promise<void> => act(async () => root.render(<Harness remove={remove} />));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    controller = null;
  });

  it("follows a save, then deletes the highlight on Undo", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    await mount(remove);
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    expect(controller!.savedHighlight?.status).toBe("saving");
    await act(async () => tracker.saved(annotation));
    expect(controller!.savedHighlight).toMatchObject({ status: "saved", color: "green" });
    await act(async () => tracker.settled());
    expect(controller!.savedHighlight?.status).toBe("saved");
    await act(async () => controller!.undoSavedHighlight());
    expect(remove).toHaveBeenCalledExactlyOnceWith(annotation);
    expect(controller!.savedHighlight).toBeNull();
  });

  it("clears when the save fails, and reports a highlight a note embeds", async () => {
    const remove = vi.fn().mockResolvedValue(["notes/reading.md"]);
    await mount(remove);
    const failed = await act(async () => controller!.trackHighlight("blue", null));
    await act(async () => failed.settled());
    expect(controller!.savedHighlight).toBeNull();
    const tracker = await act(async () => controller!.trackHighlight("blue", null));
    await act(async () => tracker.saved(annotation));
    await act(async () => controller!.undoSavedHighlight());
    expect(controller!.savedHighlight?.status).toBe("failed");
  });
});
