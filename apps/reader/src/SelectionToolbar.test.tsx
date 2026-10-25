// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes React's queued work */
import { isClaimedShortcut } from "@mdbase-reader/reading-surface";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setHighlightMeaning, setLastHighlightColor } from "./highlight-colors.js";
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

let host: HTMLDivElement;
let sidebarButton: HTMLButtonElement;
let root: ReturnType<typeof createRoot>;
const highlight = vi.fn();
const comment = vi.fn();

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  highlight.mockReset();
  comment.mockReset();
  localStorage.clear();
  setLastHighlightColor("yellow");
  setHighlightMeaning("green", "");
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

describe("selection toolbar shortcuts", () => {
  it("acts on keys forwarded from the document and keys pressed in the toolbar", () => {
    press(document, "h");
    const toolbarButton = host.querySelector<HTMLButtonElement>("[role='toolbar'] button");
    press(toolbarButton!, "c");

    expect(highlight).toHaveBeenCalledWith(selection, "yellow");
    expect(comment).toHaveBeenCalledWith(selection);
  });
});

describe("selection toolbar colours", () => {
  it("leads with five named swatches that save in their colour", async () => {
    const swatches = [...host.querySelectorAll<HTMLButtonElement>(".highlight-swatch")];
    expect(swatches.map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
      "Highlight Yellow",
      "Highlight Green",
      "Highlight Blue",
      "Highlight Pink",
      "Highlight Purple",
    ]);
    expect(host.querySelector("[role='toolbar']")?.firstElementChild?.className).toBe(
      "highlight-swatches",
    );
    expect(swatches[0]?.title).toBe("Highlight Yellow (H or 1)");
    expect(swatches[2]?.title).toBe("Highlight Blue (3)");
    await act(async () => swatches[2]?.click());
    expect(highlight).toHaveBeenCalledWith(selection, "blue");
  });

  it("names swatches with their meanings", async () => {
    setHighlightMeaning("green", "Evidence");
    await act(async () => undefined);
    const green = host.querySelector<HTMLButtonElement>("[data-highlight-color='green']");
    expect(green?.getAttribute("aria-label")).toBe("Highlight Green — Evidence");
  });

  it("chooses colours with 1–5, and H uses the colour chosen last", async () => {
    press(document, "4");
    expect(highlight).toHaveBeenLastCalledWith(selection, "pink");
    press(document, "6");
    expect(highlight).toHaveBeenCalledTimes(1);
    setLastHighlightColor("green");
    await act(async () => undefined);
    press(document, "h");
    expect(highlight).toHaveBeenLastCalledWith(selection, "green");
    expect(
      host.querySelector(".highlight-swatch.is-ringed")?.getAttribute("data-highlight-color"),
    ).toBe("green");
  });

  it("leaves digits pressed on another control or in a field alone", () => {
    press(sidebarButton, "2");
    const field = document.createElement("input");
    document.body.append(field);
    press(field, "3");
    field.remove();
    expect(highlight).not.toHaveBeenCalled();
  });
});

