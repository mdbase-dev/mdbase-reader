// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/require-await -- async act flushes queued React effects */
import { act, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatCitation } from "./citation-renderer.js";
import { partSource } from "./source-parts.fixtures.js";
import { SourcePartCreation, useSourcePartCreation } from "./SourcePartCreation.js";

import type * as ChapterOutlineModule from "./chapter-outline.js";
import type { ChapterOutline } from "./chapter-outline.js";
import type { ReaderWorkspaceGateway } from "./workspace-model.js";

const readOutline = vi.hoisted(() => vi.fn());
vi.mock("./chapter-outline.js", async (original) => ({
  ...(await original<typeof ChapterOutlineModule>()),
  readChapterOutline: readOutline,
}));
vi.mock("./citation-renderer.js", () => ({
  formatCitation: vi
    .fn()
    .mockResolvedValue("Bea Writer. Outline chapter. In book (pp. 41–67). Book press."),
}));

beforeEach(() => {
  readOutline.mockResolvedValue({
    pageCount: 10,
    proposals: [
      {
        key: "stable",
        title: "Outline chapter",
        level: 0,
        range: { kind: "pages", start: 1, end: 9 },
      },
    ],
  });
});

const book = partSource("book");
function Launcher(): JSX.Element {
  const open = useSourcePartCreation();
  return (
    <button type="button" onClick={() => open?.(book)}>
      Add chapters
    </button>
  );
}

it("creates nothing during preview or cancel, restores focus, and creates only after explicit confirmation", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const createSourcePart = vi.fn().mockResolvedValue(partSource("created", "book"));
  const gateway = {
    source: vi.fn().mockResolvedValue(book),
    library: vi.fn().mockResolvedValue({ sources: [book] }),
    createSourcePart,
  } as unknown as ReaderWorkspaceGateway;
  await act(async () => {
    root.render(
      <SourcePartCreation gateway={gateway} onCreated={vi.fn()}>
        <Launcher />
      </SourcePartCreation>,
    );
  });
  const launch = host.querySelector("button");
  launch?.focus();
  await act(async () => {
    launch?.click();
  });
  expect(host.querySelector("dialog")?.open).toBe(true);
  expect(createSourcePart).not.toHaveBeenCalled();
  const cancel = (): HTMLButtonElement | undefined =>
    [...host.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
  await act(async () => {
    cancel()?.click();
  });
  expect(createSourcePart).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(launch);
  await act(async () => {
    launch?.click();
  });
  await act(async () => {
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
  });
  expect(createSourcePart).not.toHaveBeenCalled();
  await act(async () => {
    host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  });
  expect(createSourcePart).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: "Outline chapter",
      document: expect.objectContaining({
        fileId: book.documents[0]?.fileId,
        range: { kind: "pages", start: 1, end: 9 },
      }),
    }),
  );
  expect(host.querySelector("dialog")).toBeNull();
  act(() => root.unmount());
  host.remove();
});

let host = document.createElement("div");
let root: ReturnType<typeof createRoot> | undefined;
const createSourcePart = vi.fn().mockResolvedValue(partSource("created", "book"));

async function open(outline?: ChapterOutline): Promise<void> {
  if (outline) {
    readOutline.mockResolvedValueOnce(outline);
  }
  createSourcePart.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  const renderedRoot = createRoot(host);
  root = renderedRoot;
  const gateway = {
    source: vi.fn().mockResolvedValue(book),
    library: vi.fn().mockResolvedValue({ sources: [book] }),
    createSourcePart,
  } as unknown as ReaderWorkspaceGateway;
  await act(async () =>
    renderedRoot.render(
      <SourcePartCreation gateway={gateway} onCreated={vi.fn()}>
        <Launcher />
      </SourcePartCreation>,
    ),
  );
  await act(async () => host.querySelector("button")?.click());
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host.remove();
});

