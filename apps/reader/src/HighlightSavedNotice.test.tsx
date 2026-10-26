// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { isClaimedShortcut } from "@mdbase-reader/reading-surface";
import { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HighlightSavedNotice,
  HighlightSweep,
  highlightUndoMilliseconds,
} from "./HighlightSavedNotice.js";
import { createRoot } from "./testing/i18n.js";
import {
  useHighlightUndo,
  type HighlightUndoController,
  type SavedHighlight,
} from "./use-highlight-undo.js";

import type { Annotation } from "@mdbase-reader/core";

const annotation = {
  id: "a1",
  sourceId: "source-a",
  annotationType: "highlight",
  color: "green",
  body: "",
  tags: [],
} as unknown as Annotation;

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

let noticeHost: HTMLDivElement;
let noticeRoot: ReturnType<typeof createRoot>;
const onUndo = vi.fn();
const onDismiss = vi.fn();
const render = async (saved: SavedHighlight | null, overlaid = false): Promise<void> =>
  act(async () =>
    noticeRoot.render(
      <>
        <HighlightSweep saved={saved} />
        <HighlightSavedNotice
          saved={saved}
          overlaid={overlaid}
          onUndo={onUndo}
          onDismiss={onDismiss}
        />
      </>,
    ),
  );
const pressEscape = (target: EventTarget, prevented = false): void => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  if (prevented) {
    event.preventDefault();
  }
  target.dispatchEvent(event);
};
const saved = (status: SavedHighlight["status"]): SavedHighlight => ({
  id: 1,
  color: "green",
  rect: { x: 40, y: 60, width: 120, height: 20 },
  status,
  annotation: status === "saving" ? null : annotation,
  undoable: true,
});