describe("selection toolbar on a highlight", () => {
  const savedHighlight = {
    id: "highlight",
    annotationType: "highlight",
    color: "blue",
    body: "",
    sourceId: "source",
    source: "Source",
    target: selection.value.target,
    path: "annotations/highlight.md",
    recordRevision: "sha256:1",
  };
  const showHighlight = async (
    annotation: Record<string, unknown>,
    recolor: (...args: unknown[]) => void,
  ): Promise<void> => {
    const composer = {
      toolbar: { target: { kind: "annotation", annotation }, rect: null },
      remove: vi.fn(),
      edit: vi.fn(),
      recolor,
      dismissToolbar: vi.fn(),
    } as unknown as AnnotationComposerController;
    await act(async () => root.render(<SelectionToolbarLayer composer={composer} />));
  };

  it("offers no colours for a highlight that is still being saved", async () => {
    const recolor = vi.fn();
    await showHighlight({ ...savedHighlight, path: undefined, recordRevision: undefined }, recolor);
    const swatches = [...host.querySelectorAll<HTMLButtonElement>(".highlight-swatch")];
    expect(swatches.every((swatch) => swatch.disabled)).toBe(true);
    press(document, "2");
    expect(recolor).not.toHaveBeenCalled();
    expect(isClaimedShortcut(new KeyboardEvent("keydown", { key: "2" }), document)).toBe(false);
  });

  it("asks EPUB and web pages to pass 1–5 on while a highlight offers its colours", async () => {
    await showHighlight(savedHighlight, vi.fn());
    expect(isClaimedShortcut(new KeyboardEvent("keydown", { key: "2" }), document)).toBe(true);
    await act(async () => root.render(<></>));
    expect(isClaimedShortcut(new KeyboardEvent("keydown", { key: "2" }), document)).toBe(false);
  });

  it("changes a clicked highlight's colour by swatch or number", async () => {
    const annotation = savedHighlight;
    const recolor = vi.fn();
    await showHighlight(annotation, recolor);
    const blue = host.querySelector<HTMLButtonElement>("[data-highlight-color='blue']");
    expect(blue?.getAttribute("aria-pressed")).toBe("true");
    expect(blue?.getAttribute("aria-label")).toBe("Blue");
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-highlight-color='pink']")?.click(),
    );
    expect(recolor).toHaveBeenLastCalledWith(annotation, "pink");
    press(document, "2");
    expect(recolor).toHaveBeenLastCalledWith(annotation, "green");
    press(document, "h");
    expect(recolor).toHaveBeenCalledTimes(2);
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

describe("selection toolbar source", () => {
  const book = { id: "book", title: "[test] Book", documents: [] };
  const chapter = { id: "chapter", title: "[test] Introduction", documents: [] };
  const render = async (choices: readonly (typeof book)[]): Promise<void> => {
    const composer = {
      toolbar: { target: { kind: "selection", selection }, rect: null },
      ownerControl: {
        ownerId: chapter.id,
        sources: [book, chapter],
        choices,
        pending: false,
        reason: "Inside this chapter’s verified range on the exact file revision.",
        choose: vi.fn(),
      },
      sourceId: "book",
      quoteCitation: null,
      highlight,
      comment,
      edit: vi.fn(),
      remove: vi.fn(),
      dismissToolbar: vi.fn(),
    } as unknown as AnnotationComposerController;
    await act(async () => root.render(<SelectionToolbarLayer composer={composer} />));
  };

  it("offers the source as a quiet chip after the actions when there is a choice", async () => {
    await render([book, chapter]);
    const toolbar = host.querySelector("[role='toolbar']")!;
    const chip = toolbar.querySelector(".annotation-source-chip")!;
    expect(chip).not.toBeNull();
    // Swatches, then Comment on highlight, Copy and Cite, and only then the source.
    const order = [...toolbar.children]
      .filter((child) => !child.matches(".selection-toolbar-divider"))
      .map((child) =>
        child.matches(".highlight-swatches")
          ? "swatches"
          : child === chip
            ? "source"
            : (child.getAttribute("aria-label") ?? child.textContent.trim()),
      );
    expect(order).toEqual([
      "swatches",
      "Comment on highlight",
      "Copy",
      "Cite: copy with citation",
      "source",
    ]);
    const select = chip.querySelector("select")!;
    expect(select.getAttribute("aria-label")).toBe("Save to source");
    expect(select.value).toBe("chapter");
    expect(chip.textContent).toContain("in");
    const description = document.getElementById(select.getAttribute("aria-describedby")!);
    expect(description?.textContent).toContain("verified range");
    expect(toolbar.querySelector(".annotation-owner-control")).toBeNull();
  });

  it("shows no source control when there is only one place to save", async () => {
    await render([chapter]);
    expect(host.querySelector(".annotation-source-chip")).toBeNull();
    expect(host.querySelector("select")).toBeNull();
  });

  it("keeps 1–5 for the swatches while the chip is shown, but not while choosing a source", async () => {
    await render([book, chapter]);
    press(document, "2");
    expect(highlight).toHaveBeenLastCalledWith(selection, "green");
    press(host.querySelector("select")!, "3");
    expect(highlight).toHaveBeenCalledTimes(1);
  });
});

describe("selection toolbar on a highlight's source", () => {
  const book = { id: "book", title: "[test] Book", documents: [] };
  const chapter = { id: "chapter", title: "[test] Introduction", documents: [] };
  const render = async (annotationSource: string): Promise<void> => {
    const annotation = {
      id: "highlight",
      annotationType: "highlight",
      body: "",
      sourceId: annotationSource,
      source: "Source",
      target: selection.value.target,
    };
    const composer = {
      toolbar: { target: { kind: "annotation", annotation }, rect: null },
      ownerControl: { sources: [book, chapter], choices: [book], ownerId: "book" },
      sourceId: "chapter",
      remove: vi.fn(),
      edit: vi.fn(),
      dismissToolbar: vi.fn(),
    } as unknown as AnnotationComposerController;
    await act(async () => root.render(<SelectionToolbarLayer composer={composer} />));
  };

  it("does not name the open source", async () => {
    await render("chapter");
    expect(host.querySelector("[role='toolbar']")?.textContent).not.toContain("Source:");
    expect(host.querySelector(".annotation-source-line")).toBeNull();
  });

  it("names another source, after the actions", async () => {
    await render("book");
    const line = host.querySelector(".annotation-source-line");
    expect(line?.textContent).toContain("Source: [test] Book");
    expect(host.querySelector("[role='toolbar']")?.lastElementChild).toBe(line);
  });
});