function field(label: string, within: Element = host): HTMLInputElement {
  const wrapper = [...within.querySelectorAll("label")].find((element) =>
    element.textContent.startsWith(label),
  );
  const input = wrapper?.querySelector("input");
  if (!input) {
    throw new Error(`Missing field: ${label}`);
  }
  return input;
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function selectAndSubmit(): Promise<void> {
  await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
  await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
}

describe("page entry", () => {
  it("displays viewer page numbers and converts inclusive endpoints only when entering them", async () => {
    await open();
    expect(field("Start page").value).toBe("2");
    expect(field("End page").value).toBe("10");
    expect(field("Start page").min).toBe("1");
    expect(field("End page").max).toBe("10");
    expect(host.textContent).toContain("of 10 pages");
    await type(field("Start page"), "1");
    await type(field("End page"), "10");
    await selectAndSubmit();
    expect(createSourcePart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        document: expect.objectContaining({ range: { kind: "pages", start: 0, end: 9 } }),
      }),
    );
    expect(createSourcePart.mock.calls[0]?.[0].citation.page).toBeUndefined();
  });

  it("starts manual page fields empty so typing does not append to a zero", async () => {
    await open();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Add a chapter manually")
        ?.click(),
    );
    const manual = [...host.querySelectorAll(".chapter-choice")].at(-1)!;
    expect(field("Start page", manual).value).toBe("");
    expect(field("End page", manual).value).toBe("");
    await type(field("Chapter title", manual), "Manual chapter");
    await type(field("Start page", manual), "3");
    await type(field("End page", manual), "5");
    await act(async () => host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    expect(createSourcePart).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        title: "Manual chapter",
        document: expect.objectContaining({ range: { kind: "pages", start: 2, end: 4 } }),
      }),
    );
  });

  it.each([
    ["0", "10", "Start page must be a whole number from 1 to 10."],
    ["1", "11", "End page must be a whole number from 1 to 10."],
    ["5", "4", "End page must be the same as or after the start page."],
    ["", "10", "Start page must be a whole number from 1 to 10."],
    ["1.5", "10", "Start page must be a whole number from 1 to 10."],
  ])("rejects pages %s–%s with a friendly message and no writes", async (start, end, message) => {
    await open();
    await type(field("Start page"), start);
    await type(field("End page"), end);
    await selectAndSubmit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(field("Start page").getAttribute("aria-describedby")).toBe("stable-range-problem");
    expect(createSourcePart).not.toHaveBeenCalled();
  });

  it("waits for the end page before reporting a problem", async () => {
    await open();
    await type(field("Start page"), "3");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(field("End page").getAttribute("aria-invalid")).toBe("false");
  });
});

describe("readable chapter previews", () => {
  it("previews the title, viewer and printed pages, chapter authors, formatted citation and parent book without persistence details", async () => {
    await open();
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await type(field("Chapter authors"), "Bea Writer");
    await type(field("Printed page labels"), "41–67");
    const preview = host.querySelector(".chapter-preview");
    expect(preview?.querySelector("h3")?.textContent).toBe("Outline chapter");
    expect([...preview!.querySelectorAll("dd")].map((element) => element.textContent)).toEqual([
      "book",
      "2–10 of 10 pages",
      "41–67",
      "Bea Writer",
    ]);
    expect(preview?.textContent).toContain(
      "Bea Writer. Outline chapter. In book (pp. 41–67). Book press.",
    );
    expect(formatCitation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Outline chapter",
        "container-title": "book",
        author: [{ literal: "Bea Writer" }],
        page: "41–67",
      }),
      "apa",
      "en-US",
    );
    expect(host.textContent).toContain("1 chapter selected.");
    expect(host.textContent).not.toContain("1 chapters");
    expect(host.querySelector("summary")?.textContent).toBe("Preview 1 chapter and its citation");
    expect(host.querySelector("pre")).toBeNull();
    expect(preview?.textContent).not.toMatch(/sha256|book-file|fileId|revision|src_stable/u);
    expect(createSourcePart).not.toHaveBeenCalled();
  });

  it("describes EPUB sections in reading order and previews them without spine jargon", async () => {
    await open({
      spine: ["one.xhtml", "two.xhtml"],
      proposals: [
        {
          key: "epub",
          title: "First chapter",
          level: 0,
          range: { kind: "epub-spine", start: "one.xhtml", end: "two.xhtml" },
        },
      ],
    });
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    expect(host.textContent).toContain("Start section");
    expect(host.textContent).toContain("End section");
    expect(host.textContent).toContain("1–2 of 2 sections (included in full)");
    expect(host.textContent).not.toMatch(/spine|CFI|resource/u);
    // An untitled section is numbered; its file stays out of the option text.
    const untitled = host.querySelector<HTMLOptionElement>('option[value="two.xhtml"]');
    expect(untitled?.textContent).toBe("2. Section 2");
    expect(untitled?.title).toBe("two.xhtml");
  });
});

describe("write UI rollout gate", () => {
  it("does not expose creation when disabled", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const gateway = { createSourcePart: vi.fn() } as unknown as ReaderWorkspaceGateway;
    await act(async () => {
      root.render(
        <SourcePartCreation enabled={false} gateway={gateway} onCreated={vi.fn()}>
          <Launcher />
        </SourcePartCreation>,
      );
    });
    await act(async () => {
      host.querySelector("button")?.click();
    });
    expect(host.querySelector("dialog")).toBeNull();
    act(() => root.unmount());
  });
});
