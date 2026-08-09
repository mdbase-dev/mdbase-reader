import { fileId, fileRevision } from "@mdbase-reader/core";
import { describe, expect, it, vi } from "vitest";

import { EmbedPdfSurface } from "./pdf-surface.js";

import type { EmbedPdfRuntime } from "./embedpdf-runtime.js";
import type { AreaSelectionDraft, TextSelectionDraft } from "@mdbase-reader/reading-surface";

function runtimeFixture(): {
  readonly runtime: EmbedPdfRuntime;
  readonly goToPage: ReturnType<typeof vi.fn>;
  emitArea(selection: AreaSelectionDraft): void;
  emitText(selection: TextSelectionDraft): void;
  emitPage(pageIndex: number): void;
} {
  let areaListener: ((selection: AreaSelectionDraft) => void) | undefined;
  let pageListener: ((pageIndex: number) => void) | undefined;
  let textListener: ((selection: TextSelectionDraft) => void) | undefined;
  const goToPage = vi.fn();
  return {
    runtime: {
      currentPageIndex: () => 2,
      goToPage,
      beginAreaSelection: vi.fn(),
      cancelAreaSelection: vi.fn(),
      clearTextSelection: vi.fn(),
      onAreaSelected: (listener) => {
        areaListener = listener;
        return () => {
          areaListener = undefined;
        };
      },
      onPageChanged: (listener) => {
        pageListener = listener;
        return () => {
          pageListener = undefined;
        };
      },
      onTextSelected: (listener) => {
        textListener = listener;
        return () => {
          textListener = undefined;
        };
      },
      destroy: vi.fn(),
    },
    goToPage,
    emitArea: (selection) => areaListener?.(selection),
    emitText: (selection) => textListener?.(selection),
    emitPage: (pageIndex) => pageListener?.(pageIndex),
  };
}

const document = {
  document: {
    fileId: fileId("file-1"),
    file: "[[files/example.pdf]]",
    revision: fileRevision("sha256:a8ca22"),
  },
  mediaType: "application/pdf",
  url: "https://files.example/document.pdf",
} as const;

describe("EmbedPdfSurface", () => {
  it("translates zero-based Reader locations to the EmbedPDF runtime", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);

    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
    await expect(surface.goTo({ kind: "pdf", pageIndex: 7 })).resolves.toBe(true);
    expect(fixture.goToPage).toHaveBeenCalledWith(7);
    fixture.emitPage(8);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 8 });
  });

  it("forwards durable capture data without persisting renderer state", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.areaSelection?.selections.subscribe(listener);
    const selection: AreaSelectionDraft = {
      pageIndex: 4,
      rect: { x: 10, y: 20, width: 30, height: 40 },
      coordinateProfile: "embedpdf-pdf-points-v1",
      image: new Blob(["png"]),
      imageType: "image/png",
      scale: 4,
      withAnnotations: false,
    };

    fixture.emitArea(selection);
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("publishes text selections with quote and PDF geometry", () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);
    const listener = vi.fn();
    surface.capabilities.textSelection?.selections.subscribe(listener);
    const selection: TextSelectionDraft = {
      target: {
        quote: { exact: "Selected text" },
        pdf: {
          pageIndex: 4,
          coordinateSpace: {
            profile: "embedpdf-selection-page-points-v1",
            box: "crop",
            origin: "top_left",
          },
          quadPoints: [[10, 20, 40, 20, 10, 60, 40, 60]],
        },
      },
      locator: { kind: "pdf", pageIndex: 4 },
    };

    fixture.emitText(selection);
    expect(listener).toHaveBeenCalledWith(selection);
  });

  it("rejects incompatible locators and releases runtime subscriptions", async () => {
    const fixture = runtimeFixture();
    const surface = new EmbedPdfSurface(document, fixture.runtime);

    await expect(surface.goTo({ kind: "epub", locator: { href: "chapter.xhtml" } })).resolves.toBe(
      false,
    );
    await surface.destroy();
    fixture.emitPage(9);
    expect(surface.currentLocation()).toEqual({ kind: "pdf", pageIndex: 2 });
  });
});
