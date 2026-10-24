// @vitest-environment happy-dom
import {
  collectionId,
  fileId,
  fileRevision,
  sourceId,
  type SourceSummary,
} from "@mdbase-reader/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContinueReading } from "./ContinueReading.js";

import type * as ThumbnailModule from "./source-thumbnail.js";

const loadSourceThumbnail = vi.hoisted(() => vi.fn());
vi.mock("./source-thumbnail.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ThumbnailModule>()),
  loadSourceThumbnail,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: ReturnType<typeof createRoot> | undefined;
beforeEach(() => {
  loadSourceThumbnail.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const paper: SourceSummary = {
  collectionId: collectionId("test"),
  id: sourceId("attention"),
  path: "attention.md",
  title: "Attention Is All You Need",
  creators: ["Ashish Vaswani"],
  tags: [],
  published: 2017,
  reading: {
    status: "reading",
    progress: 0.68,
    position: { kind: "pdf", pageIndex: 6 },
    lastOpenedAt: "2026-10-24T09:00:00+10:00" as never,
  },
  documents: [
    {
      fileId: fileId("attention"),
      file: "[[attention.pdf]]",
      mediaType: "application/pdf",
      revision: fileRevision(`sha256:${"c".repeat(64)}`),
      role: "primary",
    },
  ],
};

function render(sources: readonly SourceSummary[], readFile?: () => Promise<never>): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ContinueReading sources={sources} onOpen={vi.fn()} {...(readFile ? { readFile } : {})} />,
    ),
  );
}

describe("Continue reading cards", () => {
  it("shows the title, people and year, and where the reader stopped", () => {
    render([paper]);
    const card = document.querySelector<HTMLButtonElement>(".continue-reading-card");
    expect(card?.getAttribute("aria-label")).toBe("Continue reading Attention Is All You Need");
    expect(card?.querySelector(".continue-reading-byline")?.textContent).toBe(
      "Ashish Vaswani · 2017",
    );
    expect(card?.querySelector(".continue-reading-progress")?.textContent).toBe("Page 7 · 68%");
    expect(card?.querySelector<HTMLElement>(".continue-reading-bar i")?.style.width).toBe("68%");
  });

  it("keeps a typographic placeholder when thumbnails cannot be read", () => {
    render([paper]);
    const thumbnail = document.querySelector(".source-thumbnail");
    expect(thumbnail?.getAttribute("aria-hidden")).toBe("true");
    expect(thumbnail?.querySelector(".source-thumbnail-title")?.textContent).toBe(paper.title);
    expect(thumbnail?.querySelector(".source-thumbnail-format")?.textContent).toBe("PDF");
    act(() => {
      vi.runAllTimers();
    });
    expect(loadSourceThumbnail).not.toHaveBeenCalled();
  });

  it("loads a first-page render once the card is on screen and the browser is idle", async () => {
    let reveal: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reveal = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    loadSourceThumbnail.mockResolvedValue({ url: "blob:page", pageCount: 11 });
    const readFile = vi.fn<() => Promise<never>>();
    render([paper], readFile);
    act(() => {
      vi.runAllTimers();
    });
    expect(loadSourceThumbnail).not.toHaveBeenCalled();
    act(() => reveal?.([{ isIntersecting: true }]));
    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });
    expect(loadSourceThumbnail).toHaveBeenCalledOnce();
    expect(document.querySelector(".source-thumbnail img")?.getAttribute("src")).toBe("blob:page");
    expect(document.querySelector(".continue-reading-progress")?.textContent).toBe(
      "Page 7 of 11 · 68%",
    );
  });

  it("leaves out finished sources and keeps three at most", () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...paper,
      id: sourceId(`s${String(index)}`),
    }));
    render([{ ...paper, id: sourceId("done"), reading: { status: "finished" } }, ...many]);
    expect(document.querySelectorAll(".continue-reading-card")).toHaveLength(3);
  });
});