/** Mounts the sweep and the notice into a fresh host for each test. */
function mountNotices(): void {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    onUndo.mockReset();
    onDismiss.mockReset();
    stubReducedMotion(false);
    noticeHost = document.createElement("div");
    document.body.append(noticeHost);
    noticeRoot = createRoot(noticeHost);
  });
  afterEach(async () => {
    await act(async () => noticeRoot.unmount());
    noticeHost.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}

describe("highlight saved notice", () => {
  mountNotices();

  it("sweeps the ink at once and offers Undo once saved", async () => {
    await render(saved("saving"));
    expect(noticeHost.querySelector(".highlight-sweep")).not.toBeNull();
    expect(noticeHost.querySelector("button")).toBeNull();
    // The live region is there, empty, before its message arrives, so the message is announced.
    const status = noticeHost.querySelector("[role='status']");
    expect(status?.textContent).toBe("");
    await render(saved("saved"));
    expect(noticeHost.querySelector("[role='status']")).toBe(status);
    expect(noticeHost.querySelector("[role='status']")?.textContent).toBe("Highlight saved");
    await act(async () =>
      noticeHost.querySelector<HTMLButtonElement>(".highlight-saved-undo")?.click(),
    );
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

  it("asks EPUB and web pages to pass Undo on only while it is offered", async () => {
    const undoKey = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
    await render(saved("saving"));
    expect(isClaimedShortcut(undoKey, document)).toBe(false);
    await render(saved("saved"));
    expect(isClaimedShortcut(undoKey, document)).toBe(true);
    await render(null);
    expect(isClaimedShortcut(undoKey, document)).toBe(false);
  });

  it("skips the sweep with reduced motion but keeps Undo", async () => {
    stubReducedMotion(true);
    await render(saved("saved"));
    expect(noticeHost.querySelector(".highlight-sweep")).toBeNull();
    expect(noticeHost.querySelector(".highlight-saved-undo")?.textContent).toBe("Undo");
  });

  it("does not sweep across several lines", async () => {
    await render({ ...saved("saved"), rect: { x: 40, y: 60, width: 300, height: 90 } });
    expect(noticeHost.querySelector(".highlight-sweep")).toBeNull();
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
    await render(saved("embedded"));
    expect(noticeHost.querySelector("[role='status']")?.textContent).toBe(
      "Couldn’t undo: a note embeds this highlight.",
    );
    expect(noticeHost.querySelector(".highlight-saved-undo")).toBeNull();
    expect(noticeHost.querySelector("button[aria-label='Dismiss']")).not.toBeNull();
  });

  it("gives a failed deletion its own message", async () => {
    await render({ ...saved("failed"), problem: "The collection is offline." });
    expect(noticeHost.querySelector("[role='status']")?.textContent).toBe(
      "Couldn’t undo: The collection is offline.",
    );
    expect(noticeHost.querySelector(".highlight-saved-undo")).toBeNull();
  });
});

describe("dismissing the highlight saved notice", () => {
  mountNotices();

  it("never sits over the page: the notice is not placed by the passage", async () => {
    await render(saved("saved"));
    const notice = noticeHost.querySelector<HTMLElement>(".highlight-saved");
    expect(notice).not.toBeNull();
    expect(notice?.classList.contains("is-anchored")).toBe(false);
    expect(notice?.getAttribute("style")).toBeNull();
    // Only the sweep, which tints the passage itself, is drawn at the passage.
    expect(notice?.closest(".highlight-sweep-layer")).toBeNull();
  });

  it("closes with its dismiss button", async () => {
    await render(saved("saved"));
    const dismiss = noticeHost.querySelector<HTMLButtonElement>("button[aria-label='Dismiss']");
    expect(dismiss?.title).toBe("Dismiss (Esc)");
    await act(async () => dismiss?.click());
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("closes on Esc, unless something else took the key or the reader is typing", async () => {
    await render(saved("saved"));
    const field = document.createElement("textarea");
    document.body.append(field);
    pressEscape(field);
    pressEscape(document, true);
    expect(onDismiss).not.toHaveBeenCalled();
    pressEscape(document);
    expect(onDismiss).toHaveBeenCalledOnce();
    field.remove();
  });

  it("leaves Esc to a toolbar, composer or dialog that is open, so one press closes one thing", async () => {
    await render(saved("saved"), true);
    pressEscape(document);
    expect(onDismiss).not.toHaveBeenCalled();
    await render(saved("saved"));
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.append(dialog);
    pressEscape(document);
    expect(onDismiss).not.toHaveBeenCalled();
    dialog.remove();
    pressEscape(document);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("goes, and stops answering Ctrl+Z, once Undo is withdrawn, while the sweep plays on", async () => {
    await render({ ...saved("saved"), undoable: false });
    expect(noticeHost.querySelector(".highlight-saved")).toBeNull();
    expect(noticeHost.querySelector(".highlight-sweep")).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("waits while pointed at, then goes once the pointer leaves", async () => {
    vi.useFakeTimers();
    await render(saved("saved"));
    const notice = noticeHost.querySelector<HTMLElement>(".highlight-saved")!;
    await act(async () => notice.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(highlightUndoMilliseconds * 2));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => notice.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(highlightUndoMilliseconds));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("useHighlightUndo", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let controller: HighlightUndoController | null = null;

  type Remove = (annotation: Annotation) => Promise<readonly string[]>;
  const firstScope = ["source-a", "document-a"] as const;

  function Harness({
    remove,
    annotations = [],
    scope = firstScope,
  }: {
    readonly remove: Remove;
    readonly annotations?: readonly Annotation[];
    readonly scope?: readonly unknown[];
  }): null {
    const value = useHighlightUndo({ annotations, scope, remove });
    useEffect(() => {
      controller = value;
    });
    return null;
  }

  const mount = async (
    remove: Remove,
    options: {
      readonly annotations?: readonly Annotation[];
      readonly scope?: readonly unknown[];
    } = {},
  ): Promise<void> => act(async () => root.render(<Harness remove={remove} {...options} />));

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
    expect(controller!.savedHighlight?.status).toBe("embedded");
  });

  it("deletes the highlight as it is now, after a recolour", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    await mount(remove);
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    await act(async () => tracker.saved(annotation));
    const recoloured = { ...annotation, color: "pink", recordRevision: "r2" } as Annotation;
    await mount(remove, { annotations: [recoloured] });
    expect(controller!.savedHighlight?.undoable).toBe(true);
    await act(async () => controller!.undoSavedHighlight());
    expect(remove).toHaveBeenCalledExactlyOnceWith(recoloured);
  });

  it("never deletes a comment: Undo ends once one is written or saved", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    await mount(remove);
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    await act(async () => tracker.saved(annotation));
    const commented = { ...annotation, body: "A thought", recordRevision: "r2" } as Annotation;
    await mount(remove, { annotations: [commented] });
    // For good: the book's annotations reloading, without it for a moment, brings no Undo back.
    await mount(remove, { annotations: [] });
    expect(controller!.savedHighlight?.undoable).toBe(false);
    await act(async () => controller!.undoSavedHighlight());
    expect(remove).not.toHaveBeenCalled();
  });

  it("withdraws Undo as editing begins, before anything is saved", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    await mount(remove, { annotations: [annotation] });
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    await act(async () => tracker.saved(annotation));
    await act(async () => controller!.withdrawUndo("another" as Annotation["id"]));
    expect(controller!.savedHighlight?.undoable).toBe(true);
    await act(async () => controller!.withdrawUndo(annotation.id));
    expect(controller!.savedHighlight).toMatchObject({ status: "saved", undoable: false });
    await act(async () => controller!.undoSavedHighlight());
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports a failed deletion apart from an embedding note", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("The collection is offline."));
    await mount(remove);
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    await act(async () => tracker.saved(annotation));
    await act(async () => controller!.undoSavedHighlight());
    expect(controller!.savedHighlight).toMatchObject({
      status: "failed",
      problem: "The collection is offline.",
    });
  });

  it("stops offering Undo once the reader leaves the source or document", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    await mount(remove);
    const tracker = await act(async () => controller!.trackHighlight("green", null));
    await act(async () => tracker.saved(annotation));
    await mount(remove, { scope: ["source-a", "document-b"] });
    expect(controller!.savedHighlight).toBeNull();
    await act(async () => controller!.undoSavedHighlight());
    // Coming back does not bring the offer back either.
    await mount(remove, { scope: firstScope });
    expect(controller!.savedHighlight).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
