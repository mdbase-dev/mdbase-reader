// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SelectionToolbarLayer } from "./SelectionToolbar.js";

import type { AnnotationComposerController } from "./use-annotation-composer.js";
import type { TextComposerSelection } from "./use-selection-toolbar.js";

const selection = {
  kind: "text",
  value: {
    target: { quote: { exact: "A selected passage" } },
    locator: { kind: "epub", cfi: "epubcfi(/6/2)" },
  },
} as unknown as TextComposerSelection;

describe("selection toolbar shortcuts", () => {
  let host: HTMLDivElement;
  let sidebarButton: HTMLButtonElement;
  let root: ReturnType<typeof createRoot>;
  const highlight = vi.fn();
  const comment = vi.fn();

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    highlight.mockReset();
    comment.mockReset();
    sidebarButton = document.createElement("button");
    sidebarButton.textContent = "Sources";
    host = document.createElement("div");
    document.body.append(sidebarButton, host);
    root = createRoot(host);
    const composer = {
      toolbar: { target: { kind: "selection", selection }, rect: null },
      ownerControl: undefined,
      quoteCitation: null,
      highlight,
      comment,
      edit: vi.fn(),
      remove: vi.fn(),
      dismissToolbar: vi.fn(),
    } as unknown as AnnotationComposerController;
    await act(async () => root.render(<SelectionToolbarLayer composer={composer} />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    sidebarButton.remove();
  });

  const press = (target: EventTarget, key: string): void => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  };

  it("acts on keys forwarded from the document and keys pressed in the toolbar", () => {
    press(document, "h");
    const toolbarButton = host.querySelector<HTMLButtonElement>("[role='toolbar'] button");
    press(toolbarButton!, "c");

    expect(highlight).toHaveBeenCalledWith(selection);
    expect(comment).toHaveBeenCalledWith(selection);
  });

  it("leaves keys pressed on another control to that control", () => {
    press(sidebarButton, "h");
    press(sidebarButton, "c");

    expect(highlight).not.toHaveBeenCalled();
    expect(comment).not.toHaveBeenCalled();
  });

  it("keeps highlight deletion inline and requires two clicks with outcome labels", async () => {
    const annotation = {
      id: "highlight",
      body: "",
      sourceId: "source",
      source: "Source",
      target: selection.value.target,
    };
    const remove = vi.fn().mockResolvedValue([]);
    const composer = {
      toolbar: { target: { kind: "annotation", annotation }, rect: null },
      remove,
      edit: vi.fn(),
      dismissToolbar: vi.fn(),
    } as unknown as AnnotationComposerController;
    await act(async () => root.render(<SelectionToolbarLayer composer={composer} />));
    const deleteButton = (): HTMLButtonElement =>
      host.querySelector<HTMLButtonElement>('[aria-label="Delete highlight"]')!;
    expect(deleteButton().textContent.trim()).toBe("Delete highlight");
    await act(async () => deleteButton().click());
    expect(remove).not.toHaveBeenCalled();
    expect(deleteButton().className).toBe("is-danger");
    expect(deleteButton().textContent).toBe("Delete highlight");
    expect(host.querySelector("dialog")).toBeNull();
    await act(async () => deleteButton().click());
    expect(remove).toHaveBeenCalledExactlyOnceWith(annotation);
  });

  it("names the selection action and tooltip Comment on highlight", () => {
    const action = [...host.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Comment on highlight",
    );
    expect(action?.title).toBe("Comment on highlight (C)");
  });

  it("names the citation button with its visible word", () => {
    const cite = [...host.querySelectorAll("button")].find((button) =>
      button.textContent.includes("Cite"),
    );

    expect(cite?.getAttribute("aria-label")).toBe("Cite: copy with citation");
  });
});
